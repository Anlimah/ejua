const {
  BUILT_IN_TEMPLATES,
  getTemplate,
  listTemplates,
  createTextSvg,
  createBadgeSvg,
} = require('../src/modules/templates/template.engine');

const { formatMoney, bpsOf } = require('@ejua/shared');

describe('Template Engine', () => {
  describe('Built-in Templates', () => {
    test('has 10 built-in templates', () => {
      expect(Object.keys(BUILT_IN_TEMPLATES)).toHaveLength(10);
    });

    test('each template has required properties', () => {
      for (const [id, template] of Object.entries(BUILT_IN_TEMPLATES)) {
        expect(template).toHaveProperty('id', id);
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('description');
        expect(template).toHaveProperty('background');
        expect(template).toHaveProperty('accent');
        expect(template).toHaveProperty('priceColor');
        expect(template).toHaveProperty('textColor');
        expect(template).toHaveProperty('badgeColor');
        expect(template).toHaveProperty('category');
      }
    });

    test('backgrounds are valid RGB objects', () => {
      for (const template of Object.values(BUILT_IN_TEMPLATES)) {
        const { r, g, b } = template.background;
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
      }
    });

    test('covers diverse categories', () => {
      const categories = Object.values(BUILT_IN_TEMPLATES).map((t) => t.category);
      expect(categories).toContain('minimal');
      expect(categories).toContain('luxury');
      expect(categories).toContain('tech');
      expect(categories).toContain('fashion');
      expect(categories).toContain('beauty');
      expect(categories).toContain('sale');
    });
  });

  describe('getTemplate', () => {
    test('returns matching template', () => {
      const t = getTemplate('dark-luxury');
      expect(t.name).toBe('Dark Luxury');
    });

    test('falls back to clean-white for unknown ID', () => {
      const t = getTemplate('non-existent');
      expect(t.id).toBe('clean-white');
    });
  });

  describe('listTemplates', () => {
    test('returns simplified list', () => {
      const list = listTemplates();
      expect(list).toHaveLength(10);
      expect(list[0]).toHaveProperty('id');
      expect(list[0]).toHaveProperty('name');
      expect(list[0]).toHaveProperty('description');
      expect(list[0]).toHaveProperty('category');
      // Should NOT have internal properties
      expect(list[0]).not.toHaveProperty('background');
      expect(list[0]).not.toHaveProperty('accent');
    });
  });

  describe('SVG Text Generation', () => {
    test('createTextSvg returns valid SVG buffer', () => {
      const svg = createTextSvg('Hello World', { width: 1080, height: 100 });
      expect(Buffer.isBuffer(svg)).toBe(true);
      const svgString = svg.toString();
      expect(svgString).toContain('<svg');
      expect(svgString).toContain('Hello World');
      expect(svgString).toContain('width="1080"');
    });

    test('escapes special XML characters', () => {
      const svg = createTextSvg('Price < GH₵100 & More', { width: 500, height: 50 });
      const svgString = svg.toString();
      expect(svgString).toContain('&lt;');
      expect(svgString).toContain('&amp;');
    });

    test('createBadgeSvg creates badge with background', () => {
      const svg = createBadgeSvg('From GH₵519.80/mo', {
        width: 300,
        height: 60,
        bgColor: '#E94560',
      });
      const svgString = svg.toString();
      expect(svgString).toContain('<rect');
      expect(svgString).toContain('#E94560');
      expect(svgString).toContain('519.80');
    });
  });
});

describe('Flyer Installment Price Rendering', () => {
  test('formats GHS installment correctly for flyer badge', () => {
    const price = 259900; // GHS 2,599.00
    const downPayment = bpsOf(price, 4000); // 40%
    const monthly = Math.ceil((price - downPayment) / 3);
    const formatted = formatMoney(monthly, 'GHS');

    expect(formatted).toBe('GH₵519.80');
    expect(`From ${formatted}/mo`).toBe('From GH₵519.80/mo');
  });

  test('formats NGN installment for flyer badge', () => {
    const price = 7500000; // NGN 75,000
    const downPayment = bpsOf(price, 4000);
    const monthly = Math.ceil((price - downPayment) / 3);

    expect(formatMoney(monthly, 'NGN')).toBe('₦15,000.00');
  });

  test('handles very cheap products', () => {
    const price = 999; // GHS 9.99
    const downPayment = bpsOf(price, 4000);
    const monthly = Math.ceil((price - downPayment) / 3);

    expect(formatMoney(monthly, 'GHS')).toBe('GH₵2.00');
  });
});

describe('Template Selection by Category', () => {
  const categoryMap = {};
  for (const t of Object.values(BUILT_IN_TEMPLATES)) {
    categoryMap[t.category] = t.id;
  }

  test('can find templates for common product categories', () => {
    // A vendor selling phones should get the tech template
    expect(categoryMap['tech']).toBe('vibrant-orange');

    // Fashion/clothing
    expect(categoryMap['fashion']).toBe('afro-pattern');

    // Beauty products
    expect(categoryMap['beauty']).toBe('pastel-dream');

    // Food/organic
    expect(categoryMap['organic']).toBe('fresh-green');

    // Sale/promotional
    expect(categoryMap['sale']).toBe('bold-red');

    // Jewelry/accessories
    expect(categoryMap['jewelry']).toBe('classic-gold');
  });
});
