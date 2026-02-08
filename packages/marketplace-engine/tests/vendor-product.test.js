const { slugify } = require('../src/utils/slug');

describe('Slug Utility', () => {
  describe('slugify', () => {
    test('converts basic text to slug', () => {
      expect(slugify('TechHub GH')).toBe('techhub-gh');
    });

    test('handles special characters', () => {
      expect(slugify('Electronics & More!')).toBe('electronics-more');
      expect(slugify('Ama\'s Fashion')).toBe('amas-fashion');
    });

    test('handles dashes and em-dashes', () => {
      expect(slugify('TechHub GH — Electronics')).toBe('techhub-gh-electronics');
    });

    test('handles accented characters', () => {
      expect(slugify('Café Résumé')).toBe('cafe-resume');
    });

    test('collapses multiple spaces and hyphens', () => {
      expect(slugify('  too   many   spaces  ')).toBe('too-many-spaces');
      expect(slugify('too---many---hyphens')).toBe('too-many-hyphens');
    });

    test('handles empty and edge cases', () => {
      expect(slugify('')).toBe('');
      expect(slugify('---')).toBe('');
      expect(slugify('123')).toBe('123');
    });

    test('handles typical Ghanaian business names', () => {
      expect(slugify('Kwame\'s Phone Palace')).toBe('kwames-phone-palace');
      expect(slugify('Makola Market Deals #1')).toBe('makola-market-deals-1');
      expect(slugify('Osu Oxford Street Boutique')).toBe('osu-oxford-street-boutique');
    });
  });
});

describe('Installment Preview Calculation', () => {
  const { bpsOf, formatMoney } = require('@ejua/shared');

  test('calculates correct monthly amount for typical product', () => {
    // Samsung Galaxy A15 at GHS 2,599.00 (259900 pesewas)
    const price = 259900;
    const downPayment = bpsOf(price, 4000); // 40%
    const remaining = price - downPayment;
    const monthly = Math.ceil(remaining / 3);

    expect(downPayment).toBe(103960);
    expect(remaining).toBe(155940);
    expect(monthly).toBe(51980);
    expect(formatMoney(monthly, 'GHS')).toBe('GH₵519.80');
  });

  test('handles sale prices', () => {
    const salePrice = 199900; // GHS 1,999.00
    const downPayment = bpsOf(salePrice, 4000);
    const remaining = salePrice - downPayment;
    const monthly = Math.ceil(remaining / 3);

    expect(downPayment).toBe(79960);
    expect(monthly).toBe(39980);
    expect(formatMoney(monthly, 'GHS')).toBe('GH₵399.80');
  });

  test('handles cheap products', () => {
    const price = 5000; // GHS 50.00
    const downPayment = bpsOf(price, 4000);
    const remaining = price - downPayment;
    const monthly = Math.ceil(remaining / 3);

    expect(downPayment).toBe(2000);
    expect(monthly).toBe(1000);
    expect(formatMoney(monthly, 'GHS')).toBe('GH₵10.00');
  });

  test('handles NGN products', () => {
    const price = 1500000; // NGN 15,000.00
    const downPayment = bpsOf(price, 4000);
    const monthly = Math.ceil((price - downPayment) / 3);

    expect(formatMoney(downPayment, 'NGN')).toBe('₦6,000.00');
    expect(formatMoney(monthly, 'NGN')).toBe('₦3,000.00');
  });
});

describe('KYC Status Transitions', () => {
  // Mirrors the validation logic in vendor.service.js
  const validTransitions = {
    pending: ['submitted'],
    submitted: ['verified', 'rejected'],
    verified: ['suspended'],
    rejected: ['submitted'],
    suspended: ['verified'],
  };

  test('pending can only go to submitted', () => {
    expect(validTransitions['pending']).toEqual(['submitted']);
  });

  test('submitted can go to verified or rejected', () => {
    expect(validTransitions['submitted']).toContain('verified');
    expect(validTransitions['submitted']).toContain('rejected');
  });

  test('rejected can resubmit', () => {
    expect(validTransitions['rejected']).toContain('submitted');
  });

  test('verified can only be suspended', () => {
    expect(validTransitions['verified']).toEqual(['suspended']);
  });

  test('suspended can be reinstated to verified', () => {
    expect(validTransitions['suspended']).toContain('verified');
  });

  test('no transition allows skipping verification', () => {
    // Can't go from pending directly to verified
    expect(validTransitions['pending']).not.toContain('verified');
  });
});
