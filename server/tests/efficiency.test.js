import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';
import {
  Result,
  JobRun,
  ErrorCodes,
  RobotsDisallowedError,
  RateLimitWaitTimeoutError,
} from '@scraper/shared';
import {
  getCacheKey,
  getCachedHtml,
  setCachedHtml,
} from '../../worker/src/services/htmlCache.js';
import {
  ResultWriter,
  getResultWriter,
} from '../../worker/src/services/resultWriter.js';
import {
  acquireDomainRateLimit,
  extractDomain,
} from '../../worker/src/services/rateLimiter.js';
import { checkRobotsAllowed } from '../../worker/src/services/robotsChecker.js';
import { processScrapeJob } from '../../worker/src/processor.js';
import { recordCacheHit } from '../../worker/src/services/runTracker.js';

describe('Phase 3: Efficiency Layer Test Suite', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Redis HTML Cache (worker/src/services/htmlCache.js)', () => {
    let mockRedis;

    beforeEach(() => {
      const store = new Map();
      mockRedis = {
        store,
        get: jest.fn(async (key) => store.get(key) || null),
        set: jest.fn(async (key, val, ex, ttl) => {
          store.set(key, val);
          return 'OK';
        }),
      };
    });

    it('generates consistent sha256 cache key with htmlcache prefix', () => {
      const url = 'https://example.com/books/1';
      const expectedHash = crypto.createHash('sha256').update(url).digest('hex');
      expect(getCacheKey(url)).toBe(`htmlcache:${expectedHash}`);
    });

    it('returns cached HTML on cache hit', async () => {
      const url = 'https://example.com/books/1';
      const html = '<html><body><h1>Book Title</h1></body></html>';
      mockRedis.store.set(getCacheKey(url), html);

      const cached = await getCachedHtml(mockRedis, url);
      expect(cached).toBe(html);
      expect(mockRedis.get).toHaveBeenCalledWith(getCacheKey(url));
    });

    it('returns null on cache miss', async () => {
      const url = 'https://example.com/books/unknown';
      const cached = await getCachedHtml(mockRedis, url);
      expect(cached).toBeNull();
    });

    it('bypasses cache read when forceRefresh is true', async () => {
      const url = 'https://example.com/books/1';
      mockRedis.store.set(getCacheKey(url), '<html><body>Old Content</body></html>');

      const cached = await getCachedHtml(mockRedis, url, { forceRefresh: true });
      expect(cached).toBeNull();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('caches only 2xx HTML responses under 2MB', async () => {
      const url = 'https://example.com/page';
      const normalHtml = '<div>Hello world</div>';

      const success = await setCachedHtml(mockRedis, url, normalHtml, {
        status: 200,
        ttlSeconds: 3600,
      });

      expect(success).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(getCacheKey(url), normalHtml, 'EX', 3600);

      // Should reject 404 response
      const notFoundSuccess = await setCachedHtml(mockRedis, url, normalHtml, {
        status: 404,
      });
      expect(notFoundSuccess).toBe(false);

      // Should reject responses >= 2MB
      const largeHtml = 'X'.repeat(2 * 1024 * 1024 + 10);
      const largeSuccess = await setCachedHtml(mockRedis, url, largeHtml, {
        status: 200,
      });
      expect(largeSuccess).toBe(false);
    });

    it('records cache hits atomically via JobRun.cacheHits $inc', async () => {
      const mockJobRun = { _id: 'run_cache_1', cacheHits: 0 };
      const mockJobRunModel = {
        findByIdAndUpdate: jest.fn(async (id, update) => {
          if (update.$inc?.cacheHits) {
            mockJobRun.cacheHits += update.$inc.cacheHits;
          }
          return mockJobRun;
        }),
      };

      await recordCacheHit({
        runId: 'run_cache_1',
        models: { JobRun: mockJobRunModel },
      });

      expect(mockJobRunModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'run_cache_1',
        { $inc: { cacheHits: 1 } },
        { new: true }
      );
      expect(mockJobRun.cacheHits).toBe(1);
    });
  });

  describe('2. ResultWriter Batched Writes (worker/src/services/resultWriter.js)', () => {
    it('flushes automatically when buffer reaches batchSize', async () => {
      const mockInsertMany = jest.fn(async (docs) => docs);
      const mockResultModel = { insertMany: mockInsertMany };

      const writer = new ResultWriter({
        ResultModel: mockResultModel,
        batchSize: 3,
        flushIntervalMs: 5000,
      });

      const p1 = writer.add({ url: 'http://example.com/1', contentHash: 'h1' });
      const p2 = writer.add({ url: 'http://example.com/2', contentHash: 'h2' });

      // Before reaching batchSize, no flush has happened yet
      expect(mockInsertMany).not.toHaveBeenCalled();

      // Third doc hits batchSize (3) -> triggers immediate flush
      const p3 = writer.add({ url: 'http://example.com/3', contentHash: 'h3' });

      const results = await Promise.all([p1, p2, p3]);

      expect(results).toEqual(['inserted', 'inserted', 'inserted']);
      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      expect(mockInsertMany).toHaveBeenCalledWith(
        [
          { url: 'http://example.com/1', contentHash: 'h1' },
          { url: 'http://example.com/2', contentHash: 'h2' },
          { url: 'http://example.com/3', contentHash: 'h3' },
        ],
        { ordered: false }
      );
    });

    it('flushes after flushIntervalMs when batchSize is not reached', async () => {
      const mockInsertMany = jest.fn(async (docs) => docs);
      const mockResultModel = { insertMany: mockInsertMany };

      const writer = new ResultWriter({
        ResultModel: mockResultModel,
        batchSize: 10,
        flushIntervalMs: 50,
      });

      const p1 = writer.add({ url: 'http://example.com/alone', contentHash: 'h_alone' });

      expect(mockInsertMany).not.toHaveBeenCalled();

      // Wait for timer flush
      const result = await p1;

      expect(result).toBe('inserted');
      expect(mockInsertMany).toHaveBeenCalledTimes(1);
    });

    it('handles duplicate key errors (code 11000) inside a batch, marking only affected docs as duplicate', async () => {
      const bulkError = {
        name: 'MongoBulkWriteError',
        writeErrors: [
          {
            index: 1, // Second document in batch was duplicate
            code: 11000,
            errmsg: 'E11000 duplicate key error',
          },
        ],
      };

      const mockInsertMany = jest.fn(async () => {
        throw bulkError;
      });
      const mockResultModel = { insertMany: mockInsertMany };

      const writer = new ResultWriter({
        ResultModel: mockResultModel,
        batchSize: 3,
        flushIntervalMs: 1000,
      });

      const p0 = writer.add({ url: 'http://example.com/doc0', contentHash: 'h0' });
      const p1 = writer.add({ url: 'http://example.com/doc1', contentHash: 'h1' });
      const p2 = writer.add({ url: 'http://example.com/doc2', contentHash: 'h2' });

      const results = await Promise.all([p0, p1, p2]);

      expect(results[0]).toBe('inserted');
      expect(results[1]).toBe('duplicate');
      expect(results[2]).toBe('inserted');
    });

    it('shutdown() flushes remaining items in the buffer', async () => {
      const mockInsertMany = jest.fn(async (docs) => docs);
      const mockResultModel = { insertMany: mockInsertMany };

      const writer = new ResultWriter({
        ResultModel: mockResultModel,
        batchSize: 100,
        flushIntervalMs: 10000,
      });

      const p1 = writer.add({ url: 'http://example.com/remaining', contentHash: 'h_rem' });

      expect(writer.buffer.length).toBe(1);

      await writer.shutdown();

      const result = await p1;
      expect(result).toBe('inserted');
      expect(writer.buffer.length).toBe(0);
      expect(mockInsertMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Per-Domain Rate Limiter (worker/src/services/rateLimiter.js)', () => {
    it('extracts domain hostname correctly from url', () => {
      expect(extractDomain('https://books.toscrape.com/catalogue/page-1.html')).toBe(
        'books.toscrape.com'
      );
      expect(extractDomain('http://localhost:5000/api')).toBe('localhost');
    });

    it('acquires rate limit slot when under limit without sleep', async () => {
      const mockRedis = {
        eval: jest.fn(async () => 1), // Allowed
      };
      const sleepFn = jest.fn();

      const allowed = await acquireDomainRateLimit(mockRedis, 'books.toscrape.com', {
        limitRps: 5,
        maxWaitMs: 1000,
        sleepFn,
      });

      expect(allowed).toBe(true);
      expect(sleepFn).not.toHaveBeenCalled();
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    });

    it('waits with bounded sleep when limited until slot is available without consuming retries', async () => {
      let callCount = 0;
      const mockRedis = {
        eval: jest.fn(async () => {
          callCount++;
          return callCount >= 3 ? 1 : 0; // Limited first 2 times, then allowed
        }),
      };
      const sleepFn = jest.fn(async () => {});

      const allowed = await acquireDomainRateLimit(mockRedis, 'books.toscrape.com', {
        limitRps: 5,
        maxWaitMs: 5000,
        sleepFn,
      });

      expect(allowed).toBe(true);
      expect(callCount).toBe(3);
      expect(sleepFn).toHaveBeenCalledTimes(2);
    });

    it('throws RateLimitWaitTimeoutError when maxWaitMs is exceeded', async () => {
      const mockRedis = {
        eval: jest.fn(async () => 0), // Permanently limited
      };
      const sleepFn = jest.fn(async () => {});

      await expect(
        acquireDomainRateLimit(mockRedis, 'busy.domain.com', {
          limitRps: 2,
          maxWaitMs: 50,
          sleepFn,
        })
      ).rejects.toThrow(RateLimitWaitTimeoutError);
    });
  });

  describe('4. robots.txt Checker (worker/src/services/robotsChecker.js)', () => {
    const ROBOTS_FIXTURE = `
User-agent: *
Disallow: /admin/
Disallow: /private/
Allow: /
`;

    it('allows permitted URLs according to robots.txt', async () => {
      const mockRedis = {
        get: jest.fn(async () => ROBOTS_FIXTURE),
        set: jest.fn(),
      };

      const allowed = await checkRobotsAllowed('https://example.com/books/catalogue', {
        redis: mockRedis,
      });

      expect(allowed).toBe(true);
    });

    it('throws RobotsDisallowedError when URL path is disallowed', async () => {
      const mockRedis = {
        get: jest.fn(async () => ROBOTS_FIXTURE),
        set: jest.fn(),
      };

      await expect(
        checkRobotsAllowed('https://example.com/admin/settings', {
          redis: mockRedis,
        })
      ).rejects.toThrow(RobotsDisallowedError);
    });

    it('allows URL when robots.txt returns 404 or fails to fetch (never fails scrape)', async () => {
      const mockRedis = {
        get: jest.fn(async () => null),
        set: jest.fn(async () => 'OK'),
      };
      const mockAxios = {
        get: jest.fn(async () => {
          const err = new Error('Request failed with status code 404');
          err.response = { status: 404 };
          throw err;
        }),
      };

      const allowed = await checkRobotsAllowed('https://no-robots.com/any-page', {
        redis: mockRedis,
        axiosClient: mockAxios,
      });

      expect(allowed).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith('robots:https://no-robots.com', '', 'EX', 86400);
    });

    it('caches robots.txt text in Redis per origin for 24h', async () => {
      const mockRedis = {
        get: jest.fn(async () => null),
        set: jest.fn(async () => 'OK'),
      };
      const mockAxios = {
        get: jest.fn(async () => ({ data: ROBOTS_FIXTURE, status: 200 })),
      };

      await checkRobotsAllowed('https://example.com/books/1', {
        redis: mockRedis,
        axiosClient: mockAxios,
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'robots:https://example.com',
        ROBOTS_FIXTURE,
        'EX',
        86400
      );
    });
  });

  describe('5. Deduplication Semantics with (jobId, url, contentHash)', () => {
    it('defines unique compound index on (jobId, url, contentHash)', () => {
      const indexes = Result.schema.indexes();
      const uniqueCompound = indexes.find(
        ([fields, options]) =>
          fields.jobId === 1 && fields.url === 1 && fields.contentHash === 1 && options?.unique
      );
      expect(uniqueCompound).toBeDefined();

      const timeIndex = indexes.find(
        ([fields]) => fields.jobId === 1 && fields.scrapedAt === -1
      );
      expect(timeIndex).toBeDefined();
    });

    it('JobRun schema includes duplicatesSkipped and robotsBlocked defaulted to 0', () => {
      const mockRun = new JobRun({
        jobId: '507f1f77bcf86cd799439011',
        userId: '507f1f77bcf86cd799439012',
        totalUrls: 5,
      });

      expect(mockRun.duplicatesSkipped).toBe(0);
      expect(mockRun.robotsBlocked).toBe(0);
      expect(mockRun.pagesSkipped).toBe(0);
      expect(mockRun.cacheHits).toBe(0);
    });
  });

  describe('6. Worker Processor Efficiency Integration (worker/src/processor.js)', () => {
    it('uses cached HTML without network fetch or rate limiting on cache hit', async () => {
      const mockRedis = {
        get: jest.fn(async (k) => {
          if (k.startsWith('htmlcache:')) {
            return '<html><body><h1 id="t">Cached Title</h1></body></html>';
          }
          return null;
        }),
        set: jest.fn(),
      };

      const mockJobRunModel = {
        findByIdAndUpdate: jest.fn(async () => ({})),
      };

      const mockWriter = {
        add: jest.fn(async () => 'inserted'),
      };

      const checkRobotsFn = jest.fn();
      const rateLimiterFn = jest.fn();
      const recordOutcomeFn = jest.fn();

      const job = {
        data: {
          jobId: 'job_1',
          runId: 'run_1',
          userId: 'user_1',
          url: 'https://example.com/cached-page',
          selectors: { title: '#t' },
          forceRefresh: false,
        },
        attemptsMade: 0,
      };

      const result = await processScrapeJob(job, {
        redis: mockRedis,
        resultWriter: mockWriter,
        checkRobotsFn,
        rateLimiterFn,
        recordOutcomeFn,
        models: { Job: { findOneAndUpdate: jest.fn() }, JobRun: mockJobRunModel, Result },
      });

      expect(result.outcome).toBe('scraped');
      expect(result.cacheHit).toBe(true);
      expect(checkRobotsFn).not.toHaveBeenCalled();
      expect(rateLimiterFn).not.toHaveBeenCalled();
      expect(mockWriter.add).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/cached-page',
          data: { title: 'Cached Title' },
        })
      );
      expect(recordOutcomeFn).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'scraped',
          cacheHit: true,
        })
      );
    });

    it('marks robots disallowed URL as skipped with skipReason=robots and stores nothing', async () => {
      const mockRedis = {
        get: jest.fn(async () => null),
      };

      const mockWriter = {
        add: jest.fn(),
      };

      const checkRobotsFn = jest.fn(async () => {
        throw new RobotsDisallowedError('Disallowed by robots.txt');
      });
      const recordOutcomeFn = jest.fn();

      const job = {
        data: {
          jobId: 'job_2',
          runId: 'run_2',
          userId: 'user_2',
          url: 'https://example.com/blocked-page',
          selectors: { title: 'h1' },
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
      };

      const result = await processScrapeJob(job, {
        redis: mockRedis,
        resultWriter: mockWriter,
        checkRobotsFn,
        recordOutcomeFn,
        models: { Job: { findOneAndUpdate: jest.fn() }, JobRun: {}, Result },
      });

      expect(result.outcome).toBe('skipped');
      expect(result.skipReason).toBe('robots');
      expect(mockWriter.add).not.toHaveBeenCalled();
      expect(recordOutcomeFn).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'skipped',
          skipReason: 'robots',
          error: null,
        })
      );
    });

    it('marks duplicate write result as skipped with skipReason=duplicate', async () => {
      const mockRedis = {
        get: jest.fn(async () => '<html><body><h1>Duplicate Title</h1></body></html>'),
      };

      const mockWriter = {
        add: jest.fn(async () => 'duplicate'),
      };

      const recordOutcomeFn = jest.fn();

      const job = {
        data: {
          jobId: 'job_3',
          runId: 'run_3',
          userId: 'user_3',
          url: 'https://example.com/dup-page',
          selectors: { title: 'h1' },
        },
        attemptsMade: 0,
      };

      const result = await processScrapeJob(job, {
        redis: mockRedis,
        resultWriter: mockWriter,
        recordOutcomeFn,
        models: { Job: { findOneAndUpdate: jest.fn() }, JobRun: { findByIdAndUpdate: jest.fn() }, Result },
      });

      expect(result.outcome).toBe('skipped');
      expect(result.skipReason).toBe('duplicate');
      expect(recordOutcomeFn).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'skipped',
          skipReason: 'duplicate',
        })
      );
    });
  });
});
