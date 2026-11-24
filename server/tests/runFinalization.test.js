import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { recordOutcomeAndFinalizeRun } from '../../worker/src/services/runTracker.js';

describe('Run Tracking & Finalization Logic (worker/src/services/runTracker.js)', () => {
  let mockJobRun;
  let mockJob;

  beforeEach(() => {
    mockJobRun = {
      _id: 'run_123',
      jobId: 'job_456',
      totalUrls: 3,
      status: 'running',
      startedAt: new Date(Date.now() - 5000), // started 5s ago
      pagesScraped: 0,
      pagesFailed: 0,
      pagesSkipped: 0,
    };

    mockJob = {
      _id: 'job_456',
      status: 'running',
    };
  });

  const createMockModels = () => {
    return {
      JobRun: {
        findByIdAndUpdate: jest.fn(async (id, update) => {
          if (update.$inc) {
            for (const [key, val] of Object.entries(update.$inc)) {
              mockJobRun[key] = (mockJobRun[key] || 0) + val;
            }
          }
          return { ...mockJobRun };
        }),
        findOneAndUpdate: jest.fn(async (filter, update) => {
          // Conditional check on status: 'running'
          if (filter._id === mockJobRun._id && mockJobRun.status === filter.status) {
            if (update.$set) {
              Object.assign(mockJobRun, update.$set);
            }
            return { ...mockJobRun };
          }
          return null; // Condition failed: already finalized
        }),
      },
      Job: {
        findByIdAndUpdate: jest.fn(async (id, update) => {
          Object.assign(mockJob, update);
          return { ...mockJob };
        }),
      },
    };
  };

  it('increments pagesScraped on outcome="scraped"', async () => {
    const models = createMockModels();

    const res = await recordOutcomeAndFinalizeRun({
      jobId: 'job_456',
      runId: 'run_123',
      outcome: 'scraped',
      models,
    });

    expect(res.pagesScraped).toBe(1);
    expect(res.pagesFailed).toBe(0);
    expect(res.pagesSkipped).toBe(0);
    expect(res.status).toBe('running');
  });

  it('increments pagesSkipped on outcome="skipped"', async () => {
    const models = createMockModels();

    const res = await recordOutcomeAndFinalizeRun({
      jobId: 'job_456',
      runId: 'run_123',
      outcome: 'skipped',
      models,
    });

    expect(res.pagesSkipped).toBe(1);
    expect(res.status).toBe('running');
  });

  it('increments pagesFailed on outcome="failed"', async () => {
    const models = createMockModels();

    const res = await recordOutcomeAndFinalizeRun({
      jobId: 'job_456',
      runId: 'run_123',
      outcome: 'failed',
      models,
    });

    expect(res.pagesFailed).toBe(1);
    expect(res.status).toBe('running');
  });

  it('finalizes run with "completed" when all URLs processed and at least one succeeded', async () => {
    const models = createMockModels();

    // 1st URL scraped
    await recordOutcomeAndFinalizeRun({
      jobId: 'job_456',
      runId: 'run_123',
      outcome: 'scraped',
      models,
    });

    // 2nd URL skipped
    await recordOutcomeAndFinalizeRun({
      jobId: 'job_456',
      runId: 'run_123',
      outcome: 'skipped',
      models,
    });

    // 3rd URL failed (3/3 reached)
    const finalized = await recordOutcomeAndFinalizeRun({
      jobId: 'job_456',
      runId: 'run_123',
      outcome: 'failed',
      models,
    });

    expect(finalized.status).toBe('completed');
    expect(finalized.finishedAt).toBeDefined();
    expect(finalized.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockJob.status).toBe('completed');
  });

  it('finalizes run with "failed" when all URLs processed and zero pages scraped', async () => {
    const models = createMockModels();

    // 1st URL failed
    await recordOutcomeAndFinalizeRun({
      jobId: 'job_456',
      runId: 'run_123',
      outcome: 'failed',
      models,
    });

    // 2nd URL failed
    await recordOutcomeAndFinalizeRun({
      jobId: 'job_456',
      runId: 'run_123',
      outcome: 'failed',
      models,
    });

    // 3rd URL failed (total 3/3 processed, 0 scraped)
    const finalized = await recordOutcomeAndFinalizeRun({
      jobId: 'job_456',
      runId: 'run_123',
      outcome: 'failed',
      models,
    });

    expect(finalized.status).toBe('failed');
    expect(finalized.finishedAt).toBeDefined();
    expect(mockJob.status).toBe('failed');
  });

  it('ensures exactly-once finalization under concurrent terminal calls', async () => {
    const models = createMockModels();
    mockJobRun.pagesScraped = 2; // already 2 processed out of 3

    // Two concurrent workers finish the 3rd and final URL at the exact same moment
    const [result1, result2] = await Promise.all([
      recordOutcomeAndFinalizeRun({
        jobId: 'job_456',
        runId: 'run_123',
        outcome: 'scraped',
        models,
      }),
      recordOutcomeAndFinalizeRun({
        jobId: 'job_456',
        runId: 'run_123',
        outcome: 'scraped',
        models,
      }),
    ]);

    // Only one should have successfully matched status: 'running' and executed findOneAndUpdate
    expect(models.JobRun.findOneAndUpdate).toHaveBeenCalledTimes(2);

    // JobRun ended in completed
    expect(mockJobRun.status).toBe('completed');
    expect(mockJob.status).toBe('completed');
  });
});
