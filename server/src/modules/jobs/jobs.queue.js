import { Queue } from 'bullmq';
import { QUEUE_NAME } from '@scraper/shared';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

let scrapeQueue = null;

export const getScrapeQueue = () => {
  if (!scrapeQueue) {
    scrapeQueue = new Queue(QUEUE_NAME, {
      connection: {
        host: redisHost,
        port: redisPort,
        password: redisPassword,
      },
    });
  }
  return scrapeQueue;
};
