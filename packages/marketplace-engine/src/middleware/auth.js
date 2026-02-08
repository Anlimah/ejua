const jwt = require('jsonwebtoken');
const config = require('../config');
const { UnauthorizedError, ForbiddenError } = require('@ejua/shared');

/**
 * Fastify plugin: Decorate request with `user` and `tenantId`.
 * Adds an `authenticate` preHandler hook.
 */
async function authPlugin(fastify) {
  // Decorate so Fastify knows these properties exist
  fastify.decorateRequest('user', null);
  fastify.decorateRequest('tenantId', null);

  /**
   * preHandler: Verify JWT from Authorization header.
   */
  fastify.decorate('authenticate', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, config.jwt.secret);
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role, // 'vendor' | 'customer' | 'admin'
        vendorId: payload.vendorId || null,
      };
      // tenant_id comes from the token or from a header override (for white-label)
      request.tenantId = request.headers['x-tenant-id'] || payload.tenantId || 'default';
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Token expired');
      }
      throw new UnauthorizedError('Invalid token');
    }
  });

  /**
   * Role-based access control.
   * Usage: { preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')] }
   */
  fastify.decorate('requireRole', (...roles) => {
    return async (request, reply) => {
      if (!request.user || !roles.includes(request.user.role)) {
        throw new ForbiddenError(`Requires role: ${roles.join(' or ')}`);
      }
    };
  });
}

module.exports = authPlugin;
