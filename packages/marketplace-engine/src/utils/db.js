const knex = require('knex');
const knexConfig = require('../config/database');
const logger = require('./logger');

let db = null;

function getDb() {
  if (!db) {
    db = knex(knexConfig);

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      db.on('query', (query) => {
        logger.debug({ sql: query.sql, bindings: query.bindings }, 'DB query');
      });
    }
  }
  return db;
}

async function testConnection() {
  const connection = getDb();
  try {
    await connection.raw('SELECT 1+1 AS result');
    logger.info('Database connection established');
    return true;
  } catch (err) {
    logger.error({ err }, 'Database connection failed');
    throw err;
  }
}

async function closeDb() {
  if (db) {
    await db.destroy();
    db = null;
    logger.info('Database connection closed');
  }
}

module.exports = { getDb, testConnection, closeDb };
