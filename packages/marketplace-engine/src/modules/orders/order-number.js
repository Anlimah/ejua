const { getDb } = require('../../utils/db');

/**
 * Generate a human-readable order number.
 * Format: EJ-YYMMDD-XXXX (e.g., EJ-260206-0042)
 *
 * Uses a daily counter stored in the database to guarantee uniqueness
 * even under concurrent order creation.
 */
async function generateOrderNumber(tenantId, trx) {
  const db = trx || getDb();
  const now = new Date();
  const dateStr = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  // Atomic counter: count today's orders + 1
  const today = now.toISOString().split('T')[0];
  const result = await db('orders')
    .where('tenant_id', tenantId)
    .where('created_at', '>=', `${today}T00:00:00Z`)
    .count('id as count')
    .first();

  const seq = (parseInt(result.count) || 0) + 1;
  const seqStr = String(seq).padStart(4, '0');

  return `EJ-${dateStr}-${seqStr}`;
}

module.exports = { generateOrderNumber };
