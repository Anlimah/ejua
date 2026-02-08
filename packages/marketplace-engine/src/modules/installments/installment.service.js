const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../../utils/db');
const logger = require('../../utils/logger');
const config = require('../../config');
const {
  InstallmentPlanStatus,
  InstallmentStatus,
  BNPLProvider,
  TransactionType,
  TransactionStatus,
  validateAmount,
  bpsOf,
} = require('@ejua/shared');

class InstallmentService {
  constructor() {
    this.db = getDb();
  }

  // ─── PLAN CREATION ───────────────────────────

  /**
   * Create an installment plan for an order.
   * Generates the down payment record + N installment records.
   */
  async createPlan({
    tenantId,
    orderId,
    customerId,
    totalAmount,
    currencyCode,
    downPaymentPctBps = 4000, // 40% default (Motito's requirement)
    numInstallments = 3,
    interestRateBps = 0,
    provider = BNPLProvider.MOTITO,
    providerReference = null,
  }) {
    validateAmount(totalAmount, 'totalAmount');

    const downPaymentAmount = bpsOf(totalAmount, downPaymentPctBps);
    const remainingAmount = totalAmount - downPaymentAmount;

    // Calculate installment amounts (distribute remainder evenly, last one gets rounding difference)
    const baseInstallment = Math.floor(remainingAmount / numInstallments);
    const lastInstallment = remainingAmount - baseInstallment * (numInstallments - 1);

    // Get grace period config
    const lateFeeRule = await this.db('late_fee_rules')
      .where({ tenant_id: tenantId, currency_code: currencyCode, is_active: true })
      .first();

    const gracePeriodDays = lateFeeRule?.grace_period_days || config.platform.defaultGracePeriodDays;

    return this.db.transaction(async (trx) => {
      // Create the plan
      const [plan] = await trx('installment_plans')
        .insert({
          id: uuidv4(),
          tenant_id: tenantId,
          order_id: orderId,
          customer_id: customerId,
          provider,
          provider_reference: providerReference,
          total_amount: totalAmount,
          down_payment_amount: downPaymentAmount,
          down_payment_pct_bps: downPaymentPctBps,
          num_installments: numInstallments,
          interest_rate_bps: interestRateBps,
          currency_code: currencyCode,
          status: provider === BNPLProvider.MOTITO
            ? InstallmentPlanStatus.PENDING_APPROVAL
            : InstallmentPlanStatus.ACTIVE,
        })
        .returning('*');

      // Create individual installment records
      const now = new Date();
      const installments = [];

      // Installment 0: Down payment (due immediately)
      const downPaymentDue = new Date(now);
      const downPaymentGrace = new Date(downPaymentDue);
      downPaymentGrace.setDate(downPaymentGrace.getDate() + gracePeriodDays);

      installments.push({
        id: uuidv4(),
        tenant_id: tenantId,
        plan_id: plan.id,
        installment_num: 0,
        amount_due: downPaymentAmount,
        currency_code: currencyCode,
        due_date: downPaymentDue.toISOString().split('T')[0],
        grace_period_days: gracePeriodDays,
        grace_deadline: downPaymentGrace.toISOString().split('T')[0],
        status: InstallmentStatus.PENDING,
      });

      // Installments 1..N
      for (let i = 1; i <= numInstallments; i++) {
        const dueDate = new Date(now);
        dueDate.setMonth(dueDate.getMonth() + i);
        const graceDeadline = new Date(dueDate);
        graceDeadline.setDate(graceDeadline.getDate() + gracePeriodDays);

        const amount = i === numInstallments ? lastInstallment : baseInstallment;

        installments.push({
          id: uuidv4(),
          tenant_id: tenantId,
          plan_id: plan.id,
          installment_num: i,
          amount_due: amount,
          currency_code: currencyCode,
          due_date: dueDate.toISOString().split('T')[0],
          grace_period_days: gracePeriodDays,
          grace_deadline: graceDeadline.toISOString().split('T')[0],
          status: InstallmentStatus.SCHEDULED,
        });
      }

      await trx('installments').insert(installments);

      logger.info(
        { planId: plan.id, orderId, numInstallments, downPayment: downPaymentAmount },
        'Installment plan created'
      );

      return { plan, installments };
    });
  }

  // ─── MOTITO APPROVAL ─────────────────────────

  /**
   * Handle Motito BNPL approval webhook.
   * Marks the plan as active and the down payment as paid.
   */
  async handleBnplApproval({
    tenantId,
    providerReference,
    downPaymentAmount,
    paymentMethod,
    paymentReference,
    schedule,
  }) {
    return this.db.transaction(async (trx) => {
      // Find the plan
      const plan = await trx('installment_plans')
        .where({ tenant_id: tenantId, provider_reference: providerReference })
        .first();

      if (!plan) {
        logger.error({ providerReference }, 'Installment plan not found for BNPL approval');
        return null;
      }

      // Activate the plan
      await trx('installment_plans')
        .where({ id: plan.id })
        .update({
          status: InstallmentPlanStatus.ACTIVE,
          approved_at: new Date(),
        });

      // Mark down payment as paid
      await trx('installments')
        .where({ plan_id: plan.id, installment_num: 0 })
        .update({
          status: InstallmentStatus.PAID,
          amount_paid: downPaymentAmount,
          payment_method: paymentMethod,
          payment_reference: paymentReference,
          paid_at: new Date(),
        });

      // Update installment due dates from provider schedule if provided
      if (schedule && schedule.length > 0) {
        for (const item of schedule) {
          await trx('installments')
            .where({ plan_id: plan.id, installment_num: item.installment_num })
            .update({
              amount_due: item.amount,
              due_date: item.due_date,
              grace_deadline: new Date(
                new Date(item.due_date).getTime() + plan.grace_period_days * 86400000
              )
                .toISOString()
                .split('T')[0],
            });
        }
      }

      logger.info({ planId: plan.id, providerReference }, 'BNPL plan approved');
      return plan;
    });
  }

  // ─── PAYMENT RECORDING ───────────────────────

  /**
   * Record a payment against a specific installment.
   */
  async recordPayment(installmentId, { amount, paymentMethod, paymentReference }) {
    return this.db.transaction(async (trx) => {
      const installment = await trx('installments').where({ id: installmentId }).first();
      if (!installment) {
        logger.error({ installmentId }, 'Installment not found');
        return null;
      }

      const totalDue = installment.amount_due + installment.late_fee_amount;
      const newPaid = installment.amount_paid + amount;

      const update = {
        amount_paid: newPaid,
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        retry_count: 0,
        next_retry_at: null,
      };

      if (newPaid >= totalDue) {
        update.status = InstallmentStatus.PAID;
        update.paid_at = new Date();
      }

      await trx('installments').where({ id: installmentId }).update(update);

      // Check if all installments are paid → complete the plan
      const unpaid = await trx('installments')
        .where({ plan_id: installment.plan_id })
        .whereNot('status', InstallmentStatus.PAID)
        .count('id as count')
        .first();

      if (parseInt(unpaid.count) === 0) {
        await trx('installment_plans')
          .where({ id: installment.plan_id })
          .update({
            status: InstallmentPlanStatus.COMPLETED,
            completed_at: new Date(),
          });
        logger.info({ planId: installment.plan_id }, 'Installment plan completed');
      }

      return { installmentId, amountPaid: amount, newTotal: newPaid, fullyPaid: newPaid >= totalDue };
    });
  }

  // ─── LATE FEE ENGINE ─────────────────────────

  /**
   * Process overdue installments: apply late fees and schedule retries.
   * This should be called by a cron job daily.
   */
  async processOverdueInstallments(tenantId) {
    const today = new Date().toISOString().split('T')[0];

    // Find installments past grace deadline that haven't been paid
    const overdueInstallments = await this.db('installments AS i')
      .join('installment_plans AS p', 'i.plan_id', 'p.id')
      .where('i.tenant_id', tenantId)
      .where('i.grace_deadline', '<', today)
      .whereIn('i.status', [
        InstallmentStatus.PENDING,
        InstallmentStatus.SCHEDULED,
        InstallmentStatus.GRACE_PERIOD,
        InstallmentStatus.OVERDUE,
      ])
      .select('i.*', 'p.total_amount as plan_total');

    // Get late fee rules
    const rules = await this.db('late_fee_rules')
      .where({ tenant_id: tenantId, is_active: true });

    const ruleMap = {};
    for (const rule of rules) {
      ruleMap[rule.currency_code] = rule;
    }

    let processed = 0;

    for (const inst of overdueInstallments) {
      const rule = ruleMap[inst.currency_code];
      if (!rule) continue;

      let newLateFee = inst.late_fee_amount;

      if (rule.fee_type === 'percentage') {
        // Calculate weeks overdue
        const dueDate = new Date(inst.grace_deadline);
        const daysPastDue = Math.floor((Date.now() - dueDate.getTime()) / 86400000);
        const weeksPastDue = Math.max(1, Math.ceil(daysPastDue / 7));

        const weeklyFee = bpsOf(inst.amount_due, rule.fee_rate_bps);
        const totalFee = weeklyFee * weeksPastDue;
        const maxFee = bpsOf(inst.amount_due, rule.max_fee_pct_bps);

        newLateFee = Math.min(totalFee, maxFee);
      } else {
        // Flat fee
        newLateFee = rule.flat_fee_amount || 0;
      }

      // Schedule retry if enabled
      let nextRetryAt = null;
      if (rule.auto_retry_enabled && inst.retry_count < rule.max_retries) {
        const backoffHours = rule.retry_backoff_hours[inst.retry_count] || 168;
        nextRetryAt = new Date(Date.now() + backoffHours * 3600000);
      }

      await this.db('installments')
        .where({ id: inst.id })
        .update({
          status: InstallmentStatus.OVERDUE,
          late_fee_amount: newLateFee,
          next_retry_at: nextRetryAt,
        });

      processed++;
    }

    logger.info({ tenantId, processed }, 'Overdue installments processed');
    return { processed };
  }

  // ─── RETRY ENGINE ────────────────────────────

  /**
   * Get installments that need a MoMo auto-deduction retry.
   * Called by the retry cron job.
   */
  async getInstallmentsDueForRetry() {
    const now = new Date();
    return this.db('installments')
      .whereNotNull('next_retry_at')
      .where('next_retry_at', '<=', now)
      .whereIn('status', [InstallmentStatus.PENDING, InstallmentStatus.OVERDUE])
      .orderBy('next_retry_at', 'asc')
      .limit(50);
  }

  /**
   * Increment retry count after an attempt.
   */
  async recordRetryAttempt(installmentId, success) {
    const inst = await this.db('installments').where({ id: installmentId }).first();
    if (!inst) return;

    const rule = await this.db('late_fee_rules')
      .where({ tenant_id: inst.tenant_id, currency_code: inst.currency_code, is_active: true })
      .first();

    const newRetryCount = inst.retry_count + 1;
    let nextRetryAt = null;

    if (!success && rule && newRetryCount < rule.max_retries) {
      const backoffHours = rule.retry_backoff_hours[newRetryCount] || 168;
      nextRetryAt = new Date(Date.now() + backoffHours * 3600000);
    }

    await this.db('installments')
      .where({ id: installmentId })
      .update({
        retry_count: newRetryCount,
        next_retry_at: success ? null : nextRetryAt,
        status: !success && newRetryCount >= (rule?.max_retries || 4)
          ? InstallmentStatus.DEFAULTED
          : inst.status,
      });
  }

  // ─── QUERIES ─────────────────────────────────

  async getPlansByOrder(orderId) {
    return this.db('installment_plans').where({ order_id: orderId });
  }

  async getInstallmentsByPlan(planId) {
    return this.db('installments')
      .where({ plan_id: planId })
      .orderBy('installment_num', 'asc');
  }

  async getPlanWithInstallments(planId) {
    const plan = await this.db('installment_plans').where({ id: planId }).first();
    if (!plan) return null;
    const installments = await this.getInstallmentsByPlan(planId);
    return { plan, installments };
  }
}

module.exports = new InstallmentService();
