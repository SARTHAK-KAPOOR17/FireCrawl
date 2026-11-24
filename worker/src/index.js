import dotenv from 'dotenv';
dotenv.config();

import { Worker } from 'bullmq';
import { redisConnection } from './config/redis.js';
import { logger } from './utils/logger.js';

const QUEUE_NAME = process.env.QUEUE_NAME || 'scrape';

let worker;

try {
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      logger.info({ jobId: job.id, name: job.name, data: job.data }, 'Processing scrape job');
      // Scraping logic placeholder
      return { status: 'success' };
    },
    {
      connection: redisConnection,
    }
  );

  worker.on('ready', () => {
    logger.info('worker ready');
  });

  worker.on('error', (err) => {
    logger.error({ err: err.message }, 'BullMQ worker error');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Job execution failed');
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job?.id }, 'Job completed');
  });

  // Explicit log to verify bootstrap initialization
  logger.info('worker ready');
} catch (error) {
  logger.error({ err: error.message }, 'Failed to initialize worker');
}

const shutdown = async (signal) => {
  logger.info(`${signal} received: closing BullMQ worker`);
  if (worker) {
    await worker.close();
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
