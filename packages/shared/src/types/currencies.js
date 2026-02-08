/**
 * Supported currencies with their properties.
 * All amounts in the system are stored as integers in the smallest unit.
 */

const CURRENCIES = Object.freeze({
  GHS: {
    code: 'GHS',
    name: 'Ghana Cedi',
    symbol: 'GH₵',
    smallestUnit: 'pesewas',
    decimalPlaces: 2,
    multiplier: 100, // 1 GHS = 100 pesewas
  },
  NGN: {
    code: 'NGN',
    name: 'Nigerian Naira',
    symbol: '₦',
    smallestUnit: 'kobo',
    decimalPlaces: 2,
    multiplier: 100,
  },
  XOF: {
    code: 'XOF',
    name: 'CFA Franc',
    symbol: 'CFA',
    smallestUnit: 'centimes',
    decimalPlaces: 0, // CFA has no subunit in practice
    multiplier: 1,
  },
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    smallestUnit: 'cents',
    decimalPlaces: 2,
    multiplier: 100,
  },
});

/**
 * Convert a human-readable amount to the smallest currency unit.
 * e.g., toSmallestUnit(25.99, 'GHS') => 2599
 */
function toSmallestUnit(amount, currencyCode) {
  const currency = CURRENCIES[currencyCode];
  if (!currency) throw new Error(`Unsupported currency: ${currencyCode}`);
  return Math.round(amount * currency.multiplier);
}

/**
 * Convert from smallest unit back to human-readable.
 * e.g., fromSmallestUnit(2599, 'GHS') => 25.99
 */
function fromSmallestUnit(amount, currencyCode) {
  const currency = CURRENCIES[currencyCode];
  if (!currency) throw new Error(`Unsupported currency: ${currencyCode}`);
  return amount / currency.multiplier;
}

/**
 * Format an amount (in smallest unit) for display.
 * e.g., formatMoney(259900, 'GHS') => "GH₵2,599.00"
 */
function formatMoney(amountSmallest, currencyCode) {
  const currency = CURRENCIES[currencyCode];
  if (!currency) throw new Error(`Unsupported currency: ${currencyCode}`);
  const human = fromSmallestUnit(amountSmallest, currencyCode);
  const formatted = human.toLocaleString('en-US', {
    minimumFractionDigits: currency.decimalPlaces,
    maximumFractionDigits: currency.decimalPlaces,
  });
  return `${currency.symbol}${formatted}`;
}

module.exports = {
  CURRENCIES,
  toSmallestUnit,
  fromSmallestUnit,
  formatMoney,
};
