import crypto from 'crypto';
import { Job, JobRun, Result } from '@scraper/shared';
import { scrape as defaultScrape } from './scrapers/staticScraper.js';
import { recordOutcomeAndFinalizeRun as defaultRecordOutcome } from './services/runTracker.js';
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

  // When first URL of a run starts, set Job.status = 'running' if it was queued
  try {
    await models.Job.findOneAndUpdate(
      { _id: jobId, status: 'queued' },
      { status: 'running' }
    );
  } catch (_) {}

  let outcome = null; // 'scraped' | 'skipped' | 'failed'

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
  } catch (err) {
    const isTerminalAttempt = job.attemptsMade + 1 >= (job.opts?.attempts || 3);
    if (isTerminalAttempt) {
      outcome = 'failed';
      log.error({ err: err.message }, 'Scrape job failed permanently after max attempts');
    } else {
      log.warn({ err: err.message }, 'Scrape attempt failed, will retry with backoff');
      throw err; // Let BullMQ retry
    }
  }

  if (outcome) {
    await recordOutcomeFn({
      jobId,
      runId,
      outcome,
      models,
    });
  }

  return { outcome };
}
