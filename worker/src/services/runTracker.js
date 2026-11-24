import { Job, JobRun } from '@scraper/shared';
import { logger } from '../utils/logger.js';

/**
 * Atomically records terminal URL outcome and finalizes run if all URLs are completed.
 * Race-safe via conditional update on status: 'running'.
 */
export async function recordOutcomeAndFinalizeRun({
  jobId,
  runId,
  url,
  outcome,
  error = null,
  models = { Job, JobRun },
}) {
  const { Job: JobModel, JobRun: JobRunModel } = models;

  const incField =
    outcome === 'scraped'
      ? 'pagesScraped'
      : outcome === 'skipped'
      ? 'pagesSkipped'
      : 'pagesFailed';

  const updateOps = {
    $inc: {
      [incField]: 1,
    },
  };

  if (outcome === 'failed' && error) {
    const code = error.code || 'UNKNOWN_ERROR';
    updateOps.$inc[`failureReasons.${code}`] = 1;

    if (url) {
      updateOps.$push = {
        failedUrls: {
          $each: [
            {
              url,
              code,
              message: error.message || 'Scrape failed',
            },
          ],
          $slice: -50,
        },
      };
    }
  }

  const updatedRun = await JobRunModel.findByIdAndUpdate(runId, updateOps, { new: true });

  if (!updatedRun) {
    logger.warn({ runId }, 'JobRun not found when recording outcome');
    return null;
  }

  const pagesScraped = updatedRun.pagesScraped || 0;
  const pagesFailed = updatedRun.pagesFailed || 0;
  const pagesSkipped = updatedRun.pagesSkipped || 0;
  const totalProcessed = pagesScraped + pagesFailed + pagesSkipped;

  if (totalProcessed >= updatedRun.totalUrls) {
    const now = new Date();
    const durationMs = updatedRun.startedAt
      ? now.getTime() - new Date(updatedRun.startedAt).getTime()
      : 0;

    const finalStatus = pagesScraped > 0 ? 'completed' : 'failed';

    // Race-safe: conditional update ensures only one concurrent worker executes finalization
    const finalizedRun = await JobRunModel.findOneAndUpdate(
      { _id: runId, status: 'running' },
      {
        $set: {
          status: finalStatus,
          finishedAt: now,
          durationMs,
        },
      },
      { new: true }
    );

    if (finalizedRun) {
      logger.info(
        {
          jobId,
          runId,
          status: finalStatus,
          durationMs,
          pagesScraped,
          pagesFailed,
          pagesSkipped,
        },
        'Run finalized successfully'
      );

      await JobModel.findByIdAndUpdate(jobId, { status: finalStatus });
      return finalizedRun;
    }
  }

  return updatedRun;
}
