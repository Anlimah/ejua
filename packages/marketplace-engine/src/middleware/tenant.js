const { ValidationError } = require('@ejua/shared');

/**
 * Fastify plugin: Ensures every request has a valid tenant context.
 * For the initial single-tenant launch, this defaults to 'default'.
 * When multi-tenancy goes live, this validates against the tenants table.
 */
async function tenantPlugin(fastify) {
  fastify.addHook('onRequest', async (request) => {
    // tenant_id is set by auth middleware from JWT, or from header
    if (!request.tenantId) {
      request.tenantId = request.headers['x-tenant-id'] || 'default';
    }
  });
}

module.exports = tenantPlugin;
