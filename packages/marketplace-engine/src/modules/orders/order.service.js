const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../../utils/db');
const logger = require('../../utils/logger');
const config = require('../../config');
const { paginate } = require('../../utils/pagination');
const { generateOrderNumber } = require('./order-number');
const { validateTransition, getAllowedTransitions } = require('./order-state-machine');
const walletService = require('../wallets/wallet.service');
const installmentService = require('../installments/installment.service');
const productService = require('../products/product.service');
const paystack = require('../payments/paystack.provider');
const PaystackProvider = require('../payments/paystack.provider').constructor;
const {
  OrderStatus,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
  BNPLProvider,
  NotFoundError,
  ValidationError,
  validateAmount,
  bpsOf,
  successResponse,
} = require('@ejua/shared');

class OrderService {
  constructor() {
    this.db = getDb();
  }

  // ─── CART → ORDER CREATION ───────────────────

  /**
   * Create an order from a cart.
   * Validates stock, snapshots prices, decrements inventory,
   * and generates a human-readable order number.
   *
   * @param {Object} params
   * @param {Array} params.items - [{ product_id, variant_id?, quantity }]
   * @returns {Object} The created order with items
   */
  async createOrder(tenantId, customerId, { items, shipping_address, notes }) {
    if (!items || items.length === 0) {
      throw new ValidationError('Order must have at least one item', 'items');
    }

    return this.db.transaction(async (trx) => {
      let subtotal = 0;
      let currencyCode = null;
      const orderItems = [];

      // Validate each item, snapshot price, decrement stock
      for (const item of items) {
        const product = await trx('products')
          .where({ id: item.product_id, tenant_id: tenantId, is_active: true })
          .first();

        if (!product) throw new NotFoundError('Product', item.product_id);

        // Set currency from first item; all items must match
        if (!currencyCode) {
          currencyCode = product.currency_code;
        } else if (product.currency_code !== currencyCode) {
          throw new ValidationError('All items must use the same currency', 'currency');
        }

        // Determine price (variant override or product price)
        let unitPrice = product.sale_price || product.price;
        let variantId = null;

        if (item.variant_id) {
          const variant = await trx('product_variants')
            .where({ id: item.variant_id, product_id: product.id, is_active: true })
            .first();
          if (!variant) throw new NotFoundError('Variant', item.variant_id);
          if (variant.price_override) unitPrice = variant.price_override;
          variantId = variant.id;
        }

        const quantity = Math.max(1, parseInt(item.quantity) || 1);
        const totalPrice = unitPrice * quantity;
        subtotal += totalPrice;

        // Decrement stock (throws if insufficient)
        await productService.decrementStock(trx, product.id, variantId, quantity);

        orderItems.push({
          id: uuidv4(),
          product_id: product.id,
          variant_id: variantId,
          product_name: product.name,
          unit_price: unitPrice,
          quantity,
          total_price: totalPrice,
        });
      }

      // Get vendor (all items must be from the same vendor for v1)
      const firstProduct = await trx('products')
        .where({ id: items[0].product_id })
        .first();

      const vendorId = firstProduct.vendor_id;

      // Verify all items from same vendor
      for (const item of items) {
        const p = await trx('products').where({ id: item.product_id }).first();
        if (p.vendor_id !== vendorId) {
          throw new ValidationError(
            'All items must be from the same vendor. Multi-vendor carts will be supported in a future update.',
            'vendor_id'
          );
        }
      }

      // Generate order number
      const orderNumber = await generateOrderNumber(tenantId, trx);

      // Create order
      const [order] = await trx('orders')
        .insert({
          id: uuidv4(),
          tenant_id: tenantId,
          customer_id: customerId,
          vendor_id: vendorId,
          order_number: orderNumber,
          status: OrderStatus.CREATED,
          subtotal,
          total_amount: subtotal, // No shipping/tax for v1
          currency_code: currencyCode,
          shipping_address: shipping_address || {},
          notes: notes || null,
        })
        .returning('*');

      // Insert order items with order_id
      const itemRecords = orderItems.map((item) => ({
        ...item,
        order_id: order.id,
      }));
      const savedItems = await trx('order_items').insert(itemRecords).returning('*');

      logger.info({
        orderId: order.id,
        orderNumber,
        items: savedItems.length,
        total: subtotal,
        currency: currencyCode,
      }, 'Order created');

      return { order, items: savedItems };
    });
  }

  // ─── CHECKOUT: PAYSTACK (MoMo / Card) ────────

  /**
   * Initialize a Paystack payment for an order.
   * Returns an authorization_url the frontend redirects the customer to.
   *
   * @param {string} orderId
   * @param {Object} opts
   * @param {string} opts.email - Customer email for Paystack
   * @param {string[]} [opts.channels] - e.g., ['mobile_money'] or ['card']
   * @returns {{ authorization_url, reference }}
   */
  async initiatePaystackCheckout(orderId, tenantId, { email, channels }) {
    const order = await this.db('orders')
      .where({ id: orderId, tenant_id: tenantId })
      .first();

    if (!order) throw new NotFoundError('Order', orderId);
    if (order.status !== OrderStatus.CREATED) {
      throw new ValidationError(`Order is '${order.status}', expected 'created'`, 'status');
    }

    const reference = `ejua_${order.order_number}_${Date.now()}`;

    const result = await paystack.initializeTransaction({
      email,
      amount: order.total_amount,
      currency: order.currency_code,
      reference,
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        tenant_id: tenantId,
        vendor_id: order.vendor_id,
        custom_fields: [
          { display_name: 'Order', variable_name: 'order_number', value: order.order_number },
        ],
      },
      channels,
    });

    // Store payment reference on the order
    await this.db('orders')
      .where({ id: orderId })
      .update({ metadata: { ...order.metadata, paystack_reference: result.reference } });

    logger.info({ orderId, reference: result.reference }, 'Paystack checkout initiated');

    return {
      authorization_url: result.authorization_url,
      access_code: result.access_code,
      reference: result.reference,
    };
  }

  // ─── CHECKOUT: MOTITO BNPL ───────────────────

  /**
   * Initialize a Motito BNPL checkout for an order.
   * Creates an installment plan in pending state and sends the order to Motito.
   */
  async initiateBnplCheckout(orderId, tenantId, { customer_phone, customer_email, customer_name }) {
    const order = await this.db('orders')
      .where({ id: orderId, tenant_id: tenantId })
      .first();

    if (!order) throw new NotFoundError('Order', orderId);
    if (order.status !== OrderStatus.CREATED) {
      throw new ValidationError(`Order is '${order.status}', expected 'created'`, 'status');
    }

    // Create installment plan (pending approval)
    const { plan, installments } = await installmentService.createPlan({
      tenantId,
      orderId,
      customerId: order.customer_id,
      totalAmount: order.total_amount,
      currencyCode: order.currency_code,
      provider: BNPLProvider.MOTITO,
    });

    // Update order status
    await this.db('orders')
      .where({ id: orderId })
      .update({
        status: OrderStatus.BNPL_PENDING,
        metadata: { ...order.metadata, installment_plan_id: plan.id },
      });

    logger.info({ orderId, planId: plan.id }, 'BNPL checkout initiated');

    // In production, this would call Motito's API.
    // For now, return the plan details so the frontend can redirect.
    return {
      order_id: orderId,
      plan_id: plan.id,
      status: 'bnpl_pending',
      down_payment: plan.down_payment_amount,
      num_installments: plan.num_installments,
      installments,
      // motito_redirect_url would come from Motito's response in production
      message: 'BNPL plan created. Awaiting Motito approval webhook.',
    };
  }

  // ─── PAYMENT CONFIRMATION ────────────────────

  /**
   * Confirm a payment after Paystack verification succeeds.
   * Triggers the payment split and moves the order to CONFIRMED.
   */
  async confirmPayment(orderId, tenantId, paymentData) {
    const order = await this.db('orders')
      .where({ id: orderId, tenant_id: tenantId })
      .first();

    if (!order) throw new NotFoundError('Order', orderId);

    // Idempotency: skip if already confirmed
    if (order.status === OrderStatus.CONFIRMED) {
      logger.info({ orderId }, 'Payment already confirmed, skipping');
      return order;
    }

    const vendor = await this.db('vendors').where({ id: order.vendor_id }).first();
    const gatewayFeeBps = paymentData.fees
      ? Math.round((paymentData.fees / order.total_amount) * 10000)
      : 300; // Default 3% if Paystack doesn't report fees

    // Process the payment split
    await walletService.processPaymentSplit({
      tenantId,
      orderId: order.id,
      totalAmount: order.total_amount,
      currencyCode: order.currency_code,
      paymentReference: paymentData.reference,
      vendorId: order.vendor_id,
      commissionBps: vendor?.commission_bps || config.platform.defaultCommissionBps,
      gatewayFeeBps,
      escrowDays: config.platform.defaultEscrowDays,
    });

    // Determine payment method from Paystack channel
    const paymentMethod = paymentData.channel
      ? PaystackProvider.mapChannel(paymentData.channel, paymentData.authorization)
      : PaymentMethod.CARD;

    // Calculate return window
    const returnWindowEnd = new Date();
    returnWindowEnd.setDate(returnWindowEnd.getDate() + config.platform.defaultEscrowDays);

    // Update order
    const [updated] = await this.db('orders')
      .where({ id: orderId })
      .update({
        status: OrderStatus.CONFIRMED,
        payment_method: paymentMethod,
        confirmed_at: new Date(),
        return_window_end: returnWindowEnd,
        metadata: {
          ...order.metadata,
          paystack_channel: paymentData.channel,
          paystack_fees: paymentData.fees,
          paystack_paid_at: paymentData.paid_at,
        },
      })
      .returning('*');

    logger.info({
      orderId,
      reference: paymentData.reference,
      channel: paymentData.channel,
      amount: order.total_amount,
    }, 'Payment confirmed, order updated');

    return updated;
  }

  // ─── STATUS UPDATES ──────────────────────────

  /**
   * Transition an order to a new status with validation.
   */
  async updateStatus(orderId, tenantId, newStatus, extraData = {}) {
    const order = await this.db('orders')
      .where({ id: orderId, tenant_id: tenantId })
      .first();

    if (!order) throw new NotFoundError('Order', orderId);

    // Validate the transition
    validateTransition(order.status, newStatus);

    const updates = { status: newStatus };

    // Set timestamps based on status
    switch (newStatus) {
      case OrderStatus.CONFIRMED:
        updates.confirmed_at = new Date();
        break;
      case OrderStatus.SHIPPED:
        updates.shipped_at = new Date();
        if (extraData.tracking_number) {
          updates.metadata = { ...order.metadata, tracking_number: extraData.tracking_number };
        }
        break;
      case OrderStatus.DELIVERED:
        updates.delivered_at = new Date();
        // Start return window
        const returnEnd = new Date();
        returnEnd.setDate(returnEnd.getDate() + config.platform.defaultEscrowDays);
        updates.return_window_end = returnEnd;
        // Auto-transition to return_window
        updates.status = OrderStatus.RETURN_WINDOW;
        break;
      case OrderStatus.SETTLED:
        updates.settled_at = new Date();
        break;
    }

    const [updated] = await this.db('orders')
      .where({ id: orderId })
      .update(updates)
      .returning('*');

    logger.info({ orderId, from: order.status, to: updated.status }, 'Order status updated');
    return updated;
  }

  // ─── SHIPPING (VENDOR) ───────────────────────

  async markShipped(orderId, tenantId, vendorId, { tracking_number }) {
    const order = await this.db('orders')
      .where({ id: orderId, tenant_id: tenantId, vendor_id: vendorId })
      .first();

    if (!order) throw new NotFoundError('Order', orderId);

    return this.updateStatus(orderId, tenantId, OrderStatus.SHIPPED, { tracking_number });
  }

  async markDelivered(orderId, tenantId) {
    return this.updateStatus(orderId, tenantId, OrderStatus.DELIVERED);
  }

  // ─── REFUNDS ─────────────────────────────────

  /**
   * Process a full or partial refund.
   * Creates reversing ledger entries and restores stock.
   */
  async processRefund(orderId, tenantId, { reason, refund_amount }) {
    const order = await this.db('orders')
      .where({ id: orderId, tenant_id: tenantId })
      .first();

    if (!order) throw new NotFoundError('Order', orderId);

    // Can only refund orders in return_window
    if (order.status !== OrderStatus.RETURN_WINDOW) {
      throw new ValidationError(
        `Cannot refund order in '${order.status}' status. Must be in return_window.`,
        'status'
      );
    }

    const amount = refund_amount || order.total_amount;
    if (amount > order.total_amount) {
      throw new ValidationError('Refund amount exceeds order total', 'refund_amount');
    }

    return this.db.transaction(async (trx) => {
      // Create refund transaction
      const [refundTxn] = await trx('transactions')
        .insert({
          id: uuidv4(),
          tenant_id: tenantId,
          type: TransactionType.REFUND,
          status: TransactionStatus.COMPLETED,
          order_id: orderId,
          total_amount: amount,
          currency_code: order.currency_code,
          completed_at: new Date(),
          metadata: { reason, original_order_number: order.order_number },
        })
        .returning('*');

      // Reverse the escrow: move funds back from vendor escrow
      // Find the vendor's payment splits for this order
      const splits = await trx('payment_splits')
        .where({ order_id: orderId, split_type: 'vendor_payout' });

      for (const split of splits) {
        if (split.status === 'held_in_escrow') {
          // Return escrow to platform
          await trx('wallets')
            .where({ id: split.destination_wallet_id })
            .decrement('escrow_balance', split.amount);

          // Mark split as refunded
          await trx('payment_splits')
            .where({ id: split.id })
            .update({ status: 'refunded' });
        }
      }

      // Restore stock
      const orderItems = await trx('order_items').where({ order_id: orderId });
      for (const item of orderItems) {
        await productService.incrementStock(trx, item.product_id, item.variant_id, item.quantity);
      }

      // Update order status
      await trx('orders')
        .where({ id: orderId })
        .update({
          status: OrderStatus.REFUNDED,
          metadata: {
            ...order.metadata,
            refund_transaction_id: refundTxn.id,
            refund_reason: reason,
            refund_amount: amount,
            refunded_at: new Date().toISOString(),
          },
        });

      logger.info({ orderId, refundAmount: amount, reason }, 'Order refunded');

      return {
        order_id: orderId,
        refund_transaction_id: refundTxn.id,
        refund_amount: amount,
        status: OrderStatus.REFUNDED,
      };
    });
  }

  // ─── CANCELLATION ────────────────────────────

  async cancelOrder(orderId, tenantId, reason) {
    const order = await this.db('orders')
      .where({ id: orderId, tenant_id: tenantId })
      .first();

    if (!order) throw new NotFoundError('Order', orderId);

    validateTransition(order.status, OrderStatus.CANCELLED);

    return this.db.transaction(async (trx) => {
      // Restore stock
      const orderItems = await trx('order_items').where({ order_id: orderId });
      for (const item of orderItems) {
        await productService.incrementStock(trx, item.product_id, item.variant_id, item.quantity);
      }

      // Cancel any pending installment plans
      await trx('installment_plans')
        .where({ order_id: orderId })
        .whereNot('status', 'completed')
        .update({ status: 'cancelled' });

      // Update order
      const [updated] = await trx('orders')
        .where({ id: orderId })
        .update({
          status: OrderStatus.CANCELLED,
          metadata: { ...order.metadata, cancellation_reason: reason },
        })
        .returning('*');

      logger.info({ orderId, reason }, 'Order cancelled');
      return updated;
    });
  }

  // ─── QUERIES ─────────────────────────────────

  async getById(orderId, tenantId) {
    const order = await this.db('orders')
      .where({ id: orderId, tenant_id: tenantId })
      .first();

    if (!order) throw new NotFoundError('Order', orderId);

    const items = await this.db('order_items').where({ order_id: orderId });
    const allowedTransitions = getAllowedTransitions(order.status);

    return { ...order, items, allowed_transitions: allowedTransitions };
  }

  async getByOrderNumber(orderNumber, tenantId) {
    const order = await this.db('orders')
      .where({ order_number: orderNumber, tenant_id: tenantId })
      .first();

    if (!order) throw new NotFoundError('Order', orderNumber);

    const items = await this.db('order_items').where({ order_id: order.id });
    return { ...order, items };
  }

  async listByCustomer(tenantId, customerId, opts = {}) {
    let query = this.db('orders')
      .where({ tenant_id: tenantId, customer_id: customerId });

    if (opts.status) query = query.where('status', opts.status);

    return paginate(query, opts);
  }

  async listByVendor(tenantId, vendorId, opts = {}) {
    let query = this.db('orders')
      .where({ tenant_id: tenantId, vendor_id: vendorId });

    if (opts.status) query = query.where('status', opts.status);

    return paginate(query, opts);
  }
}

module.exports = new OrderService();
