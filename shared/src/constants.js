export const QUEUE_NAME = 'scrape-url';

export const EVENTS_CHANNEL = 'scrape:events';

export const REALTIME_EVENTS = {
  RUN_STARTED: 'run:started',
  RUN_PROGRESS: 'run:progress',
  PAGE_DONE: 'page:done',
  PAGE_BATCH: 'page:batch',
  RUN_FINISHED: 'run:finished',
};

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
 * Realtime Event Types & Payloads
 *
 * Base Event Shape (present on every event):
 * @typedef {Object} BaseRealtimeEvent
 * @property {string} type - Event type name ('run:started' | 'run:progress' | 'page:done' | 'page:batch' | 'run:finished')
 * @property {string} userId - ID of the user who owns the job
 * @property {string} jobId - ID of the job
 * @property {string} runId - ID of the active run
 * @property {number} ts - Millisecond timestamp when the event was emitted
 *
 * Event: run:started
 * @typedef {BaseRealtimeEvent & { type: 'run:started', totalUrls: number }} RunStartedEvent
 *
 * Event: run:progress
 * @typedef {BaseRealtimeEvent & { type: 'run:progress', scraped: number, failed: number, skipped: number, total: number, cacheHits: number }} RunProgressEvent
 *
 * Event: page:done
 * @typedef {BaseRealtimeEvent & { type: 'page:done', url: string, outcome: 'scraped' | 'skipped' | 'failed', code?: string, cached?: boolean }} PageDoneEvent
 *
 * Event: page:batch
 * @typedef {BaseRealtimeEvent & { type: 'page:batch', pages: Array<Omit<PageDoneEvent, 'type' | 'userId' | 'jobId' | 'runId'>> }} PageBatchEvent
 *
 * Event: run:finished
 * @typedef {BaseRealtimeEvent & { type: 'run:finished', status: 'completed' | 'failed', durationMs: number, scraped: number, failed: number, skipped: number, total: number }} RunFinishedEvent
 *
 * Scrape Job Payload Shape
 * @typedef {Object} ScrapeJobPayload
 * @property {string} jobId
 * @property {string} runId
 * @property {string} userId
 * @property {string} url
 * @property {Record<string, string>} selectors
 * @property {'static' | 'dynamic'} mode
 */
