/**
 * Apply cursor-based pagination to a Knex query.
 *
 * Uses created_at + id as the cursor to guarantee stable ordering
 * even when rows share the same timestamp.
 *
 * @param {Knex.QueryBuilder} query - Base query (before limit/offset)
 * @param {Object} opts
 * @param {string} [opts.cursor] - Opaque cursor from previous response (base64 of created_at|id)
 * @param {number} [opts.limit=20] - Page size (max 100)
 * @param {string} [opts.sortBy='created_at'] - Column to sort on
 * @param {string} [opts.sortDir='desc'] - 'asc' or 'desc'
 * @returns {{ data: Array, pagination: Object }}
 */
async function paginate(query, opts = {}) {
  const limit = Math.min(Math.max(parseInt(opts.limit) || 20, 1), 100);
  const sortBy = opts.sortBy || 'created_at';
  const sortDir = opts.sortDir === 'asc' ? 'asc' : 'desc';

  // Decode cursor
  if (opts.cursor) {
    try {
      const decoded = Buffer.from(opts.cursor, 'base64').toString('utf-8');
      const [cursorTime, cursorId] = decoded.split('|');

      if (sortDir === 'desc') {
        query.where(function () {
          this.where(sortBy, '<', cursorTime)
            .orWhere(function () {
              this.where(sortBy, '=', cursorTime).where('id', '<', cursorId);
            });
        });
      } else {
        query.where(function () {
          this.where(sortBy, '>', cursorTime)
            .orWhere(function () {
              this.where(sortBy, '=', cursorTime).where('id', '>', cursorId);
            });
        });
      }
    } catch {
      // Invalid cursor, ignore
    }
  }

  // Fetch one extra row to determine has_more
  const rows = await query
    .orderBy(sortBy, sortDir)
    .orderBy('id', sortDir)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  // Build next cursor
  let nextCursor = null;
  if (hasMore && data.length > 0) {
    const lastRow = data[data.length - 1];
    const cursorValue = lastRow[sortBy] instanceof Date
      ? lastRow[sortBy].toISOString()
      : String(lastRow[sortBy]);
    nextCursor = Buffer.from(`${cursorValue}|${lastRow.id}`).toString('base64');
  }

  return {
    data,
    pagination: {
      nextCursor,
      hasMore,
      count: data.length,
    },
  };
}

/**
 * Parse common query parameters for list endpoints.
 */
function parseListParams(query) {
  return {
    cursor: query.cursor || null,
    limit: parseInt(query.limit) || 20,
    sortBy: query.sort_by || 'created_at',
    sortDir: query.sort_dir || 'desc',
    search: query.search || null,
  };
}

module.exports = { paginate, parseListParams };
