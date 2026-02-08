/**
 * Unit tests for the money validation and split calculation logic.
 * These tests don't require a database connection.
 */

const { validateAmount, validateCurrency, validateSplitTotal, bpsOf } = require('@ejua/shared');
const { toSmallestUnit, fromSmallestUnit, formatMoney } = require('@ejua/shared');

describe('Money Validators', () => {
  describe('validateAmount', () => {
    test('accepts positive integers', () => {
      expect(validateAmount(100)).toBe(true);
      expect(validateAmount(0)).toBe(true);
      expect(validateAmount(259900)).toBe(true);
    });

    test('rejects negative numbers', () => {
      expect(() => validateAmount(-1)).toThrow();
    });

    test('rejects floating point', () => {
      expect(() => validateAmount(25.99)).toThrow();
    });
  });

  describe('validateCurrency', () => {
    test('accepts supported currencies', () => {
      expect(validateCurrency('GHS')).toBe(true);
      expect(validateCurrency('NGN')).toBe(true);
      expect(validateCurrency('XOF')).toBe(true);
      expect(validateCurrency('USD')).toBe(true);
    });

    test('rejects unsupported currencies', () => {
      expect(() => validateCurrency('EUR')).toThrow();
      expect(() => validateCurrency('BTC')).toThrow();
    });
  });

  describe('validateSplitTotal', () => {
    test('passes when splits sum to total', () => {
      const splits = [
        { amount: 220915 },
        { amount: 31188 },
        { amount: 7797 },
      ];
      expect(validateSplitTotal(splits, 259900)).toBe(true);
    });

    test('fails when splits do not sum to total', () => {
      const splits = [
        { amount: 220000 },
        { amount: 31000 },
        { amount: 7000 },
      ];
      expect(() => validateSplitTotal(splits, 259900)).toThrow(/do not equal/);
    });
  });

  describe('bpsOf', () => {
    test('calculates basis points correctly', () => {
      // 10% of 259900 = 25990
      expect(bpsOf(259900, 1000)).toBe(25990);

      // 3% of 259900 = 7797
      expect(bpsOf(259900, 300)).toBe(7797);

      // 40% of 259900 = 103960
      expect(bpsOf(259900, 4000)).toBe(103960);

      // 2% of 50000 = 1000
      expect(bpsOf(50000, 200)).toBe(1000);
    });

    test('handles zero amount', () => {
      expect(bpsOf(0, 1000)).toBe(0);
    });
  });
});

describe('Currency Helpers', () => {
  describe('toSmallestUnit', () => {
    test('converts GHS to pesewas', () => {
      expect(toSmallestUnit(25.99, 'GHS')).toBe(2599);
      expect(toSmallestUnit(2599.00, 'GHS')).toBe(259900);
    });

    test('handles XOF (no decimal)', () => {
      expect(toSmallestUnit(500, 'XOF')).toBe(500);
    });
  });

  describe('fromSmallestUnit', () => {
    test('converts pesewas to GHS', () => {
      expect(fromSmallestUnit(259900, 'GHS')).toBe(2599);
      expect(fromSmallestUnit(100, 'GHS')).toBe(1);
    });
  });

  describe('formatMoney', () => {
    test('formats GHS amounts', () => {
      expect(formatMoney(259900, 'GHS')).toBe('GH₵2,599.00');
      expect(formatMoney(100, 'GHS')).toBe('GH₵1.00');
    });

    test('formats NGN amounts', () => {
      expect(formatMoney(1500000, 'NGN')).toBe('₦15,000.00');
    });

    test('formats XOF amounts (no decimals)', () => {
      expect(formatMoney(5000, 'XOF')).toBe('CFA5,000');
    });
  });
});

describe('Payment Split Calculation', () => {
  test('standard split: 10% commission, 3% gateway', () => {
    const totalAmount = 259900; // GHS 2,599.00
    const gatewayFeeBps = 300;
    const commissionBps = 1000;

    const gatewayFee = bpsOf(totalAmount, gatewayFeeBps);    // 7797
    const net = totalAmount - gatewayFee;                      // 252103
    const commission = bpsOf(net, commissionBps);              // 25210
    const vendorPayout = net - commission;                     // 226893

    expect(gatewayFee + commission + vendorPayout).toBe(totalAmount);
    expect(gatewayFee).toBe(7797);
    expect(commission).toBe(25210);
    expect(vendorPayout).toBe(226893);
  });

  test('installment breakdown: 40% down, 3 monthly', () => {
    const totalAmount = 259900;
    const downPaymentBps = 4000;

    const downPayment = bpsOf(totalAmount, downPaymentBps);   // 103960
    const remaining = totalAmount - downPayment;                // 155940
    const baseInstallment = Math.floor(remaining / 3);          // 51980
    const lastInstallment = remaining - baseInstallment * 2;   // 51980

    expect(downPayment + baseInstallment * 2 + lastInstallment).toBe(totalAmount);
    expect(downPayment).toBe(103960);
    expect(baseInstallment).toBe(51980);
  });
});
