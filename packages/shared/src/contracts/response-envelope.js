/**
 * Standard response envelope for all Ejua API responses.
 * Every endpoint wraps its response in this structure.
 */

function successResponse(data, meta = {}) {
  return {
    status: 'success',
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
    errors: null,
  };
}

function errorResponse(errors, statusCode = 400) {
  return {
    status: 'error',
    data: null,
    meta: {
      timestamp: new Date().toISOString(),
    },
    errors: Array.isArray(errors) ? errors : [errors],
  };
}

function paginatedResponse(data, pagination) {
  return successResponse(data, {
    pagination: {
      next_cursor: pagination.nextCursor || null,
      has_more: pagination.hasMore || false,
      total_count: pagination.totalCount || null,
    },
  });
}

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse,
};
