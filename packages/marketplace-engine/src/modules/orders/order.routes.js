const orderService = require('./order.service');
const paystack = require('../payments/paystack.provider');
const { successResponse, paginatedResponse } = require('@ejua/shared');
const { parseListParams } = require('../../utils/pagination');

async function orderRoutes(fastify) {

  // ═══════════════════════════════════════════
  // ORDER CREATION
  // ═══════════════════════════════════════════

  // ─── CREATE ORDER FROM CART ────────────────
  fastify.post('/orders', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['product_id', 'quantity'],
              properties: {
                product_id: { type: 'string', format: 'uuid' },
                variant_id: { type: 'string', format: 'uuid' },
                quantity: { type: 'integer', minimum: 1, maximum: 50 },
              },
            },
          },
          shipping_address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              region: { type: 'string' },
              country: { type: 'string' },
              phone: { type: 'string' },
              notes: { type: 'string' },
            },
          },
          notes: { type: 'string', maxLength: 500 },
        },
      },
    },
    handler: async (request, reply) => {
      const result = await orderService.createOrder(
        request.tenantId,
        request.user.id,
        request.body
      );
      return reply.status(201).send(successResponse(result));
    },
  });

  // ═══════════════════════════════════════════
  // CHECKOUT
  // ═══════════════════════════════════════════

  // ─── PAY WITH PAYSTACK (MoMo / Card) ──────
  fastify.post('/orders/:orderId/checkout/paystack', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
          channels: {
            type: 'array',
            items: { type: 'string', enum: ['mobile_money', 'card', 'bank'] },
          },
        },
      },
    },
    handler: async (request) => {
      const result = await orderService.initiatePaystackCheckout(
        request.params.orderId,
        request.tenantId,
        request.body
      );
      return successResponse(result);
    },
  });

  // ─── PAY WITH BNPL (Motito) ───────────────
  fastify.post('/orders/:orderId/checkout/bnpl', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          customer_phone: { type: 'string' },
          customer_email: { type: 'string', format: 'email' },
          customer_name: { type: 'string' },
        },
      },
    },
    handler: async (request) => {
      const result = await orderService.initiateBnplCheckout(
        request.params.orderId,
        request.tenantId,
        request.body
      );
      return successResponse(result);
    },
  });

  // ═══════════════════════════════════════════
  // PAYSTACK CALLBACKS & WEBHOOKS
  // ═══════════════════════════════════════════

  // ─── CALLBACK (customer redirect after payment) ──
  fastify.get('/payments/callback', {
    handler: async (request, reply) => {
      const { reference, trxref } = request.query;
      const ref = reference || trxref;

      if (!ref) {
        return reply.status(400).send({ error: 'Missing reference' });
      }

      try {
        // Verify with Paystack
        const verified = await paystack.verifyTransaction(ref);

        if (verified.status === 'success') {
          const orderId = verified.metadata?.order_id;
          const tenantId = verified.metadata?.tenant_id || 'default';

          if (orderId) {
            await orderService.confirmPayment(orderId, tenantId, verified);
          }

          // Redirect to success page
          const successUrl = `${process.env.PLATFORM_URL || 'http://localhost:3000'}/orders/success?ref=${ref}`;
          return reply.redirect(302, successUrl);
        } else {
          const failUrl = `${process.env.PLATFORM_URL || 'http://localhost:3000'}/orders/failed?ref=${ref}`;
          return reply.redirect(302, failUrl);
        }
      } catch (err) {
        request.log.error({ err, reference: ref }, 'Payment callback error');
        const errorUrl = `${process.env.PLATFORM_URL || 'http://localhost:3000'}/orders/error?ref=${ref}`;
        return reply.redirect(302, errorUrl);
      }
    },
  });

  // ─── WEBHOOK (Paystack server-to-server) ──
  fastify.post('/webhooks/paystack', {
    config: { rawBody: true },
    handler: async (request, reply) => {
      const signature = request.headers['x-paystack-signature'];
      const body = request.body;
      const db = require('../../utils/db').getDb();

      // Log the webhook
      const [webhookEvent] = await db('webhook_events')
        .insert({
          tenant_id: body.data?.metadata?.tenant_id || '00000000-0000-0000-0000-000000000001',
          provider: 'paystack',
          event_type: body.event,
          payload: body,
          signature,
        })
        .returning('*');

      // Verify signature in production
      if (process.env.NODE_ENV === 'production') {
        if (!signature || !paystack.verifyWebhookSignature(body, signature)) {
          request.log.warn({ webhookId: webhookEvent.id }, 'Invalid Paystack webhook signature');
          await db('webhook_events')
            .where({ id: webhookEvent.id })
            .update({ error: 'Invalid signature' });
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      }

      try {
        switch (body.event) {
          case 'charge.success': {
            const txn = body.data;
            const orderId = txn.metadata?.order_id;
            const tenantId = txn.metadata?.tenant_id || 'default';

            if (orderId) {
              await orderService.confirmPayment(orderId, tenantId, {
                reference: txn.reference,
                status: txn.status,
                amount: txn.amount,
                currency: txn.currency,
                channel: txn.channel,
                gateway_response: txn.gateway_response,
                paid_at: txn.paid_at,
                fees: txn.fees,
                authorization: txn.authorization,
                customer: txn.customer,
                metadata: txn.metadata,
              });
            }
            break;
          }

          case 'transfer.success': {
            // Vendor payout completed
            request.log.info({ reference: body.data.reference }, 'Transfer success');
            break;
          }

          case 'transfer.failed': {
            request.log.warn({ reference: body.data.reference }, 'Transfer failed');
            break;
          }

          default:
            request.log.info({ event: body.event }, 'Unhandled Paystack event');
        }

        await db('webhook_events')
          .where({ id: webhookEvent.id })
          .update({ processed: true, processed_at: new Date() });

      } catch (err) {
        request.log.error({ err, webhookId: webhookEvent.id }, 'Paystack webhook error');
        await db('webhook_events')
          .where({ id: webhookEvent.id })
          .update({ error: err.message });
      }

      return reply.status(200).send({ received: true });
    },
  });

  // ═══════════════════════════════════════════
  // ORDER MANAGEMENT
  // ═══════════════════════════════════════════

  // ─── GET ORDER BY ID ───────────────────────
  fastify.get('/orders/:orderId', {
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      const order = await orderService.getById(request.params.orderId, request.tenantId);
      return successResponse(order);
    },
  });

  // ─── GET ORDER BY NUMBER ───────────────────
  fastify.get('/orders/number/:orderNumber', {
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      const order = await orderService.getByOrderNumber(
        request.params.orderNumber,
        request.tenantId
      );
      return successResponse(order);
    },
  });

  // ─── MY ORDERS (customer) ──────────────────
  fastify.get('/my/orders', {
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      const params = { ...parseListParams(request.query), status: request.query.status };
      const { data, pagination } = await orderService.listByCustomer(
        request.tenantId,
        request.user.id,
        params
      );
      return paginatedResponse(data, pagination);
    },
  });

  // ─── VENDOR ORDERS ─────────────────────────
  fastify.get('/vendors/:vendorId/orders', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    handler: async (request) => {
      const params = { ...parseListParams(request.query), status: request.query.status };
      const { data, pagination } = await orderService.listByVendor(
        request.tenantId,
        request.params.vendorId,
        params
      );
      return paginatedResponse(data, pagination);
    },
  });

  // ─── MARK SHIPPED (vendor) ─────────────────
  fastify.post('/orders/:orderId/ship', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    schema: {
      body: {
        type: 'object',
        properties: {
          tracking_number: { type: 'string' },
        },
      },
    },
    handler: async (request) => {
      const vendorId = request.user.vendorId || request.body.vendor_id;
      const order = await orderService.markShipped(
        request.params.orderId,
        request.tenantId,
        vendorId,
        { tracking_number: request.body.tracking_number }
      );
      return successResponse(order);
    },
  });

  // ─── MARK DELIVERED ────────────────────────
  fastify.post('/orders/:orderId/deliver', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    handler: async (request) => {
      const order = await orderService.markDelivered(request.params.orderId, request.tenantId);
      return successResponse(order);
    },
  });

  // ─── CANCEL ORDER ──────────────────────────
  fastify.post('/orders/:orderId/cancel', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string', maxLength: 500 },
        },
      },
    },
    handler: async (request) => {
      const order = await orderService.cancelOrder(
        request.params.orderId,
        request.tenantId,
        request.body.reason || 'Customer requested cancellation'
      );
      return successResponse(order);
    },
  });

  // ─── REFUND ORDER ──────────────────────────
  fastify.post('/orders/:orderId/refund', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', maxLength: 500 },
          refund_amount: { type: 'integer', minimum: 1 },
        },
      },
    },
    handler: async (request) => {
      const result = await orderService.processRefund(
        request.params.orderId,
        request.tenantId,
        request.body
      );
      return successResponse(result);
    },
  });
}

module.exports = orderRoutes;
