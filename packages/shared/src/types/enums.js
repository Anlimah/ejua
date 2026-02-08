/**
 * Canonical enums for the Ejua platform.
 * These MUST match the database ENUM types exactly.
 */

const WalletOwnerType = Object.freeze({
  VENDOR: 'vendor',
  CUSTOMER: 'customer',
  PLATFORM: 'platform',
  ESCROW: 'escrow',
  GATEWAY: 'gateway',
});

const TransactionType = Object.freeze({
  PAYMENT: 'payment',
  SPLIT: 'split',
  ESCROW_HOLD: 'escrow_hold',
  ESCROW_RELEASE: 'escrow_release',
  REFUND: 'refund',
  LATE_FEE: 'late_fee',
  WITHDRAWAL: 'withdrawal',
  ADJUSTMENT: 'adjustment',
});

const TransactionStatus = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REVERSED: 'reversed',
});

const OrderStatus = Object.freeze({
  CREATED: 'created',
  BNPL_PENDING: 'bnpl_pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  RETURN_WINDOW: 'return_window',
  SETTLED: 'settled',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
});

const InstallmentPlanStatus = Object.freeze({
  PENDING_APPROVAL: 'pending_approval',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  DEFAULTED: 'defaulted',
  CANCELLED: 'cancelled',
});

const InstallmentStatus = Object.freeze({
  SCHEDULED: 'scheduled',
  PENDING: 'pending',
  PAID: 'paid',
  OVERDUE: 'overdue',
  GRACE_PERIOD: 'grace_period',
  DEFAULTED: 'defaulted',
});

const PaymentMethod = Object.freeze({
  MOMO_MTN: 'momo_mtn',
  MOMO_VODAFONE: 'momo_voda',
  MOMO_AIRTELTIGO: 'momo_airteltigo',
  CARD: 'card',
  MOTITO: 'motito',
});

const SplitType = Object.freeze({
  VENDOR_PAYOUT: 'vendor_payout',
  PLATFORM_COMMISSION: 'platform_commission',
  GATEWAY_FEE: 'gateway_fee',
  TAX: 'tax',
});

const BNPLProvider = Object.freeze({
  INTERNAL: 'internal',
  MOTITO: 'motito',
});

const LedgerEntryType = Object.freeze({
  DEBIT: 'debit',
  CREDIT: 'credit',
});

const SplitStatus = Object.freeze({
  PENDING: 'pending',
  HELD_IN_ESCROW: 'held_in_escrow',
  RELEASED: 'released',
  REFUNDED: 'refunded',
});

module.exports = {
  WalletOwnerType,
  TransactionType,
  TransactionStatus,
  OrderStatus,
  InstallmentPlanStatus,
  InstallmentStatus,
  PaymentMethod,
  SplitType,
  BNPLProvider,
  LedgerEntryType,
  SplitStatus,
};
