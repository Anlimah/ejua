/**
 * Currency formatting utilities.
 * Mirrors the backend @ejua/shared formatMoney but for client-side use.
 */

const CURRENCIES: Record<string, { symbol: string; decimals: number; multiplier: number }> = {
  GHS: { symbol: 'GH₵', decimals: 2, multiplier: 100 },
  NGN: { symbol: '₦', decimals: 2, multiplier: 100 },
  XOF: { symbol: 'CFA', decimals: 0, multiplier: 1 },
  USD: { symbol: '$', decimals: 2, multiplier: 100 },
};

/**
 * Format an amount (in smallest unit) for display.
 * e.g., formatMoney(259900, 'GHS') => "GH₵2,599.00"
 */
export function formatMoney(amountSmallest: number, currencyCode: string = 'GHS'): string {
  const currency = CURRENCIES[currencyCode] || CURRENCIES.GHS;
  const human = amountSmallest / currency.multiplier;
  const formatted = human.toLocaleString('en-US', {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  });
  return `${currency.symbol}${formatted}`;
}

/**
 * Calculate installment preview.
 * 40% down, 3 months, 0% interest (Motito terms).
 */
export function calculateInstallment(price: number, currency: string = 'GHS') {
  const downPaymentBps = 4000; // 40%
  const numInstallments = 3;

  const downPayment = Math.round((price * downPaymentBps) / 10000);
  const remaining = price - downPayment;
  const monthly = Math.ceil(remaining / numInstallments);

  return {
    downPayment,
    downPaymentFormatted: formatMoney(downPayment, currency),
    monthly,
    monthlyFormatted: formatMoney(monthly, currency),
    numInstallments,
    totalCost: downPayment + monthly * numInstallments,
    totalCostFormatted: formatMoney(downPayment + monthly * numInstallments, currency),
  };
}
