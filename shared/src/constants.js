export const QUEUE_NAME = 'scrape-url';

export const JOB_STATUS = {
  IDLE: 'idle',
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const RUN_STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const SCRAPE_MODE = {
  STATIC: 'static',
  DYNAMIC: 'dynamic',
};

/**
 * Scrape Job Payload Shape
 * @typedef {Object} ScrapeJobPayload
 * @property {string} jobId
 * @property {string} runId
 * @property {string} userId
 * @property {string} url
 * @property {Record<string, string>} selectors
 * @property {'static' | 'dynamic'} mode
 */
