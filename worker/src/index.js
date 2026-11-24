import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import { QUEUE_NAME, Result, dropLegacyResultIndex } from '@scraper/shared';
import { redisConnection, getRedisClient, closeRedisClient } from './config/redis.js';
import { connectDB } from './config/db.js';
import { processScrapeJob } from './processor.js';
import { getResultWriter } from './services/resultWriter.js';
import { setupWorkerProcessHandlers } from './exceptions/processHandlers.js';
import { logger } from './utils/logger.js';

const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

let worker;
const resultWriter = getResultWriter();

const startWorker = async () => {
  try {
    try {
      await connectDB();
      await dropLegacyResultIndex(Result);
    } catch (dbErr) {
      logger.warn('Worker starting without immediate MongoDB connection (is Docker running?)');
    }

    const redis = getRedisClient();

    worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        return await processScrapeJob(job, { redis, resultWriter });
      },
      {
        connection: redisConnection,
        concurrency,
      }
    );

    setupWorkerProcessHandlers({ worker, mongoose, redis, resultWriter });

    worker.on('ready', () => {
      logger.info({ queue: QUEUE_NAME, concurrency }, 'worker ready');
    });

    worker.on('error', (err) => {
      logger.error({ err: err.message }, 'BullMQ worker error');
    });

    worker.on('failed', (job, err) => {
      logger.error(
        {
          jobId: job?.data?.jobId,
          runId: job?.data?.runId,
          url: job?.data?.url,
          err: err.message,
        },
        'Job attempt failed'
      );
    });

    logger.info({ queue: QUEUE_NAME, concurrency }, 'worker ready');

    const shutdown = async (signal) => {
      logger.info(`${signal} received: closing BullMQ worker`);
      try {
        if (resultWriter && typeof resultWriter.shutdown === 'function') {
          await resultWriter.shutdown();
        }
      } catch (_) {}
      if (worker) {
        await worker.close();
      }
      try {
        await closeRedisClient();
      } catch (_) {}
      try {
        await mongoose.disconnect();
      } catch (_) {}
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to start worker');
    process.exit(1);
  }
};

startWorker();
