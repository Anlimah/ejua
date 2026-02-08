const config = require('./index');

const knexConfig = {
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    ...(config.db.ssl && { ssl: { rejectUnauthorized: false } }),
  },
  pool: config.db.pool,
  migrations: {
    directory: '../migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: '../seeds',
  },
};

module.exports = knexConfig;
