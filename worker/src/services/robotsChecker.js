import axios from 'axios';
import robotsParser from 'robots-parser';
import { RobotsDisallowedError } from '@scraper/shared';

const DEFAULT_USER_AGENT =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 FireCrawl/1.0';

/**
 * Checks whether scraping a URL is allowed by origin's robots.txt.
 * Caches robots.txt text in Redis per origin for 24h.
 * @param {string} url
 * @param {Object} [options]
 * @param {import('ioredis').Redis} [options.redis]
 * @param {string} [options.userAgent]
 * @param {Object} [options.axiosClient]
 * @param {number} [options.ttlSeconds]
 * @returns {Promise<boolean>}
 */
export async function checkRobotsAllowed(
  url,
  {
    redis,
    userAgent = DEFAULT_USER_AGENT,
    axiosClient = axios,
    ttlSeconds = 86400, // 24h
  } = {}
) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }

  const origin = parsed.origin;
  const robotsUrl = `${origin}/robots.txt`;
  const cacheKey = `robots:${origin}`;

  let robotsTxt = null;
  if (redis) {
    try {
      robotsTxt = await redis.get(cacheKey);
    } catch (_) {}
  }

  if (robotsTxt === null) {
    try {
      const res = await axiosClient.get(robotsUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': userAgent,
        },
      });
      robotsTxt = typeof res.data === 'string' ? res.data : String(res.data || '');
    } catch {
      // robots.txt 404 or fetch failure/timeout: allow. Never fail the job because of robots.txt.
      robotsTxt = '';
    }

    if (redis) {
      try {
        await redis.set(cacheKey, robotsTxt, 'EX', ttlSeconds);
      } catch (_) {}
    }
  }

  if (!robotsTxt || robotsTxt.trim() === '') {
    return true;
  }

  const robots = robotsParser(robotsUrl, robotsTxt);
  const isAllowed = robots.isAllowed(url, userAgent);

  if (isAllowed === false) {
    throw new RobotsDisallowedError(`Scraping disallowed by robots.txt for ${url}`);
  }

  return true;
}
