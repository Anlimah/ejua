const { getDb } = require('../../utils/db');
const logger = require('../../utils/logger');
const config = require('../../config');
const walletService = require('../wallets/wallet.service');
const installmentService = require('../installments/installment.service');
const paystack = require('../payments/paystack.provider');
const { OrderStatus, SplitStatus } = require('@ejua/shared');

/**
 * Escrow Release Cron Job.
 *
 * Finds all payment splits where:
 *   - status = 'held_in_escrow'
 *   - escrow_release_at <= NOW()
 *
 * Releases funds from vendor escrow to vendor available balance
 * and transitions the order to 'settled'.
 *
 * Should run every hour.
 */
async function processEscrowReleases() {
  const db = getDb();
  const now = new Date();

  try {
    const dueForRelease = await db('payment_splits')
      .where('status', SplitStatus.HELD_IN_ESCROW)
      .where('escrow_release_at', '<=', now)
      .limit(100); // Process in batches

    let released = 0;

    for (const split of dueForRelease) {
      try {
        await walletService.releaseEscrow(split.id);

        // Check if all splits for this order are released → settle the order
        const pendingSplits = await db('payment_splits')
          .where({ order_id: split.order_id, status: SplitStatus.HELD_IN_ESCROW })
          .count('id as count')
          .first();

        if (parseInt(pendingSplits.count) === 0) {
          await db('orders')
            .where({ id: split.order_id, status: OrderStatus.RETURN_WINDOW })
            .update({ status: OrderStatus.SETTLED, settled_at: now });

          logger.info({ orderId: split.order_id }, 'Order settled (all escrows released)');
        }

        released++;
      } catch (err) {
        logger.error({ err, splitId: split.id }, 'Escrow release failed for split');
      }
    }

    if (released > 0) {
      logger.info({ released, total: dueForRelease.length }, 'Escrow release batch complete');
    }

    return { released };
  } catch (err) {
    logger.error({ err }, 'Escrow release cron error');
    return { released: 0, error: err.message };
  }
}

/**
 * Overdue Installment Processing Cron Job.
 *
 * Scans for installments past their grace deadline, applies late fees,
 * and schedules MoMo retry attempts.
 *
 * Should run daily at 6:00 AM local time.
 */
async function processOverdueInstallments() {
  const db = getDb();

  try {
    // Get all active tenants
    const tenants = await db('tenants').where({ is_active: true });

    let totalProcessed = 0;

    for (const tenant of tenants) {
      const result = await installmentService.processOverdueInstallments(tenant.id);
      totalProcessed += result.processed;
    }

    if (totalProcessed > 0) {
      logger.info({ totalProcessed }, 'Overdue installment processing complete');
    }

    return { processed: totalProcessed };
  } catch (err) {
    logger.error({ err }, 'Overdue installment cron error');
    return { processed: 0, error: err.message };
  }
}

/**
 * MoMo Auto-Deduction Retry Cron Job.
 *
 * Finds installments with a next_retry_at in the past and attempts
 * to charge the customer's mobile money via Paystack.
 *
 * Should run every 30 minutes.
 */
async function processInstallmentRetries() {
  const db = getDb();

  try {
    const dueForRetry = await installmentService.getInstallmentsDueForRetry();
    let attempted = 0;
    let succeeded = 0;

    for (const inst of dueForRetry) {
      try {
        // Get the customer and plan details
        const plan = await db('installment_plans').where({ id: inst.plan_id }).first();
        if (!plan) continue;

        const customer = await db('users').where({ id: plan.customer_id }).first();
        if (!customer) continue;

        const totalDue = inst.amount_due + inst.late_fee_amount - inst.amount_paid;
        if (totalDue <= 0) continue;

        const reference = `retry_${inst.id}_${inst.retry_count + 1}_${Date.now()}`;

        // Attempt MoMo charge via Paystack
        const chargeResult = await paystack.chargeMobileMoney({
          email: customer.email || `${customer.phone}@ejua.local`,
          amount: totalDue,
          phone: customer.phone,
          provider: 'mtn', // Default; could be stored on customer profile
          reference,
          currency: inst.currency_code,
        });

        attempted++;

        // If charge succeeded immediately (rare, usually pending)
        if (chargeResult.status === 'success') {
          await installmentService.recordPayment(inst.id, {
            amount: totalDue,
            paymentMethod: 'momo_mtn',
            paymentReference: reference,
          });
          await installmentService.recordRetryAttempt(inst.id, true);
          succeeded++;
        } else {
          // Charge is pending; Paystack webhook will confirm
          await installmentService.recordRetryAttempt(inst.id, false);
        }
      } catch (err) {
        logger.error({ err, installmentId: inst.id }, 'Retry charge failed');
        await installmentService.recordRetryAttempt(inst.id, false);
      }
    }

    if (attempted > 0) {
      logger.info({ attempted, succeeded }, 'Installment retry batch complete');
    }

    return { attempted, succeeded };
  } catch (err) {
    logger.error({ err }, 'Installment retry cron error');
    return { attempted: 0, succeeded: 0, error: err.message };
  }
}

/**
 * Register cron routes for manual/admin triggering.
 * In production, these would be called by a scheduler (e.g., node-cron, AWS EventBridge).
 */
async function cronRoutes(fastify) {
  fastify.post('/admin/cron/escrow-release', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async () => {
      const result = await processEscrowReleases();
      return { status: 'success', data: result };
    },
  });

  fastify.post('/admin/cron/overdue-installments', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async () => {
      const result = await processOverdueInstallments();
      return { status: 'success', data: result };
    },
  });

  fastify.post('/admin/cron/installment-retries', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async () => {
      const result = await processInstallmentRetries();
      return { status: 'success', data: result };
    },
  });
}

module.exports = {
  cronRoutes,
  processEscrowReleases,
  processOverdueInstallments,
  processInstallmentRetries,
};
