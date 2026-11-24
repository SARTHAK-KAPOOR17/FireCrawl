import crypto from 'crypto';
import * as cheerio from 'cheerio';
import { Job, JobRun, AiQuotaExceededError } from '@scraper/shared';
import { cleanHtml } from '../ai/htmlCleaner.js';
import { getLlmClient } from '../ai/llmClient.js';
import { logger } from '../utils/logger.js';

/**
 * Simple in-process semaphore to limit concurrent AI calls per worker
 */
export class Semaphore {
  constructor(maxConcurrency = 2) {
    this.maxConcurrency = maxConcurrency;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.current < this.maxConcurrency) {
      this.current++;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.current--;
    }
  }
}

export const globalAiSemaphore = new Semaphore(
  parseInt(process.env.AI_CONCURRENCY || '2', 10)
);

/**
 * Verifies a suggested CSS selector against original HTML by comparing
 * extracted value with the model's expected value after whitespace normalization.
 *
 * @param {string} selector
 * @param {string} expectedValue
 * @param {string} originalHtml
 * @returns {boolean}
 */
export function verifySelector(selector, expectedValue, originalHtml) {
  if (!selector || typeof selector !== 'string' || expectedValue === null || expectedValue === undefined) {
    return false;
  }

  try {
    const $ = cheerio.load(originalHtml);
    let extracted = null;
    const trimmed = selector.trim();

    if (trimmed.includes('@')) {
      const atIndex = trimmed.lastIndexOf('@');
      const cssSelector = trimmed.substring(0, atIndex).trim();
      const attrName = trimmed.substring(atIndex + 1).trim();
      const el = $(cssSelector).first();
      if (el.length > 0) {
        const val = el.attr(attrName);
        if (val !== undefined && val !== null) {
          extracted = val;
        }
      }
    } else {
      const el = $(trimmed).first();
      if (el.length > 0) {
        extracted = el.text();
      }
    }

    if (extracted === null || extracted === undefined) {
      return false;
    }

    const normalize = (s) => String(s).trim().replace(/\s+/g, ' ');
    return normalize(extracted) === normalize(expectedValue);
  } catch {
    return false;
  }
}

/**
 * Executes AI extraction fallback for missing fields with cost controls,
 * caching, semaphore concurrency, and self-healing selector verification.
 */
export async function executeAiFallback({
  jobId,
  runId,
  userId,
  url,
  originalHtml,
  missingFields,
  selectors = {},
  models = { Job, JobRun },
  redis = null,
  llmClient = getLlmClient(),
  semaphore = globalAiSemaphore,
}) {
  if (!missingFields || missingFields.length === 0) {
    return { values: {}, suggestedSelectors: {} };
  }

  const { Job: JobModel, JobRun: JobRunModel } = models;

  // 1. Per-run call cap check
  const maxCallsPerRun = parseInt(process.env.AI_MAX_CALLS_PER_RUN || '200', 10);
  const currentRun = await JobRunModel.findById(runId);
  if (currentRun && (currentRun.aiCalls || 0) >= maxCallsPerRun) {
    logger.warn({ runId, aiCalls: currentRun.aiCalls }, 'AI calls cap reached for this run; skipping AI fallback');
    return { values: {}, suggestedSelectors: {}, skippedReason: 'max_calls_per_run' };
  }

  // 2. Per-user daily quota check
  const dailyQuota = parseInt(process.env.AI_DAILY_CALLS_PER_USER || '500', 10);
  if (redis && userId) {
    const today = new Date().toISOString().slice(0, 10);
    const quotaKey = `ai_quota:${userId}:${today}`;
    const currentCount = parseInt((await redis.get(quotaKey)) || '0', 10);
    if (currentCount >= dailyQuota) {
      logger.warn({ userId, currentCount, dailyQuota }, 'User daily AI call quota exceeded');
      throw new AiQuotaExceededError('Daily AI extraction quota exceeded');
    }
  }

  // 3. Redis AI Cache check
  const { cleanedHtml, hash: cleanedHtmlHash } = cleanHtml(originalHtml);
  const sortedMissingFields = [...missingFields].sort();
  const cacheKeyHash = crypto
    .createHash('sha256')
    .update(`${url}:${cleanedHtmlHash}:${sortedMissingFields.join(',')}`)
    .digest('hex');
  const aiCacheKey = `aicache:${cacheKeyHash}`;

  if (redis) {
    try {
      const cachedJson = await redis.get(aiCacheKey);
      if (cachedJson) {
        const cachedData = JSON.parse(cachedJson);
        await JobRunModel.findByIdAndUpdate(runId, {
          $inc: { aiCacheHits: 1, aiCalls: 1, aiFallbackPages: 1 },
        });
        logger.info({ url, runId }, 'AI fallback cache hit');
        return {
          values: cachedData.values || {},
          suggestedSelectors: cachedData.suggestedSelectors || {},
          fromCache: true,
        };
      }
    } catch (_) {}
  }

  // 4. Acquire semaphore & execute LLM call
  await semaphore.acquire();
  let aiResult;

  try {
    aiResult = await llmClient.extractFields({
      fields: missingFields,
      hints: selectors,
      html: cleanedHtml,
      url,
    });
  } catch (err) {
    await JobRunModel.findByIdAndUpdate(runId, {
      $inc: { aiCalls: 1, aiFailures: 1, aiFallbackPages: 1 },
    });
    throw err;
  } finally {
    semaphore.release();
  }

  // 5. Increment daily user counter
  if (redis && userId) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const quotaKey = `ai_quota:${userId}:${today}`;
      await redis.incr(quotaKey);
      await redis.expire(quotaKey, 86400 * 2);
    } catch (_) {}
  }

  // 6. Record successful JobRun counters
  const promptTokens = aiResult.usage?.promptTokens || 0;
  const completionTokens = aiResult.usage?.completionTokens || 0;

  await JobRunModel.findByIdAndUpdate(runId, {
    $inc: {
      aiCalls: 1,
      aiSuccess: 1,
      aiFallbackPages: 1,
      aiTokensIn: promptTokens,
      aiTokensOut: completionTokens,
    },
  });

  // 7. Write to Redis cache
  const cacheTtl = parseInt(process.env.AI_CACHE_TTL_SECONDS || '86400', 10);
  if (redis) {
    try {
      await redis.set(
        aiCacheKey,
        JSON.stringify({
          values: aiResult.values,
          suggestedSelectors: aiResult.suggestedSelectors,
        }),
        'EX',
        cacheTtl
      );
    } catch (_) {}
  }

  // 8. Self-Healing: Verify each suggested selector against ORIGINAL HTML
  const values = aiResult.values || {};
  const suggestedSelectors = aiResult.suggestedSelectors || {};

  for (const field of missingFields) {
    const selector = suggestedSelectors[field];
    const val = values[field];

    if (selector && val) {
      const isVerified = verifySelector(selector, val, originalHtml);
      if (isVerified) {
        logger.info(
          { field, selector, url },
          'Verified suggested selector against original HTML; saving to Job'
        );
        try {
          await JobModel.findByIdAndUpdate(jobId, {
            $set: {
              [`suggestedSelectors.${field}`]: {
                selector,
                verifiedAt: new Date(),
                sampleUrl: url,
              },
            },
          });
        } catch (_) {}
      } else {
        logger.debug(
          { field, selector },
          'Suggested selector failed verification against original HTML; discarding'
        );
      }
    }
  }

  return {
    values,
    suggestedSelectors,
    fromCache: false,
  };
}
