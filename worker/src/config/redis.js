import Redis from 'ioredis';

export const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

let sharedRedisClient = null;

/**
 * Returns a shared Redis client instance for caching and rate limiting
 * @returns {Redis}
 */
export function getRedisClient() {
  if (!sharedRedisClient) {
    sharedRedisClient = new Redis({
      ...redisConnection,
      lazyConnect: true,
    });
  }
  return sharedRedisClient;
}

/**
 * Gracefully closes the shared Redis client
 */
export async function closeRedisClient() {
  if (sharedRedisClient) {
    try {
      await sharedRedisClient.quit();
    } catch (_) {}
    sharedRedisClient = null;
  }
}


