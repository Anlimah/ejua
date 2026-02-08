const crypto = require('crypto');
const config = require('../../config');
const { getDb } = require('../../utils/db');
const logger = require('../../utils/logger');
const installmentService = require('../installments/installment.service');
const walletService = require('../wallets/wallet.service');
const { OrderStatus, PaymentMethod } = require('@ejua/shared');

/**
 * Verify the Motito webhook signature (HMAC-SHA256).
 */
function verifySignature(payload, signature) {
  const expected = crypto
    .createHmac('sha256', config.motito.webhookSecret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Motito webhook route handlers.
 */
async function motitoWebhookRoutes(fastify) {
  const db = getDb();

  fastify.post('/webhooks/motito', {
    config: { rawBody: true }, // Skip auth for webhooks
    handler: async (request, reply) => {
      const { body } = request;
      const signature = request.headers['x-motito-signature'];

      // 1. Log the raw webhook
      const [webhookEvent] = await db('webhook_events')
        .insert({
          tenant_id: body.tenant_id || '00000000-0000-0000-0000-000000000001',
          provider: 'motito',
          event_type: body.event,
          payload: body,
          signature,
        })
        .returning('*');

      // 2. Verify signature (skip in sandbox/dev)
      if (config.env === 'production') {
        if (!signature || !verifySignature(body, signature)) {
          logger.warn({ webhookId: webhookEvent.id }, 'Invalid Motito webhook signature');
          await db('webhook_events')
            .where({ id: webhookEvent.id })
            .update({ error: 'Invalid signature' });
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      }

      // 3. Process based on event type
      try {
        switch (body.event) {
          case 'bnpl.approved':
            await handleBnplApproved(body.data, webhookEvent.tenant_id);
            break;

          case 'bnpl.declined':
            await handleBnplDeclined(body.data);
            break;

          case 'bnpl.payment_received':
            await handleInstallmentPayment(body.data);
            break;

          default:
            logger.info({ event: body.event }, 'Unhandled Motito event');
        }

        // Mark as processed
        await db('webhook_events')
          .where({ id: webhookEvent.id })
          .update({ processed: true, processed_at: new Date() });

      } catch (err) {
        logger.error({ err, webhookId: webhookEvent.id }, 'Motito webhook processing error');
        await db('webhook_events')
          .where({ id: webhookEvent.id })
          .update({ error: err.message });
      }

      // Always return 200 to Motito (they'll retry on non-2xx)
      return reply.status(200).send({ received: true });
    },
  });
}

/**
 * Handle bnpl.approved: Mark order as confirmed, process payment split.
 */
async function handleBnplApproved(data, tenantId) {
  const db = getDb();

  // Find the order
  const order = await db('orders')
    .where({ order_number: data.merchant_reference })
    .orWhere({ id: data.merchant_reference })
    .first();

  if (!order) {
    logger.error({ ref: data.merchant_reference }, 'Order not found for BNPL approval');
    return;
  }

  // Activate the installment plan
  await installmentService.handleBnplApproval({
    tenantId,
    providerReference: data.motito_reference,
    downPaymentAmount: data.down_payment.amount,
    paymentMethod: PaymentMethod.MOTITO,
    paymentReference: data.motito_reference,
    schedule: data.schedule,
  });

  // Process the down payment split
  const vendor = await db('vendors').where({ id: order.vendor_id }).first();

  await walletService.processPaymentSplit({
    tenantId,
    orderId: order.id,
    totalAmount: data.down_payment.amount,
    currencyCode: order.currency_code,
    paymentReference: data.motito_reference,
    vendorId: order.vendor_id,
    commissionBps: vendor?.commission_bps || 1000,
  });

  // Update order status
  const returnWindowEnd = new Date();
  returnWindowEnd.setDate(returnWindowEnd.getDate() + 14);

  await db('orders').where({ id: order.id }).update({
    status: OrderStatus.CONFIRMED,
    payment_method: PaymentMethod.MOTITO,
    confirmed_at: new Date(),
    return_window_end: returnWindowEnd,
  });

  logger.info({ orderId: order.id, motitoRef: data.motito_reference }, 'BNPL order confirmed');
}

/**
 * Handle bnpl.declined: Cancel the order.
 */
async function handleBnplDeclined(data) {
  const db = getDb();

  const order = await db('orders')
    .where({ order_number: data.merchant_reference })
    .orWhere({ id: data.merchant_reference })
    .first();

  if (order) {
    await db('orders').where({ id: order.id }).update({ status: OrderStatus.CANCELLED });
    await db('installment_plans')
      .where({ order_id: order.id })
      .update({ status: 'cancelled' });

    logger.info({ orderId: order.id }, 'BNPL order declined and cancelled');
  }
}

/**
 * Handle bnpl.payment_received: Record an installment payment from Motito.
 */
async function handleInstallmentPayment(data) {
  const db = getDb();

  const plan = await db('installment_plans')
    .where({ provider_reference: data.motito_reference })
    .first();

  if (!plan) return;

  // Find the next unpaid installment
  const installment = await db('installments')
    .where({ plan_id: plan.id })
    .whereNot('status', 'paid')
    .orderBy('installment_num', 'asc')
    .first();

  if (installment) {
    await installmentService.recordPayment(installment.id, {
      amount: data.amount,
      paymentMethod: PaymentMethod.MOTITO,
      paymentReference: data.payment_reference,
    });
  }
}

module.exports = motitoWebhookRoutes;
