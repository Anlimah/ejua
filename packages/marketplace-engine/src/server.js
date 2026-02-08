const Fastify = require('fastify');
const config = require('./config');
const logger = require('./utils/logger');
const { testConnection, closeDb } = require('./utils/db');

// Middleware
const authPlugin = require('./middleware/auth');
const errorHandler = require('./middleware/error-handler');
const tenantPlugin = require('./middleware/tenant');

// Routes
const healthRoutes = require('./modules/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const walletRoutes = require('./modules/wallets/wallet.routes');
const installmentRoutes = require('./modules/installments/installment.routes');
const vendorRoutes = require('./modules/vendors/vendor.routes');
const productRoutes = require('./modules/products/product.routes');
const orderRoutes = require('./modules/orders/order.routes');
const { cronRoutes } = require('./modules/orders/cron-jobs');
const tenantRoutes = require('./modules/tenants/tenant.routes');
const motitoWebhookRoutes = require('./modules/webhooks/motito.webhook');

async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.env === 'production' ? 'info' : 'debug',
      transport:
        config.env === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => require('uuid').v4(),
  });

  // ─── CORE PLUGINS ────────────────────────────
  await app.register(require('@fastify/cors'), {
    origin: config.env === 'production' ? [config.platform.url] : true,
    credentials: true,
  });

  await app.register(require('@fastify/helmet'));

  await app.register(require('@fastify/rate-limit'), {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });

  // ─── SWAGGER DOCS ───────────────────────────
  await app.register(require('@fastify/swagger'), {
    openapi: {
      info: {
        title: 'Ejua Marketplace Engine API',
        description: 'Pillar 1: Multi-vendor marketplace with wallet, BNPL, and installment management.',
        version: '1.0.0',
      },
      servers: [
        { url: `http://localhost:${config.port}`, description: 'Development' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  await app.register(require('@fastify/swagger-ui'), {
    routePrefix: '/docs',
  });

  // ─── CUSTOM MIDDLEWARE ───────────────────────
  await app.register(errorHandler);
  await app.register(authPlugin);
  await app.register(tenantPlugin);

  // ─── API ROUTES ─────────────────────────────
  // All API routes under /api/v1
  await app.register(
    async function apiRoutes(api) {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(walletRoutes);
      await api.register(vendorRoutes);
      await api.register(productRoutes);
      await api.register(orderRoutes);
      await api.register(installmentRoutes);
      await api.register(cronRoutes);
      await api.register(tenantRoutes);
      await api.register(motitoWebhookRoutes);
    },
    { prefix: '/api/v1' }
  );

  return app;
}

// ─── START SERVER ─────────────────────────────
async function start() {
  try {
    // Test database connection
    await testConnection();

    const app = await buildServer();

    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Marketplace Engine running on port ${config.port}`);
    logger.info(`API docs: http://localhost:${config.port}/api/v1/docs`);

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      await app.close();
      await closeDb();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

// Run if called directly (not imported for testing)
if (require.main === module) {
  start();
}

module.exports = { buildServer };
