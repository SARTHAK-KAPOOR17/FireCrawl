import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

export const redis = new Redis({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
  logger.info(`Redis connected successfully at ${redisHost}:${redisPort}`);
});

redis.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis connection error');
});

export const getRedisConfig = () => ({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

export const createRedisClient = (opts = {}) => {
  return new Redis({
    ...getRedisConfig(),
    ...opts,
  });
};

export const connectRedis = async () => {
  try {
    await redis.connect();
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to connect to Redis');
    throw error;
  }
};
