const Fastify = require('fastify');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./utils/logger');

// Routes
const flyerRoutes = require('./modules/flyers/flyer.routes');

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

  // Multipart support for template uploads
  await app.register(require('@fastify/multipart'), {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max
    },
  });

  // Serve generated flyers and templates as static files
  const outputDir = config.output.directory;
  fs.mkdirSync(outputDir, { recursive: true });
  await app.register(require('@fastify/static'), {
    root: outputDir,
    prefix: '/output/',
    decorateReply: false,
  });

  const templateDir = config.templates.directory;
  fs.mkdirSync(templateDir, { recursive: true });
  await app.register(require('@fastify/static'), {
    root: templateDir,
    prefix: '/templates/',
    decorateReply: false,
  });

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
  // Health check
  app.get('/health', async () => ({
    status: 'healthy',
    service: 'creative-engine',
    timestamp: new Date().toISOString(),
  }));

  app.get('/', async () => ({
    status: 'success',
    data: {
      service: 'Ejua Creative Engine',
      version: '1.0.0',
      description: 'Pillar 2: Automated marketing flyer generation',
    },
  }));

  // API routes under /api/v1
  await app.register(flyerRoutes, { prefix: '/api/v1' });

  return app;
}

async function start() {
  try {
    const app = await buildServer();

    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Creative Engine running on port ${config.port}`);
    logger.info(`Flyer output: ${config.output.directory}`);
  } catch (err) {
    logger.error({ err }, 'Failed to start Creative Engine');
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { buildServer };
