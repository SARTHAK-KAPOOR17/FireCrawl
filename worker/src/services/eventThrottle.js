import { defaultEventPublisher } from './eventPublisher.js';

/**
 * EventThrottle manages per-run batching of page:done events into page:batch
 * and coalescing of run:progress events to at most once every flushIntervalMs (default 250ms).
 * Unit-testable with an injectable clock.
 */
export class EventThrottle {
  constructor({
    publisher = defaultEventPublisher,
    flushIntervalMs = 250,
    clock = {
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id),
    },
  } = {}) {
    this.publisher = publisher;
    this.flushIntervalMs = flushIntervalMs;
    this.clock = clock;
    /**
     * Map of runId -> {
     *   userId: string,
     *   jobId: string,
     *   runId: string,
     *   pageBuffer: Array<Object>,
     *   latestProgress: Object | null,
     *   timerId: any
     * }
     */
    this.runs = new Map();
  }

  /**
   * Records a completed page outcome and updates the latest run progress.
   * Buffers page outcomes and schedules a flush within flushIntervalMs.
   */
  recordPageDone({ userId, jobId, runId, page, progress }) {
    let state = this.runs.get(runId);
    if (!state) {
      state = {
        userId,
        jobId,
        runId,
        pageBuffer: [],
        latestProgress: null,
        timerId: null,
      };
      this.runs.set(runId, state);
    }

    if (page) {
      state.pageBuffer.push(page);
    }

    if (progress) {
      state.latestProgress = progress;
    }

    if (!state.timerId) {
      state.timerId = this.clock.setTimeout(async () => {
        state.timerId = null;
        await this.flushRun(runId);
      }, this.flushIntervalMs);
    }
  }

  /**
   * Flushes any buffered page:done items and coalesced progress for a given run
   */
  async flushRun(runId) {
    const state = this.runs.get(runId);
    if (!state) return;

    if (state.timerId) {
      this.clock.clearTimeout(state.timerId);
      state.timerId = null;
    }

    // 1. Flush buffered pages as page:batch
    if (state.pageBuffer.length > 0) {
      const pagesToFlush = [...state.pageBuffer];
      state.pageBuffer = [];
      await this.publisher.publishPageBatch({
        userId: state.userId,
        jobId: state.jobId,
        runId: state.runId,
        pages: pagesToFlush,
      });
    }

    // 2. Flush coalesced progress as run:progress
    if (state.latestProgress) {
      const progressToFlush = state.latestProgress;
      state.latestProgress = null;
      await this.publisher.publishRunProgress({
        userId: state.userId,
        jobId: state.jobId,
        runId: state.runId,
        ...progressToFlush,
      });
    }
  }

  /**
   * Flushes remaining buffered events, always emits final progress, then emits run:finished.
   */
  async flushAndFinish({
    userId,
    jobId,
    runId,
    status,
    durationMs,
    scraped,
    failed,
    skipped,
    total,
    cacheHits = 0,
  }) {
    const state = this.runs.get(runId);
    if (state) {
      if (state.timerId) {
        this.clock.clearTimeout(state.timerId);
        state.timerId = null;
      }

      if (state.pageBuffer.length > 0) {
        const pagesToFlush = [...state.pageBuffer];
        state.pageBuffer = [];
        await this.publisher.publishPageBatch({
          userId: state.userId || userId,
          jobId: state.jobId || jobId,
          runId,
          pages: pagesToFlush,
        });
      }
    }

    // Always emit the final progress before run:finished
    await this.publisher.publishRunProgress({
      userId,
      jobId,
      runId,
      scraped,
      failed,
      skipped,
      total,
      cacheHits,
    });

    // Emit run:finished
    await this.publisher.publishRunFinished({
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

    this.runs.delete(runId);
  }

  /**
   * Flushes all active runs (e.g. during graceful shutdown)
   */
  async flushAll() {
    const runIds = Array.from(this.runs.keys());
    await Promise.all(runIds.map((runId) => this.flushRun(runId)));
  }
}

export const defaultEventThrottle = new EventThrottle({ publisher: defaultEventPublisher });

export function getEventThrottle() {
  return defaultEventThrottle;
}
