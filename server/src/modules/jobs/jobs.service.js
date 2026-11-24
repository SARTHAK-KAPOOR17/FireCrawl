import { Job, JobRun, Result } from '@scraper/shared';
import { getScrapeQueue } from './jobs.queue.js';
import { logger } from '../../utils/logger.js';

export class JobServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Start a run for a given job and enqueue its URLs to BullMQ
 */
export async function startJobRun({ jobId, userId, queue = getScrapeQueue() }) {
  const job = await Job.findOne({ _id: jobId, userId });
  if (!job) {
    throw new JobServiceError('Job not found', 404);
  }

  // Check if a run is already running
  const runningRun = await JobRun.findOne({ jobId: job._id, status: 'running' });
  if (runningRun) {
    throw new JobServiceError('A run is already active for this job', 409);
  }

  const jobRun = await JobRun.create({
    jobId: job._id,
    userId,
    status: 'running',
    totalUrls: job.urls.length,
    startedAt: new Date(),
    pagesScraped: 0,
    pagesFailed: 0,
    pagesSkipped: 0,
    cacheHits: 0,
  });

  job.status = 'queued';
  await job.save();

  const selectorsObj =
    job.selectors instanceof Map
      ? Object.fromEntries(job.selectors)
      : typeof job.selectors?.toJSON === 'function'
      ? job.selectors.toJSON()
      : job.selectors;

  const bulkJobs = job.urls.map((url, index) => ({
    name: `scrape-${job._id}-${jobRun._id}-${index}`,
    data: {
      jobId: job._id.toString(),
      runId: jobRun._id.toString(),
      userId: userId.toString(),
      url,
      selectors: selectorsObj,
      mode: job.mode,
    },
    opts: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 },
    },
  }));

  try {
    await queue.addBulk(bulkJobs);
    logger.info(
      { jobId: job._id, runId: jobRun._id, count: bulkJobs.length },
      'Successfully enqueued scrape jobs'
    );
  } catch (queueErr) {
    logger.error({ err: queueErr.message, jobId: job._id, runId: jobRun._id }, 'Failed to enqueue scrape jobs');
  }

  return { jobRun, job };
}

/**
 * Create a new Job and optionally run immediately
 */
export async function createJob({ userId, data, queue }) {
  const { name, urls, selectors, mode, schedule, aiFallback, runNow = true } = data;

  const job = await Job.create({
    userId,
    name,
    urls,
    selectors,
    mode: mode || 'static',
    schedule: schedule || null,
    aiFallback: Boolean(aiFallback),
    status: 'idle',
  });

  let run = null;
  if (runNow !== false) {
    const runResult = await startJobRun({ jobId: job._id, userId, queue });
    run = runResult.jobRun;
  }

  return { job, run };
}

/**
 * List paginated jobs for user
 */
export async function getJobs({ userId, page = 1, limit = 10 }) {
  const skip = (page - 1) * limit;

  const [jobs, total] = await Promise.all([
    Job.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Job.countDocuments({ userId }),
  ]);

  return {
    jobs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Get single job by ID (with ownership check)
 */
export async function getJobById({ jobId, userId }) {
  const job = await Job.findOne({ _id: jobId, userId });
  if (!job) {
    throw new JobServiceError('Job not found', 404);
  }
  return job;
}

/**
 * Delete job and all associated Results and JobRuns
 */
export async function deleteJob({ jobId, userId }) {
  const job = await Job.findOne({ _id: jobId, userId });
  if (!job) {
    throw new JobServiceError('Job not found', 404);
  }

  await Promise.all([
    Job.deleteOne({ _id: jobId }),
    Result.deleteMany({ jobId }),
    JobRun.deleteMany({ jobId }),
  ]);

  return { message: 'Job, results, and runs deleted successfully' };
}

/**
 * List all runs for a job (newest first)
 */
export async function getJobRuns({ jobId, userId }) {
  const job = await Job.findOne({ _id: jobId, userId });
  if (!job) {
    throw new JobServiceError('Job not found', 404);
  }

  const runs = await JobRun.find({ jobId, userId }).sort({ startedAt: -1 });
  return runs;
}

/**
 * List paginated results for a job with optional search and sort
 */
export async function getJobResults({
  jobId,
  userId,
  page = 1,
  limit = 20,
  search = '',
  sort = 'desc',
}) {
  const job = await Job.findOne({ _id: jobId, userId });
  if (!job) {
    throw new JobServiceError('Job not found', 404);
  }

  const query = { jobId: job._id };

  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    const orConditions = [{ url: searchRegex }];

    const selectorKeys =
      job.selectors instanceof Map
        ? Array.from(job.selectors.keys())
        : typeof job.selectors?.toJSON === 'function'
        ? Object.keys(job.selectors.toJSON())
        : Object.keys(job.selectors || {});

    for (const key of selectorKeys) {
      orConditions.push({ [`data.${key}`]: searchRegex });
    }

    query.$or = orConditions;
  }

  const sortOrder = sort === 'asc' ? 1 : -1;
  const skip = (page - 1) * limit;

  const [results, total] = await Promise.all([
    Result.find(query).sort({ scrapedAt: sortOrder }).skip(skip).limit(limit),
    Result.countDocuments(query),
  ]);

  return {
    results,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
