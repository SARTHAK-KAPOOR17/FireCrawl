import crypto from 'crypto';
import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  Job,
  JobRun,
  Result,
  ErrorCodes,
  NoDataExtractedError,
  AiQuotaExceededError,
} from '@scraper/shared';
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
import { executeAiFallback as defaultExecuteAiFallback } from './services/aiFallbackService.js';
import { logger } from './utils/logger.js';

function extractWithCheerio($, rawSelector) {
  if (!rawSelector || typeof rawSelector !== 'string') return null;
  const trimmed = rawSelector.trim();
  if (!trimmed) return null;

  if (trimmed.includes('@')) {
    const atIndex = trimmed.lastIndexOf('@');
    const cssSelector = trimmed.substring(0, atIndex).trim();
    const attrName = trimmed.substring(atIndex + 1).trim();
    const el = $(cssSelector).first();
    if (el.length > 0) {
      const attrVal = el.attr(attrName);
      if (attrVal !== undefined && attrVal !== null) {
        const val = attrVal.trim();
        return val.length > 0 ? val : null;
      }
    }
  } else {
    const el = $(trimmed).first();
    if (el.length > 0) {
      const textVal = el.text().trim();
      return textVal.length > 0 ? textVal : null;
    }
  }
  return null;
}

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
    executeAiFallbackFn = defaultExecuteAiFallback,
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
    let html = null;

    if (!forceRefresh && redis) {
      html = await getCachedHtml(redis, url, { forceRefresh });
      if (html) {
        isCacheHit = true;
        await recordCacheHit({ runId, models });
        log.info('HTML cache hit');
      }
    }

    if (!html) {
      // 1. Check robots.txt (never for cache hits)
      await checkRobotsFn(url, { redis });

      // 2. Per-domain rate limiter (never for cache hits or robots hits)
      const domain = extractDomain(url);
      await rateLimiterFn(redis, domain);

      // 3. Network fetch
      const response = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
        headers: {
          'User-Agent':
            process.env.USER_AGENT ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 FireCrawl/1.0',
        },
      });

      html = typeof response.data === 'string' ? response.data : String(response.data || '');

      if (redis) {
        await setCachedHtml(redis, url, html, { status: response.status });
      }
    }

    let data = {};
    const extractedBy = {};

    if (scrapeFn !== defaultScrape) {
      data = await scrapeFn({ url, selectors, html });
      for (const k of Object.keys(data || {})) {
        extractedBy[k] = 'selector';
      }
    } else {
      let jobDoc = null;
      try {
        if (models?.Job?.findById) {
          jobDoc = await models.Job.findById(jobId);
        }
      } catch (_) {}

      const hasAiFallback = Boolean(jobDoc?.aiFallback ?? job.data?.aiFallback);
      const suggestedSelectors =
        jobDoc?.suggestedSelectors instanceof Map
          ? Object.fromEntries(jobDoc.suggestedSelectors)
          : jobDoc?.suggestedSelectors || {};

      const $ = cheerio.load(html);
      const selectorEntries =
        selectors instanceof Map
          ? Array.from(selectors.entries())
          : typeof selectors?.toJSON === 'function'
          ? Object.entries(selectors.toJSON())
          : Object.entries(selectors || {});

      // (a) Rule-based Cheerio with user selectors first
      for (const [field, rawSelector] of selectorEntries) {
        const val = extractWithCheerio($, rawSelector);
        if (val !== null) {
          data[field] = val;
          extractedBy[field] = 'selector';
        } else {
          data[field] = null;
        }
      }

      // (b) Suggested selectors for missing fields
      for (const [field, val] of Object.entries(data)) {
        if (val === null && suggestedSelectors[field]?.selector) {
          const suggestedVal = extractWithCheerio($, suggestedSelectors[field].selector);
          if (suggestedVal !== null) {
            data[field] = suggestedVal;
            extractedBy[field] = 'suggested';
          }
        }
      }

      // (c) AI fallback for remaining missing fields
      const missingFields = Object.keys(data).filter((f) => data[f] === null);
      if (missingFields.length > 0 && hasAiFallback) {
        try {
          const aiResult = await executeAiFallbackFn({
            jobId,
            runId,
            userId,
            url,
            originalHtml: html,
            missingFields,
            selectors,
            models,
            redis,
          });

          if (aiResult?.values) {
            for (const field of missingFields) {
              if (aiResult.values[field] !== undefined && aiResult.values[field] !== null) {
                data[field] = aiResult.values[field];
                extractedBy[field] = 'ai';
              }
            }
          }
        } catch (aiErr) {
          if (aiErr instanceof AiQuotaExceededError) {
            log.warn({ userId, runId }, 'AI quota exceeded; skipping AI fallback');
          } else {
            log.warn({ err: aiErr.message, code: aiErr.code }, 'AI extraction failed');
          }

          const hasAnyData = Object.values(data).some((v) => v !== null);
          if (!hasAnyData) {
            throw aiErr;
          }
        }
      }

      const hasAnyData = Object.values(data).some((v) => v !== null);
      if (!hasAnyData) {
        throw new NoDataExtractedError('Page returned no data for all fields');
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
      meta: { extractedBy },
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
