/**
 * Base application error class.
 * All custom errors extend this for consistent error handling.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', field = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.field && { field: this.field }),
    };
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR', field);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource', id = '') {
    super(`${resource} not found${id ? `: ${id}` : ''}`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

class InsufficientFundsError extends AppError {
  constructor(walletId) {
    super(`Insufficient funds in wallet: ${walletId}`, 422, 'INSUFFICIENT_FUNDS');
  }
}

class PaymentError extends AppError {
  constructor(message, provider = 'unknown') {
    super(message, 502, 'PAYMENT_ERROR');
    this.provider = provider;
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message) {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  InsufficientFundsError,
  PaymentError,
  ExternalServiceError,
};
