import Redis from 'ioredis';
import { EVENTS_CHANNEL, REALTIME_EVENTS } from '@scraper/shared';
import { redisConnection } from '../config/redis.js';
import { logger } from '../utils/logger.js';

let sharedPublisherClient = null;

/**
 * Returns a dedicated Redis client for publishing events
 * @returns {Redis}
 */
export function getPublisherClient() {
  if (!sharedPublisherClient) {
    sharedPublisherClient = new Redis({
      ...redisConnection,
      lazyConnect: true,
    });
    sharedPublisherClient.on('error', (err) => {
      logger.warn({ err: err?.message }, 'Realtime publisher Redis client error');
    });
  }
  return sharedPublisherClient;
}

/**
 * EventPublisher: best-effort publisher that publishes events to Redis EVENTS_CHANNEL.
 * It catches all errors and never throws or slows the scraping path.
 */
export class EventPublisher {
  constructor({ client = null } = {}) {
    this.client = client;
  }

  getClient() {
    return this.client || getPublisherClient();
  }

  /**
   * Publishes a raw event object to Redis pub/sub channel.
   * Catches and logs all errors, never throws.
   * @param {Object} event
   * @returns {Promise<boolean>} whether publication succeeded
   */
  async publish(event) {
    try {
      const client = this.getClient();
      const payload = {
        ...event,
        ts: event.ts || Date.now(),
      };
      await client.publish(EVENTS_CHANNEL, JSON.stringify(payload));
      return true;
    } catch (err) {
      logger.warn(
        { err: err?.message, type: event?.type, jobId: event?.jobId, runId: event?.runId },
        'Failed to publish realtime event to Redis (best-effort)'
      );
      return false;
    }
  }

  /**
   * Publishes run:started event
   */
  async publishRunStarted({ userId, jobId, runId, totalUrls }) {
    return this.publish({
      type: REALTIME_EVENTS.RUN_STARTED,
      userId,
      jobId,
      runId,
      totalUrls,
    });
  }

  /**
   * Publishes run:progress event
   */
  async publishRunProgress({ userId, jobId, runId, scraped, failed, skipped, total, cacheHits = 0 }) {
    return this.publish({
      type: REALTIME_EVENTS.RUN_PROGRESS,
      userId,
      jobId,
      runId,
      scraped,
      failed,
      skipped,
      total,
      cacheHits,
    });
  }

  /**
   * Publishes page:done single event (if unbatched)
   */
  async publishPageDone({ userId, jobId, runId, url, outcome, code, cached }) {
    return this.publish({
      type: REALTIME_EVENTS.PAGE_DONE,
      userId,
      jobId,
      runId,
      url,
      outcome,
      code,
      cached,
    });
  }

  /**
   * Publishes page:batch event containing an array of page outcomes
   */
  async publishPageBatch({ userId, jobId, runId, pages }) {
    return this.publish({
      type: REALTIME_EVENTS.PAGE_BATCH,
      userId,
      jobId,
      runId,
      pages,
    });
  }

  /**
   * Publishes run:finished event
   */
  async publishRunFinished({ userId, jobId, runId, status, durationMs, scraped, failed, skipped, total }) {
    return this.publish({
      type: REALTIME_EVENTS.RUN_FINISHED,
      userId,
      jobId,
      runId,
      status,
      durationMs,
      scraped,
      failed,
      skipped,
      total,
    });
  }

  /**
   * Gracefully close the publisher Redis connection
   */
  async close() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch (_) {}
      this.client = null;
    }
  }
}

export const defaultEventPublisher = new EventPublisher();

/**
 * Closes the shared publisher Redis client
 */
export async function closePublisherClient() {
  if (sharedPublisherClient) {
    try {
      await sharedPublisherClient.quit();
    } catch (_) {}
    sharedPublisherClient = null;
  }
}
