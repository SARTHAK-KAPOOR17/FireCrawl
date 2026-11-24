import crypto from 'crypto';
import axios from 'axios';
import { Job, JobRun, Result, ErrorCodes } from '@scraper/shared';
import { scrape as defaultScrape } from './scrapers/staticScraper.js';
import {
  recordOutcomeAndFinalizeRun as defaultRecordOutcome,
  recordCacheHit,
} from './services/runTracker.js';
import { getCachedHtml, setCachedHtml } from './services/htmlCache.js';
import { checkRobotsAllowed } from './services/robotsChecker.js';
import { acquireDomainRateLimit, extractDomain } from './services/rateLimiter.js';
import { getResultWriter } from './services/resultWriter.js';
import { getRedisClient } from './config/redis.js';
import { defaultEventPublisher } from './services/eventPublisher.js';
import { classifyError } from './exceptions/classifyError.js';
import { applyRetryPolicy } from './exceptions/retryPolicy.js';
import { logger } from './utils/logger.js';

export async function processScrapeJob(
  job,
  {
    scrapeFn = defaultScrape,
    recordOutcomeFn = defaultRecordOutcome,
    models = { Job, JobRun, Result },
    redis = getRedisClient(),
    resultWriter = getResultWriter(),
    checkRobotsFn = checkRobotsAllowed,
    rateLimiterFn = acquireDomainRateLimit,
  } = {}
) {
  const { jobId, runId, userId, url, selectors, forceRefresh = false } = job.data;
  const log = logger.child({ jobId, runId, url, attempt: job.attemptsMade + 1 });

  try {
    const transitioned = await models.Job.findOneAndUpdate(
      { _id: jobId, status: 'queued' },
      { status: 'running' }
    );
    if (transitioned) {
      const totalUrls = job.data?.totalUrls || (transitioned.urls ? transitioned.urls.length : 1);
      await defaultEventPublisher.publishRunStarted({
        userId: userId ? userId.toString() : '',
        jobId: jobId.toString(),
        runId: runId.toString(),
        totalUrls,
      });
    }
  } catch (_) {}

  let outcome = null;
  let skipReason = null;
  let finalError = null;
  let isCacheHit = false;

  try {
    let cachedHtml = null;

    if (!forceRefresh && redis) {
      cachedHtml = await getCachedHtml(redis, url, { forceRefresh });
      if (cachedHtml) {
        isCacheHit = true;
        await recordCacheHit({ runId, models });
        log.info('HTML cache hit');
      }
    }

    let data;

    if (cachedHtml) {
      data = await scrapeFn({ url, selectors, html: cachedHtml });
    } else {
      // 1. Check robots.txt (never for cache hits)
      await checkRobotsFn(url, { redis });

      // 2. Per-domain rate limiter (never for cache hits or robots hits)
      const domain = extractDomain(url);
      await rateLimiterFn(redis, domain);

      // 3. Network fetch
      if (scrapeFn === defaultScrape) {
        const response = await axios.get(url, {
          timeout: 10000,
          maxRedirects: 5,
          headers: {
            'User-Agent':
              process.env.USER_AGENT ||
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 FireCrawl/1.0',
          },
        });

        const html = typeof response.data === 'string' ? response.data : String(response.data || '');

        if (redis) {
          await setCachedHtml(redis, url, html, { status: response.status });
        }

        data = await scrapeFn({ url, selectors, html });
      } else {
        data = await scrapeFn({ url, selectors });
      }
    }

    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');

    // 4. Batched write to database
    const writeResult = await resultWriter.add({
      jobId,
      userId,
      url,
      data,
      contentHash,
      scrapedAt: new Date(),
    });

    if (writeResult === 'duplicate') {
      outcome = 'skipped';
      skipReason = 'duplicate';
      log.info({ contentHash }, 'Duplicate content detected; marked as skipped');
    } else {
      outcome = 'scraped';
      log.info({ contentHash }, 'Successfully scraped and stored result');
    }
  } catch (rawErr) {
    const err = classifyError(rawErr);

    if (err.code === ErrorCodes.ROBOTS_DISALLOWED) {
      outcome = 'skipped';
      skipReason = 'robots';
      log.info({ url }, 'URL disallowed by robots.txt; marked as skipped');
    } else {
      const maxAttempts = job.opts?.attempts || 3;
      const isTerminalAttempt = !err.retryable || job.attemptsMade + 1 >= maxAttempts;

      if (isTerminalAttempt) {
        outcome = 'failed';
        finalError = err;
        log.error({ err: err.message, code: err.code }, 'Scrape job terminal failure');
      } else {
        applyRetryPolicy(err, { jobId, runId, url });
      }
    }
  }

  // 5. Await add() promise BEFORE recording terminal outcome in runTracker
  if (outcome) {
    await recordOutcomeFn({
      jobId,
      runId,
      url,
      outcome,
      skipReason,
      cacheHit: isCacheHit,
      error: finalError,
      userId,
      models,
    });
  }

  if (finalError && !finalError.retryable) {
    applyRetryPolicy(finalError, { jobId, runId, url });
  }

  return { outcome, skipReason, cacheHit: isCacheHit };
}
