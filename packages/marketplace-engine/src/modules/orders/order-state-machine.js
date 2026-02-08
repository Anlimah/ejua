const { ValidationError, OrderStatus } = require('@ejua/shared');

/**
 * Valid order status transitions.
 * Each key maps to an array of statuses it can transition to.
 */
const TRANSITIONS = {
  [OrderStatus.CREATED]:        [OrderStatus.BNPL_PENDING, OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.BNPL_PENDING]:   [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]:      [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]:     [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]:        [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]:      [OrderStatus.RETURN_WINDOW],
  [OrderStatus.RETURN_WINDOW]:  [OrderStatus.SETTLED, OrderStatus.REFUNDED],
  [OrderStatus.SETTLED]:        [], // Terminal
  [OrderStatus.CANCELLED]:      [], // Terminal
  [OrderStatus.REFUNDED]:       [], // Terminal
};

/**
 * Validate and perform a status transition.
 * Throws ValidationError if the transition is not allowed.
 *
 * @param {string} currentStatus
 * @param {string} newStatus
 * @returns {string} The new status (for chaining)
 */
function validateTransition(currentStatus, newStatus) {
  const allowed = TRANSITIONS[currentStatus];

  if (!allowed) {
    throw new ValidationError(`Unknown order status: ${currentStatus}`, 'status');
  }

  if (!allowed.includes(newStatus)) {
    throw new ValidationError(
      `Cannot transition order from '${currentStatus}' to '${newStatus}'. Allowed: ${allowed.join(', ') || 'none (terminal state)'}`,
      'status'
    );
  }

  return newStatus;
}

/**
 * Check if a status is terminal (no further transitions).
 */
function isTerminal(status) {
  return (TRANSITIONS[status] || []).length === 0;
}

/**
 * Get allowed next statuses for the current status.
 */
function getAllowedTransitions(status) {
  return TRANSITIONS[status] || [];
}

module.exports = { validateTransition, isTerminal, getAllowedTransitions, TRANSITIONS };
