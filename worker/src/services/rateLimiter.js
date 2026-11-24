import { RateLimitWaitTimeoutError } from '@scraper/shared';

const LUA_ACQUIRE_SLOT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, 2)
end
if current > limit then
  return 0
else
  return 1
end
`;

export function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Acquires a rate limit slot for a domain within the current 1-second window.
 * If limited, waits with jitter up to maxWaitMs before throwing RateLimitWaitTimeoutError.
 * @param {import('ioredis').Redis} redis
 * @param {string} domain
 * @param {Object} [options]
 * @param {number} [options.limitRps]
 * @param {number} [options.maxWaitMs]
 * @param {Function} [options.sleepFn]
 * @returns {Promise<boolean>}
 */
export async function acquireDomainRateLimit(
  redis,
  domain,
  {
    limitRps = parseInt(process.env.DOMAIN_RATE_LIMIT_RPS || '5', 10),
    maxWaitMs = 30000,
    sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {}
) {
  if (!redis) {
    return true;
  }

  const startTime = Date.now();

  while (true) {
    const currentSecond = Math.floor(Date.now() / 1000);
    const key = `ratelimit:${domain}:${currentSecond}`;

    const allowed = await redis.eval(LUA_ACQUIRE_SLOT, 1, key, limitRps);

    if (allowed === 1) {
      return true;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= maxWaitMs) {
      throw new RateLimitWaitTimeoutError(
        `Timed out waiting for rate limit delay for domain: ${domain}`
      );
    }

    // Sleep with bounded jitter (100ms - 250ms)
    const jitter = Math.floor(Math.random() * 100);
    const sleepMs = Math.min(150 + jitter, Math.max(10, maxWaitMs - elapsed));
    await sleepFn(sleepMs);
  }
}
