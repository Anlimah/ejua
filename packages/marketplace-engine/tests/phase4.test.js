const { CURRENCIES, toSmallestUnit, fromSmallestUnit, formatMoney, bpsOf } = require('@ejua/shared');

describe('Exchange Rate Conversions', () => {
  // Simulated rates (USD pivot)
  const rates = {
    GHS: 0.0625,    // 1 GHS = $0.0625 → 1 USD = 16 GHS
    NGN: 0.000625,  // 1 NGN = $0.000625 → 1 USD = 1600 NGN
    XOF: 0.00155,   // 1 XOF = $0.00155 → 1 USD = 645.16 XOF
    USD: 1.0,
  };

  function convert(amount, from, to) {
    if (from === to) return amount;
    const fromCurrency = CURRENCIES[from];
    const toCurrency = CURRENCIES[to];
    const humanAmount = amount / fromCurrency.multiplier;
    const rate = rates[from] / rates[to];
    const convertedHuman = humanAmount * rate;
    return Math.round(convertedHuman * toCurrency.multiplier);
  }

  test('GHS to NGN conversion', () => {
    // 100 GHS (10000 pesewas) → NGN
    // 1 GHS = 0.0625/0.000625 = 100 NGN
    const result = convert(10000, 'GHS', 'NGN');
    expect(result).toBe(1000000); // 10,000 NGN (1,000,000 kobo)
    expect(formatMoney(result, 'NGN')).toBe('₦10,000.00');
  });

  test('NGN to GHS conversion', () => {
    // 10000 NGN (1000000 kobo) → GHS
    const result = convert(1000000, 'NGN', 'GHS');
    expect(result).toBe(10000); // 100 GHS (10000 pesewas)
    expect(formatMoney(result, 'GHS')).toBe('GH₵100.00');
  });

  test('GHS to USD conversion', () => {
    // 1600 GHS (160000 pesewas) → USD
    const result = convert(160000, 'GHS', 'USD');
    expect(result).toBe(10000); // $100.00 (10000 cents)
    expect(formatMoney(result, 'USD')).toBe('$100.00');
  });

  test('USD to GHS conversion', () => {
    // $100 (10000 cents) → GHS
    const result = convert(10000, 'USD', 'GHS');
    expect(result).toBe(160000); // 1600 GHS (160000 pesewas)
    expect(formatMoney(result, 'GHS')).toBe('GH₵1,600.00');
  });

  test('same currency returns same amount', () => {
    expect(convert(50000, 'GHS', 'GHS')).toBe(50000);
  });

  test('XOF handles zero decimal places correctly', () => {
    // 10 USD → XOF
    // 1 USD = 1/0.00155 = ~645 XOF
    const result = convert(1000, 'USD', 'XOF');
    // XOF multiplier is 1, so result is direct
    expect(result).toBeGreaterThan(6000);
    expect(result).toBeLessThan(7000);
    expect(formatMoney(result, 'XOF')).toMatch(/^CFA/);
  });
});

describe('Tenant Configuration', () => {
  const defaultConfig = {
    commission_bps: 1000,
    gateway_fee_bps: 300,
    escrow_days: 14,
    default_currency: 'GHS',
    supported_currencies: ['GHS'],
    bnpl_enabled: true,
    bnpl_down_payment_bps: 4000,
    bnpl_max_installments: 3,
    branding: {
      primary_color: '#1A1A2E',
      accent_color: '#E94560',
    },
    features: {
      flyer_generation: true,
      social_posting: true,
      ad_boost: false,
      multi_currency: false,
    },
  };

  test('default config has correct commission', () => {
    expect(defaultConfig.commission_bps).toBe(1000); // 10%
  });

  test('config merging preserves existing values', () => {
    const update = { commission_bps: 1500 };
    const merged = { ...defaultConfig, ...update };

    expect(merged.commission_bps).toBe(1500); // Updated
    expect(merged.escrow_days).toBe(14);      // Preserved
    expect(merged.branding.primary_color).toBe('#1A1A2E'); // Preserved
  });

  test('Nigeria tenant config example', () => {
    const ngConfig = {
      ...defaultConfig,
      default_currency: 'NGN',
      supported_currencies: ['NGN', 'USD'],
      features: { ...defaultConfig.features, multi_currency: true },
    };

    expect(ngConfig.default_currency).toBe('NGN');
    expect(ngConfig.supported_currencies).toContain('NGN');
    expect(ngConfig.features.multi_currency).toBe(true);
  });

  test('Francophone tenant config example', () => {
    const xofConfig = {
      ...defaultConfig,
      default_currency: 'XOF',
      supported_currencies: ['XOF'],
      commission_bps: 800, // Lower commission for new market
    };

    expect(xofConfig.default_currency).toBe('XOF');
    expect(xofConfig.commission_bps).toBe(800);
  });
});

describe('Per-Tenant Fee Structures', () => {
  test('calculates commission with tenant-specific rate', () => {
    const orderTotal = 100000; // GHS 1,000

    // Default tenant: 10%
    const defaultCommission = bpsOf(orderTotal, 1000);
    expect(defaultCommission).toBe(10000);

    // Premium tenant: 5%
    const premiumCommission = bpsOf(orderTotal, 500);
    expect(premiumCommission).toBe(5000);

    // High-volume tenant: 3%
    const bulkCommission = bpsOf(orderTotal, 300);
    expect(bulkCommission).toBe(3000);
  });

  test('gateway fees vary by provider', () => {
    const orderTotal = 50000; // GHS 500

    // Paystack GH: ~1.95% (but we use 3% default for simplicity)
    const paystackFee = bpsOf(orderTotal, 195);
    expect(paystackFee).toBe(975);

    // Flutterwave: ~1.4%
    const flutterwaveFee = bpsOf(orderTotal, 140);
    expect(flutterwaveFee).toBe(700);

    // Wave (XOF): ~1%
    const waveFee = bpsOf(orderTotal, 100);
    expect(waveFee).toBe(500);
  });
});

describe('API Key Generation', () => {
  test('key format matches expected pattern', () => {
    const prefix = 'ejua_pk_';
    const randomPart = 'a'.repeat(64); // 32 bytes hex = 64 chars
    const key = `${prefix}${randomPart}`;

    expect(key).toMatch(/^ejua_pk_[a-f0-9]{64}$/);
    expect(key.substring(0, 16)).toBe('ejua_pk_aaaaaaaa');
  });

  test('key prefix is first 16 characters', () => {
    const key = 'ejua_pk_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890abc';
    const prefix = key.substring(0, 16);

    expect(prefix).toBe('ejua_pk_abc123de');
    expect(prefix.length).toBe(16);
  });
});

describe('Payment Provider Mapping', () => {
  const providerMap = {
    GH: { provider: 'paystack', currency: 'GHS', label: 'Paystack Ghana' },
    NG: { provider: 'paystack', currency: 'NGN', label: 'Paystack Nigeria' },
    SN: { provider: 'wave', currency: 'XOF', label: 'Wave Senegal' },
    CI: { provider: 'wave', currency: 'XOF', label: 'Wave Côte d\'Ivoire' },
    KE: { provider: 'mpesa', currency: 'KES', label: 'M-Pesa Kenya' },
  };

  test('Ghana uses Paystack with GHS', () => {
    expect(providerMap['GH'].provider).toBe('paystack');
    expect(providerMap['GH'].currency).toBe('GHS');
  });

  test('Nigeria uses Paystack with NGN', () => {
    expect(providerMap['NG'].provider).toBe('paystack');
    expect(providerMap['NG'].currency).toBe('NGN');
  });

  test('Francophone countries use Wave with XOF', () => {
    expect(providerMap['SN'].provider).toBe('wave');
    expect(providerMap['CI'].provider).toBe('wave');
    expect(providerMap['SN'].currency).toBe('XOF');
  });
});

describe('Consolidated Reporting', () => {
  test('aggregates revenue across tenants in USD', () => {
    const tenants = [
      { name: 'Ejua GH', revenue_usd: 50000 },  // $500
      { name: 'Ejua NG', revenue_usd: 30000 },   // $300
      { name: 'Ejua SN', revenue_usd: 10000 },   // $100
    ];

    const totalUsd = tenants.reduce((sum, t) => sum + t.revenue_usd, 0);
    expect(totalUsd).toBe(90000); // $900 total
    expect(formatMoney(totalUsd, 'USD')).toBe('$900.00');
  });

  test('calculates ROAS per tenant', () => {
    const adSpend = 5000;     // $50 in ads
    const orderRevenue = 75000; // $750 in orders
    const roas = (orderRevenue / adSpend).toFixed(2);

    expect(roas).toBe('15.00'); // 15x return
  });
});
