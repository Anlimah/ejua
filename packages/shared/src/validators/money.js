const { CURRENCIES } = require('../types/currencies');

/**
 * Validate that an amount is a positive integer (smallest currency unit).
 */
function validateAmount(amount, fieldName = 'amount') {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`${fieldName} must be a non-negative integer (smallest currency unit). Got: ${amount}`);
  }
  return true;
}

/**
 * Validate currency code is supported.
 */
function validateCurrency(code) {
  if (!CURRENCIES[code]) {
    throw new Error(`Unsupported currency: ${code}. Supported: ${Object.keys(CURRENCIES).join(', ')}`);
  }
  return true;
}

/**
 * Validate that split amounts sum to the expected total.
 */
function validateSplitTotal(splits, expectedTotal) {
  const sum = splits.reduce((acc, s) => acc + s.amount, 0);
  if (sum !== expectedTotal) {
    throw new Error(
      `Split amounts (${sum}) do not equal expected total (${expectedTotal}). Difference: ${expectedTotal - sum}`
    );
  }
  return true;
}

/**
 * Calculate basis points.
 * e.g., bpsOf(259900, 1000) => 25990 (10% of 259900)
 */
function bpsOf(amount, bps) {
  return Math.round((amount * bps) / 10000);
}

module.exports = {
  validateAmount,
  validateCurrency,
  validateSplitTotal,
  bpsOf,
};
