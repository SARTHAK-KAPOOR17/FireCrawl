import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { UnrecoverableError } from 'bullmq';
import {
  ErrorCodes,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  NetworkError,
  TimeoutError,
  HttpStatusError,
  ParseError,
  NoDataExtractedError,
  RobotsDisallowedError,
  InvalidUrlError,
  RateLimitWaitTimeoutError,
  SsrfBlockedError,
  normalizeError,
} from '@scraper/shared';
import { errorHandler } from '../src/exceptions/errorHandler.js';
import { applyRetryPolicy } from '../../worker/src/exceptions/retryPolicy.js';
import { recordOutcomeAndFinalizeRun } from '../../worker/src/services/runTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const mockResponse = () => {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((data) => {
    res.body = data;
    return res;
  });
  return res;
};

describe('Exceptions & Error Handling Spec', () => {
  describe('Error Class Properties and Retryable Flags', () => {
    it('verifies base AppError defaults', () => {
      const err = new AppError('Something happened');
      expect(err.name).toBe('AppError');
      expect(err.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(err.statusCode).toBe(500);
      expect(err.isOperational).toBe(true);
      expect(err.retryable).toBe(false);
      expect(err.details).toBeNull();
      expect(err.stack).toBeDefined();
    });

    it('verifies HTTP error classes', () => {
      const v = new ValidationError('Bad input', [{ field: 'email' }]);
      expect(v.statusCode).toBe(400);
      expect(v.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(v.retryable).toBe(false);
      expect(v.details).toEqual([{ field: 'email' }]);

      const auth = new AuthenticationError();
      expect(auth.statusCode).toBe(401);
      expect(auth.code).toBe(ErrorCodes.AUTHENTICATION_ERROR);
      expect(auth.retryable).toBe(false);

      const forbidden = new AuthorizationError();
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.code).toBe(ErrorCodes.AUTHORIZATION_ERROR);
      expect(forbidden.retryable).toBe(false);

      const nf = new NotFoundError();
      expect(nf.statusCode).toBe(404);
      expect(nf.code).toBe(ErrorCodes.NOT_FOUND);
      expect(nf.retryable).toBe(false);

      const conf = new ConflictError();
      expect(conf.statusCode).toBe(409);
      expect(conf.code).toBe(ErrorCodes.CONFLICT);
      expect(conf.retryable).toBe(false);

      const rl = new RateLimitError();
      expect(rl.statusCode).toBe(429);
      expect(rl.code).toBe(ErrorCodes.RATE_LIMIT_EXCEEDED);
      expect(rl.retryable).toBe(false);
    });

    it('verifies Scrape error classes and retryable flags', () => {
      const net = new NetworkError();
      expect(net.statusCode).toBe(502);
      expect(net.retryable).toBe(true);

      const timeout = new TimeoutError();
      expect(timeout.statusCode).toBe(504);
      expect(timeout.retryable).toBe(true);

      const http500 = new HttpStatusError(500);
      expect(http500.retryable).toBe(true);
      const http503 = new HttpStatusError(503);
      expect(http503.retryable).toBe(true);
      const http429 = new HttpStatusError(429);
      expect(http429.retryable).toBe(true);

      const http404 = new HttpStatusError(404);
      expect(http404.retryable).toBe(false);
      const http403 = new HttpStatusError(403);
      expect(http403.retryable).toBe(false);

      const parse = new ParseError();
      expect(parse.statusCode).toBe(422);
      expect(parse.retryable).toBe(false);

      const noData = new NoDataExtractedError();
      expect(noData.statusCode).toBe(422);
      expect(noData.retryable).toBe(false);

      const robots = new RobotsDisallowedError();
      expect(robots.statusCode).toBe(403);
      expect(robots.retryable).toBe(false);

      const invalidUrl = new InvalidUrlError();
      expect(invalidUrl.statusCode).toBe(400);
      expect(invalidUrl.retryable).toBe(false);

      const rlTimeout = new RateLimitWaitTimeoutError();
      expect(rlTimeout.statusCode).toBe(504);
      expect(rlTimeout.retryable).toBe(true);

      const ssrf = new SsrfBlockedError();
      expect(ssrf.statusCode).toBe(403);
      expect(ssrf.retryable).toBe(false);
    });
  });

  describe('normalizeError Mappings', () => {
    it('returns AppError instances unchanged', () => {
      const original = new NotFoundError('Job missing');
      expect(normalizeError(original)).toBe(original);
    });

    it('maps Axios timeout error to TimeoutError', () => {
      const axiosErr = {
        isAxiosError: true,
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded',
      };
      const normalized = normalizeError(axiosErr);
      expect(normalized).toBeInstanceOf(TimeoutError);
      expect(normalized.retryable).toBe(true);
    });

    it('maps Axios status error to HttpStatusError', () => {
      const axiosErr = {
        isAxiosError: true,
        response: { status: 503, data: 'Service Unavailable' },
      };
      const normalized = normalizeError(axiosErr);
      expect(normalized).toBeInstanceOf(HttpStatusError);
      expect(normalized.statusCode).toBe(503);
      expect(normalized.retryable).toBe(true);
    });

    it('maps Axios network failure to NetworkError', () => {
      const axiosErr = {
        isAxiosError: true,
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND',
      };
      const normalized = normalizeError(axiosErr);
      expect(normalized).toBeInstanceOf(NetworkError);
      expect(normalized.retryable).toBe(true);
    });

    it('maps Mongoose duplicate key (code 11000) to ConflictError', () => {
      const mongoErr = {
        code: 11000,
        keyPattern: { jobId: 1, contentHash: 1 },
      };
      const normalized = normalizeError(mongoErr);
      expect(normalized).toBeInstanceOf(ConflictError);
      expect(normalized.statusCode).toBe(409);
    });

    it('maps Mongoose ValidationError to ValidationError with field details', () => {
      const mongoErr = {
        name: 'ValidationError',
        errors: {
          name: { message: 'Path `name` is required.' },
        },
      };
      const normalized = normalizeError(mongoErr);
      expect(normalized).toBeInstanceOf(ValidationError);
      expect(normalized.statusCode).toBe(400);
      expect(normalized.details[0].field).toBe('name');
    });

    it('maps JWT errors to AuthenticationError', () => {
      const jwtErr = {
        name: 'TokenExpiredError',
        message: 'jwt expired',
      };
      const normalized = normalizeError(jwtErr);
      expect(normalized).toBeInstanceOf(AuthenticationError);
      expect(normalized.statusCode).toBe(401);
    });

    it('maps ZodError to ValidationError with field paths', () => {
      const zodErr = {
        name: 'ZodError',
        errors: [
          { path: ['urls', 0], message: 'Must be a valid URL' },
          { path: ['name'], message: 'Name is required' },
        ],
      };
      const normalized = normalizeError(zodErr);
      expect(normalized).toBeInstanceOf(ValidationError);
      expect(normalized.statusCode).toBe(400);
      expect(normalized.details).toEqual([
        { field: 'urls.0', message: 'Must be a valid URL' },
        { field: 'name', message: 'Name is required' },
      ]);
    });

    it('maps unknown native Error to non-operational AppError', () => {
      const raw = new TypeError('Cannot read property of undefined');
      const normalized = normalizeError(raw);
      expect(normalized).toBeInstanceOf(AppError);
      expect(normalized.isOperational).toBe(false);
      expect(normalized.statusCode).toBe(500);
    });
  });

  describe('Central errorHandler Output Shape', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('outputs details and operational errors correctly in development', () => {
      process.env.NODE_ENV = 'development';
      const req = { id: 'req_123', originalUrl: '/test' };
      const res = mockResponse();
      const err = new ValidationError('Bad request parameters', [{ field: 'name' }]);

      errorHandler(err, req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body).toEqual({
        success: false,
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Bad request parameters',
        details: [{ field: 'name' }],
        stack: expect.any(String),
      });
    });

    it('does not leak internal messages or stack traces for non-operational errors in production', () => {
      process.env.NODE_ENV = 'production';
      const req = { id: 'req_456', originalUrl: '/test' };
      const res = mockResponse();
      const rawSecretErr = new Error('Database connection failed with password secret_pw');

      errorHandler(rawSecretErr, req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.body).toEqual({
        success: false,
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Internal server error',
      });
      expect(res.body.stack).toBeUndefined();
      expect(res.body.message).not.toContain('secret_pw');
    });
  });

  describe('Worker Retry Policy', () => {
    it('throws BullMQ UnrecoverableError for non-retryable errors to skip retries', () => {
      const nonRetryableErr = new NoDataExtractedError();
      expect(() => applyRetryPolicy(nonRetryableErr)).toThrow(UnrecoverableError);
    });

    it('rethrows retryable errors as-is for exponential backoff', () => {
      const retryableErr = new NetworkError('Connection reset');
      expect(() => applyRetryPolicy(retryableErr)).toThrow(NetworkError);
    });
  });

  describe('JobRun failureReasons and failedUrls Tracking', () => {
    it('records failureReasons and failedUrls atomically on terminal failure', async () => {
      const mockJobRun = {
        _id: 'run_fail_1',
        totalUrls: 2,
        status: 'running',
        pagesScraped: 0,
        pagesFailed: 0,
        pagesSkipped: 0,
        failureReasons: new Map(),
        failedUrls: [],
      };

      const mockModels = {
        JobRun: {
          findByIdAndUpdate: jest.fn(async (id, update) => {
            if (update.$inc) {
              for (const [k, v] of Object.entries(update.$inc)) {
                if (k.startsWith('failureReasons.')) {
                  const code = k.split('.')[1];
                  mockJobRun.failureReasons.set(code, (mockJobRun.failureReasons.get(code) || 0) + v);
                } else {
                  mockJobRun[k] = (mockJobRun[k] || 0) + v;
                }
              }
            }
            if (update.$push?.failedUrls?.$each) {
              mockJobRun.failedUrls.push(...update.$push.failedUrls.$each);
            }
            return mockJobRun;
          }),
          findOneAndUpdate: jest.fn(async () => mockJobRun),
        },
        Job: {
          findByIdAndUpdate: jest.fn(),
        },
      };

      const failure = new NoDataExtractedError('Empty page content');

      await recordOutcomeAndFinalizeRun({
        jobId: 'job_fail_1',
        runId: 'run_fail_1',
        url: 'https://example.com/empty-book',
        outcome: 'failed',
        error: failure,
        models: mockModels,
      });

      expect(mockJobRun.pagesFailed).toBe(1);
      expect(mockJobRun.failureReasons.get('NO_DATA_EXTRACTED')).toBe(1);
      expect(mockJobRun.failedUrls).toHaveLength(1);
      expect(mockJobRun.failedUrls[0]).toEqual({
        url: 'https://example.com/empty-book',
        code: 'NO_DATA_EXTRACTED',
        message: 'Empty page content',
      });
    });
  });

  describe('Codebase Rule: No inline new Error outside exceptions folders', () => {
    function scanDir(dir, fileList = []) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Exclude node_modules, .git, tests, and exceptions folders
          if (
            entry.name !== 'node_modules' &&
            entry.name !== '.git' &&
            entry.name !== 'tests' &&
            entry.name !== 'exceptions'
          ) {
            scanDir(fullPath, fileList);
          }
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          fileList.push(fullPath);
        }
      }
      return fileList;
    }

    it('ensures no inline "new Error(" exists in server, worker, or shared source code', () => {
      const srcFolders = [
        path.join(rootDir, 'server', 'src'),
        path.join(rootDir, 'worker', 'src'),
        path.join(rootDir, 'shared', 'src'),
      ];

      const violations = [];

      for (const folder of srcFolders) {
        if (fs.existsSync(folder)) {
          const files = scanDir(folder);
          for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
              if (line.includes('new Error(') && !line.trim().startsWith('//')) {
                violations.push(`${path.relative(rootDir, file)}:${idx + 1} -> ${line.trim()}`);
              }
            });
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });
});
