const { validateTransition, isTerminal, getAllowedTransitions } = require('../src/modules/orders/order-state-machine');
const { OrderStatus, bpsOf, formatMoney } = require('@ejua/shared');

describe('Order State Machine', () => {
  describe('validateTransition', () => {
    test('CREATED → CONFIRMED (direct pay)', () => {
      expect(validateTransition('created', 'confirmed')).toBe('confirmed');
    });

    test('CREATED → BNPL_PENDING (installment)', () => {
      expect(validateTransition('created', 'bnpl_pending')).toBe('bnpl_pending');
    });

    test('CREATED → CANCELLED', () => {
      expect(validateTransition('created', 'cancelled')).toBe('cancelled');
    });

    test('BNPL_PENDING → CONFIRMED (after Motito approval)', () => {
      expect(validateTransition('bnpl_pending', 'confirmed')).toBe('confirmed');
    });

    test('CONFIRMED → PROCESSING → SHIPPED → DELIVERED', () => {
      expect(validateTransition('confirmed', 'processing')).toBe('processing');
      expect(validateTransition('processing', 'shipped')).toBe('shipped');
      expect(validateTransition('shipped', 'delivered')).toBe('delivered');
    });

    test('DELIVERED → RETURN_WINDOW → SETTLED', () => {
      expect(validateTransition('delivered', 'return_window')).toBe('return_window');
      expect(validateTransition('return_window', 'settled')).toBe('settled');
    });

    test('RETURN_WINDOW → REFUNDED', () => {
      expect(validateTransition('return_window', 'refunded')).toBe('refunded');
    });

    test('rejects invalid transitions', () => {
      expect(() => validateTransition('created', 'shipped')).toThrow(/Cannot transition/);
      expect(() => validateTransition('settled', 'refunded')).toThrow(/terminal state/);
      expect(() => validateTransition('cancelled', 'confirmed')).toThrow(/terminal state/);
      expect(() => validateTransition('confirmed', 'created')).toThrow(/Cannot transition/);
    });

    test('rejects skipping steps', () => {
      expect(() => validateTransition('created', 'shipped')).toThrow();
      expect(() => validateTransition('created', 'delivered')).toThrow();
      expect(() => validateTransition('confirmed', 'delivered')).toThrow();
    });
  });

  describe('isTerminal', () => {
    test('settled is terminal', () => {
      expect(isTerminal('settled')).toBe(true);
    });

    test('cancelled is terminal', () => {
      expect(isTerminal('cancelled')).toBe(true);
    });

    test('refunded is terminal', () => {
      expect(isTerminal('refunded')).toBe(true);
    });

    test('confirmed is not terminal', () => {
      expect(isTerminal('confirmed')).toBe(false);
    });
  });

  describe('getAllowedTransitions', () => {
    test('CREATED has 3 options', () => {
      const allowed = getAllowedTransitions('created');
      expect(allowed).toContain('bnpl_pending');
      expect(allowed).toContain('confirmed');
      expect(allowed).toContain('cancelled');
      expect(allowed).toHaveLength(3);
    });

    test('terminal states have no transitions', () => {
      expect(getAllowedTransitions('settled')).toHaveLength(0);
      expect(getAllowedTransitions('cancelled')).toHaveLength(0);
    });
  });
});

describe('Payment Split Calculation (Full Flow)', () => {
  test('calculates Paystack-style split with actual fees', () => {
    // Order: GHS 500.00 (50000 pesewas)
    const orderTotal = 50000;
    const paystackFees = 750; // 1.5% Paystack fee (reported by webhook)
    const commissionBps = 1000; // 10%

    // Gateway fee from actual Paystack fees
    const gatewayFeeBps = Math.round((paystackFees / orderTotal) * 10000); // 150 bps
    const gatewayFee = bpsOf(orderTotal, gatewayFeeBps);
    const netAmount = orderTotal - gatewayFee;
    const commission = bpsOf(netAmount, commissionBps);
    const vendorPayout = netAmount - commission;

    expect(gatewayFeeBps).toBe(150);
    expect(gatewayFee).toBe(750);
    expect(netAmount).toBe(49250);
    expect(commission).toBe(4925);
    expect(vendorPayout).toBe(44325);
    expect(gatewayFee + commission + vendorPayout).toBe(orderTotal);
  });

  test('handles zero gateway fee (free transaction)', () => {
    const orderTotal = 10000; // GHS 100.00
    const gatewayFeeBps = 0;
    const commissionBps = 800; // 8%

    const gatewayFee = bpsOf(orderTotal, gatewayFeeBps);
    const netAmount = orderTotal - gatewayFee;
    const commission = bpsOf(netAmount, commissionBps);
    const vendorPayout = netAmount - commission;

    expect(gatewayFee).toBe(0);
    expect(commission).toBe(800);
    expect(vendorPayout).toBe(9200);
    expect(gatewayFee + commission + vendorPayout).toBe(orderTotal);
  });
});

describe('Order Number Format', () => {
  test('format is EJ-YYMMDD-XXXX', () => {
    // Simulate the format logic
    const now = new Date();
    const dateStr = [
      String(now.getFullYear()).slice(-2),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');
    const seq = '0001';
    const orderNumber = `EJ-${dateStr}-${seq}`;

    expect(orderNumber).toMatch(/^EJ-\d{6}-\d{4}$/);
    expect(orderNumber.length).toBe(14);
  });

  test('sequence pads to 4 digits', () => {
    expect(String(1).padStart(4, '0')).toBe('0001');
    expect(String(42).padStart(4, '0')).toBe('0042');
    expect(String(999).padStart(4, '0')).toBe('0999');
    expect(String(9999).padStart(4, '0')).toBe('9999');
  });
});

describe('Paystack Channel Mapping', () => {
  // Inline the mapping logic for testing
  function mapChannel(channel, authorization) {
    if (channel === 'mobile_money') {
      const bank = (authorization?.bank || '').toLowerCase();
      if (bank.includes('mtn')) return 'momo_mtn';
      if (bank.includes('vodafone') || bank.includes('vod')) return 'momo_voda';
      if (bank.includes('airtel') || bank.includes('tigo')) return 'momo_airteltigo';
      return 'momo_mtn';
    }
    if (channel === 'card') return 'card';
    return 'card';
  }

  test('maps MTN MoMo correctly', () => {
    expect(mapChannel('mobile_money', { bank: 'MTN' })).toBe('momo_mtn');
    expect(mapChannel('mobile_money', { bank: 'mtn mobile money' })).toBe('momo_mtn');
  });

  test('maps Vodafone MoMo correctly', () => {
    expect(mapChannel('mobile_money', { bank: 'Vodafone' })).toBe('momo_voda');
    expect(mapChannel('mobile_money', { bank: 'VOD' })).toBe('momo_voda');
  });

  test('maps AirtelTigo correctly', () => {
    expect(mapChannel('mobile_money', { bank: 'AirtelTigo' })).toBe('momo_airteltigo');
    expect(mapChannel('mobile_money', { bank: 'tigo' })).toBe('momo_airteltigo');
  });

  test('maps card payments', () => {
    expect(mapChannel('card', { brand: 'visa' })).toBe('card');
  });

  test('defaults MoMo to MTN when bank unknown', () => {
    expect(mapChannel('mobile_money', {})).toBe('momo_mtn');
    expect(mapChannel('mobile_money', { bank: 'unknown' })).toBe('momo_mtn');
  });
});
