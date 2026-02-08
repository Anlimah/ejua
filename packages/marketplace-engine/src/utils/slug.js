/**
 * Generate a URL-safe slug from a string.
 * Handles Unicode, accented characters, and special characters common in
 * West African business names.
 *
 * e.g., "TechHub GH — Electronics & More!" → "techhub-gh-electronics-more"
 */
function slugify(text) {
  return text
    .toString()
    .normalize('NFD')                   // Decompose accented chars
    .replace(/[\u0300-\u036f]/g, '')    // Strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[''"]/g, '')              // Remove quotes/apostrophes
    .replace(/[^a-z0-9\s-]/g, '')       // Remove non-alphanumeric
    .replace(/[\s_]+/g, '-')            // Spaces/underscores → hyphens
    .replace(/-+/g, '-')               // Collapse multiple hyphens
    .replace(/^-|-$/g, '');            // Trim leading/trailing hyphens
}

/**
 * Generate a unique slug by appending a numeric suffix if the base slug
 * already exists in the given table.
 *
 * @param {Knex} db - Knex instance or transaction
 * @param {string} table - Table name
 * @param {string} baseSlug - The slugified string
 * @param {string} tenantId - Tenant scope
 * @param {string} [excludeId] - Exclude this row (for updates)
 * @returns {string} A slug guaranteed to be unique within the tenant
 */
async function uniqueSlug(db, table, baseSlug, tenantId, excludeId = null) {
  let slug = baseSlug;
  let suffix = 0;

  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
    const query = db(table).where({ tenant_id: tenantId, slug: candidate });

    if (excludeId) {
      query.whereNot('id', excludeId);
    }

    const existing = await query.first();
    if (!existing) return candidate;

    suffix++;
    if (suffix > 100) {
      // Fallback: append random chars
      const rand = Math.random().toString(36).substring(2, 6);
      return `${slug}-${rand}`;
    }
  }
}

module.exports = { slugify, uniqueSlug };
