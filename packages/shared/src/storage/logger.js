/**
 * Minimal logger for the shared package.
 * Services that import @ejua/shared get basic logging;
 * each engine overrides with their own pino instance.
 */
module.exports = {
  info: (...args) => console.log('[shared]', ...args),
  warn: (...args) => console.warn('[shared]', ...args),
  error: (...args) => console.error('[shared]', ...args),
  debug: () => {}, // Silent in shared
};
