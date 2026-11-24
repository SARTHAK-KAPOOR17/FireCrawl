import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRunProgress } from '../hooks/useRunProgress';
import * as SocketModule from '../context/SocketContext';
import api from '../api/axios';

describe('Phase 5: Client useRunProgress Realtime Hook', () => {
  let mockSocket;
  let socketEventHandlers;
  let mockApiGet;

  beforeEach(() => {
    vi.useRealTimers();
    socketEventHandlers = {};

    mockSocket = {
      on: vi.fn((event, handler) => {
        socketEventHandlers[event] = handler;
      }),
      off: vi.fn((event) => {
        delete socketEventHandlers[event];
      }),
      emit: vi.fn(),
    };

    mockApiGet = vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        run: {
          _id: 'run_init',
          jobId: 'job_123',
          status: 'running',
          pagesScraped: 5,
          pagesFailed: 1,
          pagesSkipped: 0,
          totalUrls: 20,
          cacheHits: 2,
        },
      },
    });

    vi.spyOn(SocketModule, 'useSocket').mockReturnValue({
      socket: mockSocket,
      isConnected: true,
      status: 'connected',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates progress and counters from run:progress event for matching jobId', async () => {
    const { result } = renderHook(() => useRunProgress('job_123'));

    await waitFor(() => {
      expect(result.current.scraped).toBe(5);
    });

    // Fire realtime progress event
    act(() => {
      socketEventHandlers['run:progress']?.({
        type: 'run:progress',
        jobId: 'job_123',
        runId: 'run_init',
        scraped: 12,
        failed: 1,
        skipped: 1,
        total: 20,
        cacheHits: 4,
      });
    });

    expect(result.current.scraped).toBe(12);
    expect(result.current.skipped).toBe(1);
    expect(result.current.cacheHits).toBe(4);
    // (12 + 1 + 1) / 20 = 14 / 20 = 70%
    expect(result.current.percent).toBe(70);
  });

  it('strictly ignores events when jobId does not match the active job', async () => {
    const { result } = renderHook(() => useRunProgress('job_123'));

    await waitFor(() => {
      expect(result.current.scraped).toBe(5);
    });

    act(() => {
      socketEventHandlers['run:progress']?.({
        type: 'run:progress',
        jobId: 'DIFFERENT_JOB_999',
        runId: 'run_other',
        scraped: 99,
        failed: 0,
        skipped: 0,
        total: 100,
      });
    });

    // Values remain unchanged
    expect(result.current.scraped).toBe(5);
    expect(result.current.total).toBe(20);
  });

  it('buffers page outcomes from page:batch and page:done events into recentPages', async () => {
    const { result } = renderHook(() => useRunProgress('job_123'));

    await waitFor(() => {
      expect(result.current.scraped).toBe(5);
    });

    act(() => {
      socketEventHandlers['page:batch']?.({
        type: 'page:batch',
        jobId: 'job_123',
        runId: 'run_init',
        pages: [
          { url: 'https://example.com/p1', outcome: 'scraped', cached: false },
          { url: 'https://example.com/p2', outcome: 'skipped', code: 'DUPLICATE', cached: true },
        ],
      });
    });

    expect(result.current.recentPages).toHaveLength(2);
    expect(result.current.recentPages[0].url).toBe('https://example.com/p1');
    expect(result.current.recentPages[1].code).toBe('DUPLICATE');

    // Single page:done event
    act(() => {
      socketEventHandlers['page:done']?.({
        type: 'page:done',
        jobId: 'job_123',
        runId: 'run_init',
        url: 'https://example.com/p3',
        outcome: 'failed',
        code: 'TIMEOUT',
      });
    });

    expect(result.current.recentPages).toHaveLength(3);
    expect(result.current.recentPages[2].outcome).toBe('failed');
  });

  it('calls onComplete when run:finished event is received', async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useRunProgress('job_123', { onComplete }));

    await waitFor(() => {
      expect(result.current.status).toBe('running');
    });

    act(() => {
      socketEventHandlers['run:finished']?.({
        type: 'run:finished',
        jobId: 'job_123',
        runId: 'run_init',
        status: 'completed',
        scraped: 20,
        failed: 0,
        skipped: 0,
        total: 20,
      });
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.isFinished).toBe(true);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'run:finished',
        status: 'completed',
        scraped: 20,
      })
    );
  });

  it('resyncs REST snapshot on socket reconnect', async () => {
    renderHook(() => useRunProgress('job_123'));

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });

    // Simulate socket reconnect event
    act(() => {
      socketEventHandlers['connect']?.();
    });

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });
  });

  it('falls back to polling when socket is disconnected', async () => {
    vi.useFakeTimers();

    vi.spyOn(SocketModule, 'useSocket').mockReturnValue({
      socket: mockSocket,
      isConnected: false,
      status: 'disconnected',
    });

    const { result } = renderHook(() =>
      useRunProgress('job_123', { pollIntervalMs: 2000 })
    );

    expect(result.current.isPolling).toBe(true);

    // Initial fetch
    await act(async () => {
      await Promise.resolve();
    });

    const initialFetchCount = mockApiGet.mock.calls.length;

    // Advance 2 seconds
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(initialFetchCount);

    vi.useRealTimers();
  });
});
