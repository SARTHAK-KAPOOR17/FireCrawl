import crypto from 'crypto';

/**
 * Generates Redis cache key for a given URL
 * @param {string} url
 * @returns {string}
 */
export function getCacheKey(url) {
  const hash = crypto.createHash('sha256').update(url).digest('hex');
  return `htmlcache:${hash}`;
}

/**
 * Fetches cached HTML from Redis
 * @param {import('ioredis').Redis} redis
 * @param {string} url
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh=false]
 * @returns {Promise<string|null>}
 */
export async function getCachedHtml(redis, url, { forceRefresh = false } = {}) {
  if (forceRefresh || !redis) {
    return null;
  }
  const key = getCacheKey(url);
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

/**
 * Caches HTML in Redis if response status is 2xx and body size is under 2MB
 * @param {import('ioredis').Redis} redis
 * @param {string} url
 * @param {string} html
 * @param {Object} [options]
 * @param {number} [options.status=200]
 * @param {number} [options.ttlSeconds]
 * @returns {Promise<boolean>}
 */
export async function setCachedHtml(
  redis,
  url,
  html,
  {
    status = 200,
    ttlSeconds = parseInt(process.env.HTML_CACHE_TTL_SECONDS || '3600', 10),
  } = {}
) {
  if (!redis || !html) {
    return false;
  }

  // Cache only 2xx HTML responses
  if (status < 200 || status >= 300) {
    return false;
  }

  // Cache only under 2MB
  const byteLength = Buffer.byteLength(html, 'utf8');
  if (byteLength >= 2 * 1024 * 1024) {
    return false;
  }

  const key = getCacheKey(url);
  try {
    await redis.set(key, html, 'EX', ttlSeconds);
    return true;
  } catch {
    return false;
  }
}
