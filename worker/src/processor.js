import crypto from 'crypto';
import { Job, JobRun, Result } from '@scraper/shared';
import { scrape as defaultScrape } from './scrapers/staticScraper.js';
import { recordOutcomeAndFinalizeRun as defaultRecordOutcome } from './services/runTracker.js';
import { classifyError } from './exceptions/classifyError.js';
import { applyRetryPolicy } from './exceptions/retryPolicy.js';
import { logger } from './utils/logger.js';

export async function processScrapeJob(
  job,
  {
    scrapeFn = defaultScrape,
    recordOutcomeFn = defaultRecordOutcome,
    models = { Job, JobRun, Result },
  } = {}
) {
  const { jobId, runId, userId, url, selectors } = job.data;
  const log = logger.child({ jobId, runId, url, attempt: job.attemptsMade + 1 });

  try {
    await models.Job.findOneAndUpdate(
      { _id: jobId, status: 'queued' },
      { status: 'running' }
    );
  } catch (_) {}

  let outcome = null;
  let finalError = null;

  try {
    log.info('Scraping URL');
    const data = await scrapeFn({ url, selectors });

    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');

    try {
      await models.Result.create({
        jobId,
        userId,
        url,
        data,
        contentHash,
        scrapedAt: new Date(),
      });
      outcome = 'scraped';
      log.info({ contentHash }, 'Successfully scraped and stored result');
    } catch (dbErr) {
      if (dbErr.code === 11000) {
        outcome = 'skipped';
        log.info({ contentHash }, 'Duplicate content detected; marked as skipped');
      } else {
        throw dbErr;
      }
    }
  } catch (rawErr) {
    const err = classifyError(rawErr);
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

  if (outcome) {
    await recordOutcomeFn({
      jobId,
      runId,
      url,
      outcome,
      error: finalError,
      models,
    });
  }

  if (finalError && !finalError.retryable) {
    applyRetryPolicy(finalError, { jobId, runId, url });
  }

  return { outcome };
}
