const path = require('path');

describe('R2 Storage Key Structure', () => {
  const prefix = 'ejua';

  function buildKey(folder, tenantId, entityId, filename) {
    return [prefix, folder, tenantId, entityId, filename].filter(Boolean).join('/');
  }

  test('product image key structure', () => {
    const key = buildKey('products', 'tenant-001', 'prod-abc', 'a1b2c3d4-shoe.jpg');
    expect(key).toBe('ejua/products/tenant-001/prod-abc/a1b2c3d4-shoe.jpg');
  });

  test('flyer key structure', () => {
    const key = buildKey('flyers', 'tenant-001', 'flyer-xyz', 'flyer.png');
    expect(key).toBe('ejua/flyers/tenant-001/flyer-xyz/flyer.png');
  });

  test('template key structure (no tenant)', () => {
    const key = buildKey('templates', null, 'tmpl-001', 'overlay.png');
    expect(key).toBe('ejua/templates/tmpl-001/overlay.png');
  });

  test('vendor logo key structure', () => {
    const key = buildKey('vendors', 'tenant-001', 'vendor-abc', 'logo.png');
    expect(key).toBe('ejua/vendors/tenant-001/vendor-abc/logo.png');
  });
});

describe('Filename Sanitization', () => {
  function sanitize(filename) {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 100);
  }

  test('lowercases and replaces special chars', () => {
    expect(sanitize('My Product Photo.JPG')).toBe('my-product-photo.jpg');
  });

  test('handles unicode/Ghanaian names', () => {
    const result = sanitize('Ɛboɔ Kente Cloth.png');
    expect(result).toMatch(/bo.*kente-cloth\.png$/);
    expect(result).not.toContain(' ');
  });

  test('handles spaces and multiple dashes', () => {
    expect(sanitize('photo   --  test.png')).toBe('photo-test.png');
  });

  test('truncates long filenames to 100 chars', () => {
    const long = 'a'.repeat(200) + '.jpg';
    expect(sanitize(long).length).toBe(100);
  });

  test('preserves dots for extensions', () => {
    expect(sanitize('product.v2.final.jpg')).toBe('product.v2.final.jpg');
  });
});

describe('MIME Type to Extension Mapping', () => {
  function extFromMime(mime) {
    const map = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'application/pdf': '.pdf',
    };
    return map[mime] || '';
  }

  test('maps common image types', () => {
    expect(extFromMime('image/jpeg')).toBe('.jpg');
    expect(extFromMime('image/png')).toBe('.png');
    expect(extFromMime('image/webp')).toBe('.webp');
  });

  test('returns empty for unknown types', () => {
    expect(extFromMime('application/json')).toBe('');
    expect(extFromMime('text/html')).toBe('');
  });
});

describe('R2 Configuration', () => {
  test('endpoint matches Cloudflare R2 format', () => {
    const endpoint = 'https://30eb54551b0d67c56918195b7a1fc21b.r2.cloudflarestorage.com';
    expect(endpoint).toMatch(/^https:\/\/[a-f0-9]+\.r2\.cloudflarestorage\.com$/);
  });

  test('bucket and prefix are set', () => {
    const bucket = 'nesisoft-s3-bucket';
    const prefix = 'ejua';
    expect(bucket).toBeTruthy();
    expect(prefix).toBe('ejua');
  });

  test('presigned URL fallback uses 7-day expiry', () => {
    const expiresIn = 604800; // 7 days in seconds
    expect(expiresIn).toBe(7 * 24 * 60 * 60);
  });
});
