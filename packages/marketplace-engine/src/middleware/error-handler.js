const { AppError, errorResponse } = require('@ejua/shared');
const logger = require('../utils/logger');

/**
 * Fastify error handler plugin.
 * Maps AppError subclasses to proper HTTP responses.
 */
async function errorHandler(fastify) {
  fastify.setErrorHandler((error, request, reply) => {
    // Our custom errors
    if (error instanceof AppError) {
      logger.warn(
        { err: error, requestId: request.id, path: request.url },
        `App error: ${error.code}`
      );
      return reply.status(error.statusCode).send(errorResponse(error.toJSON()));
    }

    // Fastify validation errors (from JSON schema)
    if (error.validation) {
      const errors = error.validation.map((v) => ({
        code: 'VALIDATION_ERROR',
        message: v.message,
        field: v.instancePath?.replace('/', '') || v.params?.missingProperty || null,
      }));
      return reply.status(400).send(errorResponse(errors));
    }

    // Unknown errors
    logger.error(
      { err: error, requestId: request.id, path: request.url },
      'Unhandled error'
    );

    const message =
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error.message;

    return reply.status(500).send(
      errorResponse({ code: 'INTERNAL_ERROR', message })
    );
  });
}

module.exports = errorHandler;
