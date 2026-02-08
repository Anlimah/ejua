const pino = require('pino');
const config = require('../config');

const logger = pino({
  level: config.env === 'production' ? 'info' : 'debug',
  transport:
    config.env === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
  base: { service: 'marketplace-engine' },
});

module.exports = logger;
