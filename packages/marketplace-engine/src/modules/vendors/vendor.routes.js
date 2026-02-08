const vendorService = require('./vendor.service');
const { successResponse, paginatedResponse } = require('@ejua/shared');
const { parseListParams } = require('../../utils/pagination');

async function vendorRoutes(fastify) {
  // ─── REGISTER VENDOR STORE ─────────────────
  fastify.post('/vendors', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor')],
    schema: {
      body: {
        type: 'object',
        required: ['store_name'],
        properties: {
          store_name: { type: 'string', minLength: 2, maxLength: 255 },
          description: { type: 'string', maxLength: 2000 },
          phone: { type: 'string' },
          email: { type: 'string', format: 'email' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              region: { type: 'string' },
              country: { type: 'string', default: 'GH' },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const vendor = await vendorService.register(
        request.tenantId,
        request.user.id,
        request.body
      );
      return reply.status(201).send(successResponse(vendor));
    },
  });

  // ─── LIST VENDORS (public) ─────────────────
  fastify.get('/vendors', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          search: { type: 'string' },
          sort_by: { type: 'string', enum: ['created_at', 'store_name'] },
          sort_dir: { type: 'string', enum: ['asc', 'desc'] },
        },
      },
    },
    handler: async (request) => {
      const tenantId = request.headers['x-tenant-id'] || 'default';
      const params = parseListParams(request.query);
      const { data, pagination } = await vendorService.list(tenantId, params);
      return paginatedResponse(data, pagination);
    },
  });

  // ─── GET VENDOR BY ID ──────────────────────
  fastify.get('/vendors/:vendorId', {
    handler: async (request) => {
      const tenantId = request.headers['x-tenant-id'] || 'default';
      const vendor = await vendorService.getById(request.params.vendorId, tenantId);
      return successResponse(vendor);
    },
  });

  // ─── GET VENDOR BY SLUG (storefront) ───────
  fastify.get('/stores/:slug', {
    handler: async (request) => {
      const tenantId = request.headers['x-tenant-id'] || 'default';
      const vendor = await vendorService.getBySlug(request.params.slug, tenantId);
      return successResponse(vendor);
    },
  });

  // ─── UPDATE VENDOR PROFILE ─────────────────
  fastify.patch('/vendors/:vendorId', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    schema: {
      body: {
        type: 'object',
        properties: {
          store_name: { type: 'string', minLength: 2, maxLength: 255 },
          description: { type: 'string', maxLength: 2000 },
          phone: { type: 'string' },
          email: { type: 'string', format: 'email' },
          logo_url: { type: 'string', format: 'uri' },
          banner_url: { type: 'string', format: 'uri' },
          address: { type: 'object' },
        },
      },
    },
    handler: async (request) => {
      const vendor = await vendorService.update(
        request.params.vendorId,
        request.tenantId,
        request.body
      );
      return successResponse(vendor);
    },
  });

  // ─── VENDOR DASHBOARD ──────────────────────
  fastify.get('/vendors/:vendorId/dashboard', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    handler: async (request) => {
      const dashboard = await vendorService.getDashboard(
        request.params.vendorId,
        request.tenantId
      );
      return successResponse(dashboard);
    },
  });

  // ─── KYC STATUS (admin only) ───────────────
  fastify.patch('/vendors/:vendorId/kyc', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['kyc_status'],
        properties: {
          kyc_status: { type: 'string', enum: ['submitted', 'verified', 'rejected', 'suspended'] },
          kyc_data: { type: 'object' },
        },
      },
    },
    handler: async (request) => {
      const vendor = await vendorService.updateKycStatus(
        request.params.vendorId,
        request.tenantId,
        request.body.kyc_status,
        request.body.kyc_data
      );
      return successResponse(vendor);
    },
  });

  // ─── VENDOR COMMISSION (admin only) ────────
  fastify.patch('/vendors/:vendorId/commission', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['commission_bps'],
        properties: {
          commission_bps: { type: 'integer', minimum: 0, maximum: 5000 },
        },
      },
    },
    handler: async (request) => {
      const vendor = await vendorService.updateCommission(
        request.params.vendorId,
        request.tenantId,
        request.body.commission_bps
      );
      return successResponse(vendor);
    },
  });
}

module.exports = vendorRoutes;
