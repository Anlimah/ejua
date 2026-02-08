const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../../utils/db');
const logger = require('../../utils/logger');
const {
  WalletOwnerType,
  TransactionType,
  TransactionStatus,
  LedgerEntryType,
  SplitType,
  SplitStatus,
  InsufficientFundsError,
  NotFoundError,
  ConflictError,
  validateAmount,
  validateCurrency,
  validateSplitTotal,
  bpsOf,
} = require('@ejua/shared');

class WalletService {
  constructor() {
    this.db = getDb();
  }

  // ─── WALLET MANAGEMENT ───────────────────────

  /**
   * Create a new wallet for an owner.
   * Called during vendor onboarding and customer registration.
   */
  async createWallet(tenantId, ownerType, ownerId, currencyCode) {
    validateCurrency(currencyCode);

    const existing = await this.db('wallets')
      .where({ tenant_id: tenantId, owner_type: ownerType, owner_id: ownerId, currency_code: currencyCode })
      .first();

    if (existing) {
      throw new ConflictError(`Wallet already exists for ${ownerType}:${ownerId} in ${currencyCode}`);
    }

    const [wallet] = await this.db('wallets')
      .insert({
        id: uuidv4(),
        tenant_id: tenantId,
        owner_type: ownerType,
        owner_id: ownerId,
        currency_code: currencyCode,
        available_balance: 0,
        escrow_balance: 0,
      })
      .returning('*');

    logger.info({ walletId: wallet.id, ownerType, ownerId }, 'Wallet created');
    return wallet;
  }

  /**
   * Get wallet by ID with balance info.
   */
  async getWallet(walletId) {
    const wallet = await this.db('wallets').where({ id: walletId }).first();
    if (!wallet) throw new NotFoundError('Wallet', walletId);
    return wallet;
  }

  /**
   * Get or create a wallet for an owner.
   */
  async getOrCreateWallet(tenantId, ownerType, ownerId, currencyCode) {
    const existing = await this.db('wallets')
      .where({ tenant_id: tenantId, owner_type: ownerType, owner_id: ownerId, currency_code: currencyCode })
      .first();

    if (existing) return existing;
    return this.createWallet(tenantId, ownerType, ownerId, currencyCode);
  }

  /**
   * Find the platform commission wallet for a tenant+currency.
   */
  async getPlatformWallet(tenantId, currencyCode) {
    return this.getOrCreateWallet(tenantId, WalletOwnerType.PLATFORM, tenantId, currencyCode);
  }

  /**
   * Find the gateway fee wallet for a tenant+currency.
   */
  async getGatewayWallet(tenantId, currencyCode) {
    return this.getOrCreateWallet(tenantId, WalletOwnerType.GATEWAY, tenantId, currencyCode);
  }

  // ─── DOUBLE-ENTRY LEDGER ─────────────────────

  /**
   * Create a pair of ledger entries (debit + credit) within a transaction.
   * This is the atomic building block of all money movement.
   *
   * @param {Knex.Transaction} trx - Database transaction (REQUIRED)
   * @param {Object} params
   * @returns {Object} { debitEntry, creditEntry }
   */
  async createLedgerEntries(trx, {
    tenantId,
    transactionId,
    debitWalletId,
    creditWalletId,
    amount,
    currencyCode,
    description,
    metadata = {},
    idempotencyPrefix,
  }) {
    validateAmount(amount, 'ledger amount');

    const idempotencyKey = idempotencyPrefix || `${transactionId}-${debitWalletId}-${creditWalletId}`;

    // Check idempotency
    const existing = await trx('ledger_entries')
      .where('idempotency_key', 'like', `${idempotencyKey}%`)
      .first();
    if (existing) {
      logger.warn({ idempotencyKey }, 'Duplicate ledger entry detected, skipping');
      return null;
    }

    // Update debit wallet (money leaves)
    const debitResult = await trx('wallets')
      .where({ id: debitWalletId })
      .decrement('available_balance', amount)
      .returning('*');

    if (!debitResult.length) throw new NotFoundError('Wallet', debitWalletId);
    const debitWallet = debitResult[0];

    // Update credit wallet (money arrives)
    const creditResult = await trx('wallets')
      .where({ id: creditWalletId })
      .increment('available_balance', amount)
      .returning('*');

    if (!creditResult.length) throw new NotFoundError('Wallet', creditWalletId);
    const creditWallet = creditResult[0];

    // Insert debit entry
    const [debitEntry] = await trx('ledger_entries')
      .insert({
        id: uuidv4(),
        tenant_id: tenantId,
        transaction_id: transactionId,
        wallet_id: debitWalletId,
        entry_type: LedgerEntryType.DEBIT,
        amount,
        currency_code: currencyCode,
        balance_after: debitWallet.available_balance,
        description,
        metadata,
        idempotency_key: `${idempotencyKey}-debit`,
      })
      .returning('*');

    // Insert credit entry
    const [creditEntry] = await trx('ledger_entries')
      .insert({
        id: uuidv4(),
        tenant_id: tenantId,
        transaction_id: transactionId,
        wallet_id: creditWalletId,
        entry_type: LedgerEntryType.CREDIT,
        amount,
        currency_code: currencyCode,
        balance_after: creditWallet.available_balance,
        description,
        metadata,
        idempotency_key: `${idempotencyKey}-credit`,
      })
      .returning('*');

    return { debitEntry, creditEntry };
  }

  // ─── PAYMENT SPLIT ENGINE ────────────────────

  /**
   * Process a payment and split it across vendor, platform, and gateway wallets.
   * This is called when a MoMo or card payment is confirmed.
   *
   * The flow:
   *  1. Create a transaction record
   *  2. Calculate splits (vendor %, commission %, gateway fee)
   *  3. Move vendor portion into escrow
   *  4. Credit platform commission immediately
   *  5. Record gateway fee
   *  6. Create payment_splits records for auditing
   *
   * @returns {Object} { transaction, splits }
   */
  async processPaymentSplit({
    tenantId,
    orderId,
    totalAmount,
    currencyCode,
    paymentReference,
    vendorId,
    commissionBps = 1000,  // 10% default
    gatewayFeeBps = 300,   // 3% default
    escrowDays = 14,
  }) {
    validateAmount(totalAmount, 'totalAmount');
    validateCurrency(currencyCode);

    return this.db.transaction(async (trx) => {
      // 1. Calculate the split
      const gatewayFeeAmount = bpsOf(totalAmount, gatewayFeeBps);
      const netAmount = totalAmount - gatewayFeeAmount;
      const commissionAmount = bpsOf(netAmount, commissionBps);
      const vendorAmount = netAmount - commissionAmount;

      // Verify split integrity
      validateSplitTotal(
        [
          { amount: vendorAmount },
          { amount: commissionAmount },
          { amount: gatewayFeeAmount },
        ],
        totalAmount
      );

      // 2. Create the transaction
      const [transaction] = await trx('transactions')
        .insert({
          id: uuidv4(),
          tenant_id: tenantId,
          type: TransactionType.PAYMENT,
          status: TransactionStatus.COMPLETED,
          order_id: orderId,
          total_amount: totalAmount,
          currency_code: currencyCode,
          reference: paymentReference,
          completed_at: new Date(),
          metadata: { commissionBps, gatewayFeeBps, vendorId },
        })
        .returning('*');

      // 3. Get wallets
      const platformWallet = await this.getPlatformWallet(tenantId, currencyCode);
      const gatewayWallet = await this.getGatewayWallet(tenantId, currencyCode);

      // Get or create vendor escrow wallet
      const vendorEscrowWallet = await this.getOrCreateWallet(
        tenantId, WalletOwnerType.ESCROW, vendorId, currencyCode
      );

      // 4. Fund the platform incoming wallet first (simulate money arriving)
      // In production, this balance is confirmed by the MoMo/card callback
      await trx('wallets')
        .where({ id: platformWallet.id })
        .increment('available_balance', totalAmount);

      // 5. Create ledger entries for each split

      // Vendor portion → escrow
      await this.createLedgerEntries(trx, {
        tenantId,
        transactionId: transaction.id,
        debitWalletId: platformWallet.id,
        creditWalletId: vendorEscrowWallet.id,
        amount: vendorAmount,
        currencyCode,
        description: `Vendor payout (escrow) for order ${orderId}`,
        idempotencyPrefix: `${transaction.id}-vendor`,
      });

      // Also track it in the escrow_balance column
      await trx('wallets')
        .where({ id: vendorEscrowWallet.id })
        .increment('escrow_balance', vendorAmount)
        .decrement('available_balance', vendorAmount);

      // Commission → platform keeps it
      await this.createLedgerEntries(trx, {
        tenantId,
        transactionId: transaction.id,
        debitWalletId: platformWallet.id,
        creditWalletId: platformWallet.id,
        amount: commissionAmount,
        currencyCode,
        description: `Platform commission for order ${orderId}`,
        idempotencyPrefix: `${transaction.id}-commission`,
      });

      // Gateway fee
      await this.createLedgerEntries(trx, {
        tenantId,
        transactionId: transaction.id,
        debitWalletId: platformWallet.id,
        creditWalletId: gatewayWallet.id,
        amount: gatewayFeeAmount,
        currencyCode,
        description: `Gateway fee for order ${orderId}`,
        idempotencyPrefix: `${transaction.id}-gateway`,
      });

      // 6. Create payment_splits records
      const escrowReleaseAt = new Date();
      escrowReleaseAt.setDate(escrowReleaseAt.getDate() + escrowDays);

      const splitRecords = [
        {
          id: uuidv4(),
          tenant_id: tenantId,
          transaction_id: transaction.id,
          order_id: orderId,
          source_wallet_id: platformWallet.id,
          destination_wallet_id: vendorEscrowWallet.id,
          split_type: SplitType.VENDOR_PAYOUT,
          amount: vendorAmount,
          percentage_bps: 10000 - commissionBps - gatewayFeeBps,
          currency_code: currencyCode,
          status: SplitStatus.HELD_IN_ESCROW,
          escrow_release_at: escrowReleaseAt,
        },
        {
          id: uuidv4(),
          tenant_id: tenantId,
          transaction_id: transaction.id,
          order_id: orderId,
          source_wallet_id: platformWallet.id,
          destination_wallet_id: platformWallet.id,
          split_type: SplitType.PLATFORM_COMMISSION,
          amount: commissionAmount,
          percentage_bps: commissionBps,
          currency_code: currencyCode,
          status: SplitStatus.RELEASED,
          released_at: new Date(),
        },
        {
          id: uuidv4(),
          tenant_id: tenantId,
          transaction_id: transaction.id,
          order_id: orderId,
          source_wallet_id: platformWallet.id,
          destination_wallet_id: gatewayWallet.id,
          split_type: SplitType.GATEWAY_FEE,
          amount: gatewayFeeAmount,
          percentage_bps: gatewayFeeBps,
          currency_code: currencyCode,
          status: SplitStatus.RELEASED,
          released_at: new Date(),
        },
      ];

      await trx('payment_splits').insert(splitRecords);

      logger.info(
        {
          transactionId: transaction.id,
          orderId,
          vendorAmount,
          commissionAmount,
          gatewayFeeAmount,
        },
        'Payment split processed'
      );

      return { transaction, splits: splitRecords };
    });
  }

  // ─── ESCROW RELEASE ──────────────────────────

  /**
   * Release escrowed funds to vendor's available balance.
   * Called by a cron job when the return window expires.
   */
  async releaseEscrow(splitId) {
    return this.db.transaction(async (trx) => {
      const split = await trx('payment_splits')
        .where({ id: splitId, status: SplitStatus.HELD_IN_ESCROW })
        .first();

      if (!split) throw new NotFoundError('Escrow split', splitId);

      // Get vendor's available wallet (not the escrow one)
      const vendorWallet = await trx('wallets')
        .where({
          tenant_id: split.tenant_id,
          owner_type: WalletOwnerType.VENDOR,
          owner_id: split.destination_wallet_id, // escrow wallet owner_id = vendor_id
          currency_code: split.currency_code,
        })
        .first();

      const escrowWallet = await trx('wallets')
        .where({ id: split.destination_wallet_id })
        .first();

      // Create release transaction
      const [transaction] = await trx('transactions')
        .insert({
          id: uuidv4(),
          tenant_id: split.tenant_id,
          type: TransactionType.ESCROW_RELEASE,
          status: TransactionStatus.COMPLETED,
          order_id: split.order_id,
          total_amount: split.amount,
          currency_code: split.currency_code,
          completed_at: new Date(),
        })
        .returning('*');

      // Move from escrow_balance to vendor's available_balance
      await trx('wallets')
        .where({ id: escrowWallet.id })
        .decrement('escrow_balance', split.amount);

      if (vendorWallet) {
        await trx('wallets')
          .where({ id: vendorWallet.id })
          .increment('available_balance', split.amount);
      }

      // Mark split as released
      await trx('payment_splits')
        .where({ id: splitId })
        .update({ status: SplitStatus.RELEASED, released_at: new Date() });

      logger.info({ splitId, amount: split.amount }, 'Escrow released');
      return transaction;
    });
  }

  // ─── BALANCE QUERIES ─────────────────────────

  /**
   * Get wallet balance with recent transaction history.
   */
  async getWalletWithHistory(walletId, limit = 20) {
    const wallet = await this.getWallet(walletId);

    const history = await this.db('ledger_entries')
      .where({ wallet_id: walletId })
      .orderBy('created_at', 'desc')
      .limit(limit);

    return { wallet, history };
  }

  /**
   * Get all wallets for a vendor.
   */
  async getVendorWallets(tenantId, vendorId) {
    const wallets = await this.db('wallets')
      .where({ tenant_id: tenantId, owner_id: vendorId })
      .whereIn('owner_type', [WalletOwnerType.VENDOR, WalletOwnerType.ESCROW]);

    return wallets;
  }
}

module.exports = new WalletService();
