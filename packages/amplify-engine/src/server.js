const Fastify = require('fastify');
const config = require('./config');
const logger = require('./utils/logger');

// Routes
const amplifyRoutes = require('./modules/amplify.routes');

async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.env === 'production' ? 'info' : 'debug',
      transport:
        config.env === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // ─── PLUGINS ────────────────────────────────
  await app.register(require('@fastify/cors'), {
    origin: true,
    credentials: true,
  });

  await app.register(require('@fastify/helmet'));

  // ─── ERROR HANDLER ──────────────────────────
  app.setErrorHandler((error, request, reply) => {
    logger.error({ err: error, path: request.url }, 'Unhandled error');
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      status: 'error',
      errors: [{ code: error.code || 'INTERNAL_ERROR', message: error.message }],
    });
  });

  // ─── ROUTES ─────────────────────────────────
  app.get('/health', async () => ({
    status: 'healthy',
    service: 'amplify-engine',
    timestamp: new Date().toISOString(),
  }));

  app.get('/', async () => ({
    status: 'success',
    data: {
      service: 'Ejua Amplify Engine',
      version: '1.0.0',
      description: 'Pillar 3: Social posting, ad boost, and performance tracking',
    },
  }));

  // API routes
  await app.register(amplifyRoutes, { prefix: '/api/v1' });

  return app;
}

async function start() {
  try {
    const app = await buildServer();

    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Amplify Engine running on port ${config.port}`);
  } catch (err) {
    logger.error({ err }, 'Failed to start Amplify Engine');
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { buildServer };
