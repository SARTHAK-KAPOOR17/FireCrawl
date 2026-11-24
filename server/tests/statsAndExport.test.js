import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { Job, JobRun, Result, NotFoundError } from '@scraper/shared';
import { getUserStats } from '../src/modules/stats/stats.service.js';
import { exportJobResults, sanitizeCsvCell } from '../src/modules/jobs/jobs.service.js';

describe('Stats and Export Integration Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Stats Aggregation (getUserStats)', () => {
    it('returns zero defaults cleanly when user has no jobs or runs (guards against division by zero)', async () => {
      const mockUserId = new mongoose.Types.ObjectId();

      jest.spyOn(Job, 'countDocuments').mockResolvedValue(0);
      jest.spyOn(JobRun, 'aggregate').mockImplementation(async (pipeline) => {
        // pipeline 1: stats summary
        if (pipeline[1]?.$group?._id === null) {
          return [];
        }
        // pipeline 2: runsPerDay
        if (pipeline[1]?.$group?._id?.$dateToString) {
          return [];
        }
        // pipeline 3: failureReasons
        return [];
      });

      const stats = await getUserStats({ userId: mockUserId });

      expect(stats.totalJobs).toBe(0);
      expect(stats.totalRuns).toBe(0);
      expect(stats.totalPagesScraped).toBe(0);
      expect(stats.totalPagesFailed).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.avgMsPerPage).toBe(0);
      expect(stats.cacheHitRate).toBe(0);
      expect(stats.duplicatesSkipped).toBe(0);
      expect(stats.robotsBlocked).toBe(0);
      expect(stats.failureReasons).toEqual({});
      expect(stats.runsPerDay).toHaveLength(14);
      expect(stats.runsPerDay[0]).toEqual(
        expect.objectContaining({
          runs: 0,
          pagesScraped: 0,
        })
      );
    });

    it('aggregates metrics correctly and calculates rates without division by zero', async () => {
      const mockUserId = new mongoose.Types.ObjectId();

      jest.spyOn(Job, 'countDocuments').mockResolvedValue(3);
      jest.spyOn(JobRun, 'aggregate').mockImplementation(async (pipeline) => {
        // pipeline 1: summary
        if (pipeline[1]?.$group?._id === null) {
          return [
            {
              totalRuns: 5,
              totalPagesScraped: 80,
              totalPagesFailed: 20,
              totalPagesSkipped: 10,
              totalCacheHits: 30,
              duplicatesSkipped: 7,
              robotsBlocked: 3,
              totalDurationMs: 40000,
            },
          ];
        }
        // pipeline 2: runsPerDay
        if (pipeline[1]?.$group?._id?.$dateToString) {
          return [
            {
              _id: new Date().toISOString().slice(0, 10),
              runs: 2,
              pagesScraped: 40,
            },
          ];
        }
        // pipeline 3: failureReasons
        return [
          { _id: 'TIMEOUT_ERROR', count: 12 },
          { _id: 'HTTP_STATUS_ERROR', count: 8 },
        ];
      });

      const stats = await getUserStats({ userId: mockUserId });

      expect(stats.totalJobs).toBe(3);
      expect(stats.totalRuns).toBe(5);
      expect(stats.totalPagesScraped).toBe(80);
      expect(stats.totalPagesFailed).toBe(20);
      // successRate = 80 / (80 + 20) = 0.8
      expect(stats.successRate).toBe(0.8);
      // avgMsPerPage = 40000 / 80 = 500ms
      expect(stats.avgMsPerPage).toBe(500);
      // totalProcessed = 80 + 20 + 10 = 110, cacheHitRate = 30 / 110 ≈ 0.2727
      expect(stats.cacheHitRate).toBe(0.2727);
      expect(stats.duplicatesSkipped).toBe(7);
      expect(stats.robotsBlocked).toBe(3);
      expect(stats.failureReasons).toEqual({
        TIMEOUT_ERROR: 12,
        HTTP_STATUS_ERROR: 8,
      });
      expect(stats.runsPerDay).toHaveLength(14);
    });
  });

  describe('2. sanitizeCsvCell & Formula Injection Neutralization', () => {
    it('neutralizes CSV formula injection by prefixing =, +, -, @ with a single quote', () => {
      expect(sanitizeCsvCell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
      expect(sanitizeCsvCell('+12345')).toBe("'+12345");
      expect(sanitizeCsvCell('-50')).toBe("'-50");
      expect(sanitizeCsvCell('@SUM(1,2)')).toBe(`"'@SUM(1,2)"`);
      expect(sanitizeCsvCell('\tmalicious')).toBe("'\tmalicious");
    });

    it('escapes quotes by doubling them and quotes strings containing commas, quotes, or newlines', () => {
      expect(sanitizeCsvCell('Hello, World')).toBe('"Hello, World"');
      expect(sanitizeCsvCell('Hello "World"')).toBe('"Hello ""World"""');
      expect(sanitizeCsvCell('Line1\nLine2')).toBe('"Line1\nLine2"');
      expect(sanitizeCsvCell('Safe Text')).toBe('Safe Text');
      expect(sanitizeCsvCell(123)).toBe('123');
      expect(sanitizeCsvCell(null)).toBe('');
      expect(sanitizeCsvCell(undefined)).toBe('');
    });
  });

  describe('3. Results Export Streaming Endpoint (exportJobResults)', () => {
    const mockUserId = new mongoose.Types.ObjectId();
    const mockJobId = new mongoose.Types.ObjectId();

    const mockJob = {
      _id: mockJobId,
      userId: mockUserId,
      name: 'Test Export Job',
      selectors: new Map([
        ['title', 'h1'],
        ['price', '.price'],
      ]),
    };

    function createMockResponse() {
      const chunks = [];
      const headers = {};
      return {
        headers,
        setHeader: jest.fn((k, v) => {
          headers[k] = v;
        }),
        write: jest.fn((data) => {
          chunks.push(data);
        }),
        end: jest.fn(),
        getOutput: () => chunks.join(''),
      };
    }

    it('throws NotFoundError (404) when job does not exist or belongs to another user', async () => {
      jest.spyOn(Job, 'findOne').mockResolvedValue(null);
      const res = createMockResponse();

      await expect(
        exportJobResults({
          jobId: mockJobId,
          userId: mockUserId,
          format: 'csv',
          res,
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('streams CSV results with headers and formula-sanitized values', async () => {
      jest.spyOn(Job, 'findOne').mockResolvedValue(mockJob);

      const mockDocs = [
        {
          url: 'https://example.com/1',
          data: { title: 'First Book', price: '£25.00' },
          scrapedAt: new Date('2026-01-01T10:00:00Z'),
        },
        {
          url: 'https://example.com/2',
          data: { title: '=cmd|calc', price: '+99.00' }, // Formula injection attempts
          scrapedAt: new Date('2026-01-01T10:05:00Z'),
        },
      ];

      // Async iterable cursor simulation
      async function* mockCursor() {
        for (const doc of mockDocs) {
          yield doc;
        }
      }

      jest.spyOn(Result, 'aggregate').mockResolvedValue([]);
      jest.spyOn(Result, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            cursor: mockCursor,
          }),
        }),
      });

      const res = createMockResponse();

      await exportJobResults({
        jobId: mockJobId,
        userId: mockUserId,
        format: 'csv',
        res,
      });

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="test_export_job-results.csv"'
      );
      expect(res.end).toHaveBeenCalled();

      const output = res.getOutput();
      expect(output).toContain('url,scrapedAt,title,price\n');
      expect(output).toContain('https://example.com/1');
      expect(output).toContain('First Book');
      expect(output).toContain("'=cmd|calc"); // Sanitized
      expect(output).toContain("'+99.00"); // Sanitized
    });

    it('streams JSON array results with correct content type', async () => {
      jest.spyOn(Job, 'findOne').mockResolvedValue(mockJob);

      const mockDocs = [
        {
          url: 'https://example.com/json-1',
          data: { title: 'JSON Book' },
          scrapedAt: '2026-01-01T10:00:00Z',
        },
      ];

      async function* mockCursor() {
        for (const doc of mockDocs) {
          yield doc;
        }
      }

      jest.spyOn(Result, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            cursor: mockCursor,
          }),
        }),
      });

      const res = createMockResponse();

      await exportJobResults({
        jobId: mockJobId,
        userId: mockUserId,
        format: 'json',
        res,
      });

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="test_export_job-results.json"'
      );
      expect(res.end).toHaveBeenCalled();

      const output = res.getOutput();
      expect(output.startsWith('[\n')).toBe(true);
      expect(output.endsWith('\n]\n')).toBe(true);
      expect(output).toContain('JSON Book');
    });
  });
});
