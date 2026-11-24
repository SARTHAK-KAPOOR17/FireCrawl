import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventThrottle } from '../../worker/src/services/eventThrottle.js';
import { EventPublisher } from '../../worker/src/services/eventPublisher.js';
import { REALTIME_EVENTS, EVENTS_CHANNEL } from '@scraper/shared';

describe('Phase 5: Worker Realtime Throttler & Publisher', () => {
  describe('1. EventThrottle (batching and coalescing with fake clock)', () => {
    let mockPublisher;
    let publishedBatches;
    let publishedProgresses;
    let publishedFinishes;
    let currentTime;
    let timerQueue;
    let fakeClock;

    beforeEach(() => {
      publishedBatches = [];
      publishedProgresses = [];
      publishedFinishes = [];
      currentTime = 1000;
      timerQueue = [];

      fakeClock = {
        now: () => currentTime,
        setTimeout: (fn, delay) => {
          const id = { fn, runAt: currentTime + delay };
          timerQueue.push(id);
          return id;
        },
        clearTimeout: (id) => {
          const index = timerQueue.indexOf(id);
          if (index !== -1) {
            timerQueue.splice(index, 1);
          }
        },
      };

      mockPublisher = {
        publishPageBatch: jest.fn(async (payload) => {
          publishedBatches.push(payload);
          return true;
        }),
        publishRunProgress: jest.fn(async (payload) => {
          publishedProgresses.push(payload);
          return true;
        }),
        publishRunFinished: jest.fn(async (payload) => {
          publishedFinishes.push(payload);
          return true;
        }),
      };
    });

    const advanceTime = async (ms) => {
      currentTime += ms;
      const readyTimers = timerQueue.filter((t) => t.runAt <= currentTime);
      for (const t of readyTimers) {
        fakeClock.clearTimeout(t);
        await t.fn();
      }
    };

    it('buffers page:done events and flushes them as page:batch after 250ms', async () => {
      const throttler = new EventThrottle({
        publisher: mockPublisher,
        flushIntervalMs: 250,
        clock: fakeClock,
      });

      throttler.recordPageDone({
        userId: 'user_1',
        jobId: 'job_1',
        runId: 'run_1',
        page: { url: 'https://example.com/1', outcome: 'scraped', cached: false },
        progress: { scraped: 1, failed: 0, skipped: 0, total: 10, cacheHits: 0 },
      });

      throttler.recordPageDone({
        userId: 'user_1',
        jobId: 'job_1',
        runId: 'run_1',
        page: { url: 'https://example.com/2', outcome: 'skipped', code: 'DUPLICATE', cached: true },
        progress: { scraped: 1, failed: 0, skipped: 1, total: 10, cacheHits: 1 },
      });

      // Nothing published immediately before 250ms
      expect(publishedBatches).toHaveLength(0);
      expect(publishedProgresses).toHaveLength(0);

      // Advance clock by 250ms
      await advanceTime(250);

      expect(publishedBatches).toHaveLength(1);
      expect(publishedBatches[0].runId).toBe('run_1');
      expect(publishedBatches[0].pages).toHaveLength(2);
      expect(publishedBatches[0].pages[0].url).toBe('https://example.com/1');
      expect(publishedBatches[0].pages[1].url).toBe('https://example.com/2');

      // Coalesced progress published once
      expect(publishedProgresses).toHaveLength(1);
      expect(publishedProgresses[0].scraped).toBe(1);
      expect(publishedProgresses[0].skipped).toBe(1);
    });

    it('coalesces multiple progress updates to at most one per 250ms per run', async () => {
      const throttler = new EventThrottle({
        publisher: mockPublisher,
        flushIntervalMs: 250,
        clock: fakeClock,
      });

      // 5 rapid updates in the same 250ms window
      for (let i = 1; i <= 5; i++) {
        throttler.recordPageDone({
          userId: 'user_1',
          jobId: 'job_1',
          runId: 'run_1',
          page: { url: `https://example.com/${i}`, outcome: 'scraped' },
          progress: { scraped: i, failed: 0, skipped: 0, total: 5, cacheHits: 0 },
        });
      }

      await advanceTime(250);

      expect(publishedBatches).toHaveLength(1);
      expect(publishedBatches[0].pages).toHaveLength(5);
      // Exactly one coalesced progress update with the latest counters
      expect(publishedProgresses).toHaveLength(1);
      expect(publishedProgresses[0].scraped).toBe(5);
    });

    it('always emits final progress before emitting run:finished in flushAndFinish', async () => {
      const throttler = new EventThrottle({
        publisher: mockPublisher,
        flushIntervalMs: 250,
        clock: fakeClock,
      });

      // 1 item recorded without waiting for timer to expire
      throttler.recordPageDone({
        userId: 'user_1',
        jobId: 'job_1',
        runId: 'run_1',
        page: { url: 'https://example.com/final', outcome: 'scraped' },
        progress: { scraped: 1, failed: 0, skipped: 0, total: 1, cacheHits: 0 },
      });

      const callOrder = [];
      mockPublisher.publishPageBatch.mockImplementation(async (data) => {
        callOrder.push({ type: 'batch', data });
      });
      mockPublisher.publishRunProgress.mockImplementation(async (data) => {
        callOrder.push({ type: 'progress', data });
      });
      mockPublisher.publishRunFinished.mockImplementation(async (data) => {
        callOrder.push({ type: 'finished', data });
      });

      await throttler.flushAndFinish({
        userId: 'user_1',
        jobId: 'job_1',
        runId: 'run_1',
        status: 'completed',
        durationMs: 1200,
        scraped: 1,
        failed: 0,
        skipped: 0,
        total: 1,
        cacheHits: 0,
      });

      // Expect batch flushed, then final progress, then run:finished
      expect(callOrder).toHaveLength(3);
      expect(callOrder[0].type).toBe('batch');
      expect(callOrder[1].type).toBe('progress');
      expect(callOrder[1].data.scraped).toBe(1);
      expect(callOrder[2].type).toBe('finished');
      expect(callOrder[2].data.status).toBe('completed');
    });
  });

  describe('2. EventPublisher (best-effort error swallowing)', () => {
    it('swallows Redis publishing errors without throwing into caller', async () => {
      const mockFailingRedis = {
        publish: jest.fn().mockRejectedValue(new Error('Redis connection lost')),
      };

      const publisher = new EventPublisher({ client: mockFailingRedis });

      // Must resolve cleanly without throwing
      await expect(
        publisher.publishRunStarted({
          userId: 'user_1',
          jobId: 'job_1',
          runId: 'run_1',
          totalUrls: 5,
        })
      ).resolves.toBe(false);

      expect(mockFailingRedis.publish).toHaveBeenCalledWith(
        EVENTS_CHANNEL,
        expect.stringContaining(REALTIME_EVENTS.RUN_STARTED)
      );
    });

    it('successfully publishes formatted JSON payload with timestamp when Redis succeeds', async () => {
      const mockSuccessRedis = {
        publish: jest.fn().mockResolvedValue(1),
      };

      const publisher = new EventPublisher({ client: mockSuccessRedis });

      const result = await publisher.publishRunProgress({
        userId: 'user_1',
        jobId: 'job_1',
        runId: 'run_1',
        scraped: 3,
        failed: 1,
        skipped: 0,
        total: 4,
        cacheHits: 1,
      });

      expect(result).toBe(true);
      expect(mockSuccessRedis.publish).toHaveBeenCalledTimes(1);

      const [channel, jsonString] = mockSuccessRedis.publish.mock.calls[0];
      expect(channel).toBe(EVENTS_CHANNEL);

      const parsed = JSON.parse(jsonString);
      expect(parsed.type).toBe(REALTIME_EVENTS.RUN_PROGRESS);
      expect(parsed.userId).toBe('user_1');
      expect(parsed.scraped).toBe(3);
      expect(typeof parsed.ts).toBe('number');
    });
  });
});
