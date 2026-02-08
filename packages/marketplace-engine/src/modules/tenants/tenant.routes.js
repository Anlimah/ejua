const tenantService = require('./tenant.service');
const exchangeService = require('../currency/exchange-rate.service');
const { successResponse } = require('@ejua/shared');

async function tenantRoutes(fastify) {

  // ═══════════════════════════════════════════
  // TENANT MANAGEMENT (Platform Admin)
  // ═══════════════════════════════════════════

  fastify.post('/admin/tenants', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 255 },
          domain: { type: 'string' },
          logo_url: { type: 'string' },
          config: { type: 'object' },
        },
      },
    },
    handler: async (request, reply) => {
      const tenant = await tenantService.create(request.body);
      return reply.status(201).send(successResponse(tenant));
    },
  });

  fastify.get('/admin/tenants', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async () => {
      const tenants = await tenantService.list();
      return successResponse(tenants);
    },
  });

  fastify.get('/admin/tenants/:tenantId', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async (request) => {
      const tenant = await tenantService.getById(request.params.tenantId);
      return successResponse(tenant);
    },
  });

  fastify.patch('/admin/tenants/:tenantId', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async (request) => {
      const tenant = await tenantService.update(request.params.tenantId, request.body);
      return successResponse(tenant);
    },
  });

  // ─── CONFIGURATION ───────────────────────────

  fastify.patch('/admin/tenants/:tenantId/config', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async (request) => {
      const tenant = await tenantService.updateConfig(request.params.tenantId, request.body);
      return successResponse(tenant);
    },
  });

  fastify.get('/admin/tenants/:tenantId/features', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async (request) => {
      const features = await tenantService.getFeatureFlags(request.params.tenantId);
      return successResponse(features);
    },
  });

  fastify.patch('/admin/tenants/:tenantId/features/:feature', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['enabled'],
        properties: { enabled: { type: 'boolean' } },
      },
    },
    handler: async (request) => {
      const tenant = await tenantService.setFeatureFlag(
        request.params.tenantId,
        request.params.feature,
        request.body.enabled
      );
      return successResponse(tenant);
    },
  });

  // ─── BRANDING ────────────────────────────────

  fastify.patch('/admin/tenants/:tenantId/branding', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        properties: {
          primary_color: { type: 'string' },
          accent_color: { type: 'string' },
          font_family: { type: 'string' },
          custom_css: { type: 'string' },
        },
      },
    },
    handler: async (request) => {
      const tenant = await tenantService.updateBranding(request.params.tenantId, request.body);
      return successResponse(tenant);
    },
  });

  // ─── FEE STRUCTURES ──────────────────────────

  fastify.patch('/admin/tenants/:tenantId/fees', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        properties: {
          commission_bps: { type: 'integer', minimum: 0, maximum: 5000 },
          gateway_fee_bps: { type: 'integer', minimum: 0, maximum: 1000 },
          escrow_days: { type: 'integer', minimum: 1, maximum: 90 },
          grace_period_days: { type: 'integer', minimum: 0, maximum: 30 },
          late_fee_bps: { type: 'integer', minimum: 0, maximum: 5000 },
          late_fee_cap_bps: { type: 'integer', minimum: 0, maximum: 10000 },
        },
      },
    },
    handler: async (request) => {
      const tenant = await tenantService.updateFees(request.params.tenantId, request.body);
      return successResponse(tenant);
    },
  });

  // ─── PAYMENT PROVIDERS ───────────────────────

  fastify.post('/admin/tenants/:tenantId/payment-providers', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['provider', 'country_code', 'currency_code'],
        properties: {
          provider: { type: 'string', enum: ['paystack', 'flutterwave', 'wave', 'mpesa'] },
          country_code: { type: 'string', minLength: 2, maxLength: 2 },
          currency_code: { type: 'string', enum: ['GHS', 'NGN', 'XOF', 'USD'] },
          config: { type: 'object' },
          is_primary: { type: 'boolean' },
        },
      },
    },
    handler: async (request, reply) => {
      const result = await tenantService.addPaymentProvider(
        request.params.tenantId,
        request.body
      );
      return reply.status(201).send(successResponse(result));
    },
  });

  fastify.get('/admin/tenants/:tenantId/payment-providers', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async (request) => {
      const providers = await tenantService.getPaymentProviders(request.params.tenantId);
      return successResponse(providers);
    },
  });

  // ─── API KEYS ────────────────────────────────

  fastify.post('/admin/tenants/:tenantId/api-keys', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', maxLength: 100 } },
      },
    },
    handler: async (request, reply) => {
      const result = await tenantService.generateApiKey(
        request.params.tenantId,
        request.body.name
      );
      return reply.status(201).send(successResponse(result));
    },
  });

  fastify.get('/admin/tenants/:tenantId/api-keys', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async (request) => {
      const keys = await tenantService.listApiKeys(request.params.tenantId);
      return successResponse(keys);
    },
  });

  fastify.delete('/admin/tenants/:tenantId/api-keys/:keyId', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async (request) => {
      const result = await tenantService.revokeApiKey(
        request.params.keyId,
        request.params.tenantId
      );
      return successResponse(result);
    },
  });

  // ─── CONSOLIDATED REPORT ─────────────────────

  fastify.get('/admin/report', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async () => {
      const report = await tenantService.getConsolidatedReport();
      return successResponse(report);
    },
  });

  // ═══════════════════════════════════════════
  // EXCHANGE RATES (Public + Admin)
  // ═══════════════════════════════════════════

  fastify.get('/exchange-rates/:from/:to', {
    handler: async (request) => {
      const rate = await exchangeService.getRate(request.params.from, request.params.to);
      return successResponse(rate);
    },
  });

  fastify.get('/exchange-rates/convert', {
    schema: {
      querystring: {
        type: 'object',
        required: ['amount', 'from', 'to'],
        properties: {
          amount: { type: 'integer', minimum: 1 },
          from: { type: 'string' },
          to: { type: 'string' },
        },
      },
    },
    handler: async (request) => {
      const result = await exchangeService.convert(
        request.query.amount,
        request.query.from,
        request.query.to
      );
      return successResponse(result);
    },
  });

  fastify.post('/admin/exchange-rates/refresh', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async () => {
      const result = await exchangeService.fetchAndStoreRates();
      return successResponse(result);
    },
  });

  fastify.get('/admin/exchange-rates/history/:from/:to', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async (request) => {
      const days = parseInt(request.query.days) || 30;
      const history = await exchangeService.getRateHistory(
        request.params.from,
        request.params.to,
        days
      );
      return successResponse(history);
    },
  });

  // ─── TENANT RESOLUTION (public) ──────────────

  fastify.get('/tenants/resolve', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          domain: { type: 'string' },
          slug: { type: 'string' },
        },
      },
    },
    handler: async (request) => {
      let tenant;
      if (request.query.domain) {
        tenant = await tenantService.getByDomain(request.query.domain);
      } else if (request.query.slug) {
        tenant = await tenantService.getBySlug(request.query.slug);
      } else {
        return { status: 'error', errors: [{ message: 'Provide domain or slug' }] };
      }

      // Return only public-safe info
      return successResponse({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        domain: tenant.domain,
        logo_url: tenant.logo_url,
        branding: tenant.config?.branding,
        features: tenant.config?.features,
        default_currency: tenant.config?.default_currency,
        supported_currencies: tenant.config?.supported_currencies,
      });
    },
  });
}

module.exports = tenantRoutes;
