const { successResponse } = require('@ejua/shared');
const { getDb } = require('../utils/db');

async function healthRoutes(fastify) {
  // Health check
  fastify.get('/health', async () => {
    const db = getDb();
    let dbOk = false;
    try {
      await db.raw('SELECT 1');
      dbOk = true;
    } catch {}

    return {
      status: dbOk ? 'healthy' : 'degraded',
      service: 'marketplace-engine',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk ? 'ok' : 'error',
      },
    };
  });

  // API root
  fastify.get('/', async () => {
    return successResponse({
      service: 'Ejua Marketplace Engine',
      version: '1.0.0',
      docs: '/docs',
    });
  });
}

module.exports = healthRoutes;
