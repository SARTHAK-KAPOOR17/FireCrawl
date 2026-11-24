import { logger } from '../utils/logger.js';

export function setupProcessHandlers(server, { timeout = 5000, closeRealtime = null } = {}) {
  const gracefulShutdown = async (type, error) => {
    logger.error(
      { err: error?.stack || error?.message || error, type },
      'Fatal process error encountered. Initiating graceful shutdown.'
    );

    const forceExitTimer = setTimeout(() => {
      logger.error('Shutdown timed out. Forcing process exit.');
      process.exit(1);
    }, timeout);
    forceExitTimer.unref();

    try {
      if (typeof closeRealtime === 'function') {
        await closeRealtime();
      }
    } catch (_) {}

    if (server && typeof server.close === 'function') {
      server.close(() => {
        logger.info('HTTP server closed successfully.');
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  };

  process.on('uncaughtException', (err) => {
    gracefulShutdown('uncaughtException', err);
  });

  process.on('unhandledRejection', (reason) => {
    gracefulShutdown('unhandledRejection', reason);
  });
}
