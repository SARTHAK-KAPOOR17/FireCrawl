import { logger } from '../utils/logger.js';

export function setupWorkerProcessHandlers({
  worker,
  mongoose,
  redis,
  resultWriter,
  timeout = 5000,
} = {}) {
  const gracefulShutdown = async (type, error) => {
    logger.error(
      { err: error?.stack || error?.message || error, type },
      'Fatal worker process error. Initiating graceful shutdown.'
    );

    const forceTimer = setTimeout(() => {
      logger.error('Worker shutdown timed out. Forcing process exit.');
      process.exit(1);
    }, timeout);
    forceTimer.unref();

    try {
      if (resultWriter && typeof resultWriter.shutdown === 'function') {
        await resultWriter.shutdown();
      }
      if (worker && typeof worker.close === 'function') {
        await worker.close();
      }
      if (mongoose && typeof mongoose.disconnect === 'function') {
        await mongoose.disconnect();
      }
      if (redis && typeof redis.quit === 'function') {
        await redis.quit();
      }
    } catch (shutdownErr) {
      logger.error({ err: shutdownErr.message }, 'Error during worker graceful shutdown');
    }

    process.exit(1);
  };

  process.on('uncaughtException', (err) => {
    gracefulShutdown('uncaughtException', err);
  });

  process.on('unhandledRejection', (reason) => {
    gracefulShutdown('unhandledRejection', reason);
  });
}
