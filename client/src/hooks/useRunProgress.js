import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';
import { useSocket } from '../context/SocketContext';

/**
 * useRunProgress: Realtime progress tracking hook for an active job run.
 * - Subscribes to Socket.io events for the given jobId (run:started, run:progress, page:batch, page:done, run:finished)
 * - Tracks { status, scraped, failed, skipped, total, percent, recentPages, run }
 * - On connect and reconnect, fetches REST snapshot (/jobs/:id/runs/latest) to resync
 * - Automatically falls back to 2s polling when the socket is disconnected
 * - Stops polling when socket is connected or when run is finished
 * - Strictly ignores events for other jobs
 *
 * @param {string} jobId
 * @param {Object} [options]
 * @param {Object} [options.initialRun]
 * @param {Function} [options.onComplete]
 * @param {number} [options.pollIntervalMs=2000]
 */
export function useRunProgress(
  jobId,
  { initialRun = null, onComplete, pollIntervalMs = 2000 } = {}
) {
  const { socket, isConnected } = useSocket();

  const [run, setRun] = useState(initialRun);
  const [status, setStatus] = useState(initialRun?.status || 'idle');
  const [scraped, setScraped] = useState(initialRun?.pagesScraped || 0);
  const [failed, setFailed] = useState(initialRun?.pagesFailed || 0);
  const [skipped, setSkipped] = useState(initialRun?.pagesSkipped || 0);
  const [total, setTotal] = useState(initialRun?.totalUrls || 0);
  const [cacheHits, setCacheHits] = useState(initialRun?.cacheHits || 0);
  const [recentPages, setRecentPages] = useState([]);
  const [isPolling, setIsPolling] = useState(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const isFinished = status === 'completed' || status === 'failed';

  const calculatePercent = useCallback((s, f, sk, tot) => {
    if (!tot || tot <= 0) return 0;
    const processed = s + f + sk;
    return Math.min(100, Math.round((processed / tot) * 100));
  }, []);

  const percent = calculatePercent(scraped, failed, skipped, total);

  // REST snapshot fetch for initial sync and reconnect resync
  const fetchSnapshot = useCallback(async () => {
    if (!jobId) return null;
    try {
      const response = await api.get(`/jobs/${jobId}/runs/latest`);
      const latest = response.data?.run || null;
      if (latest) {
        setRun(latest);
        setStatus(latest.status || 'idle');
        setScraped(latest.pagesScraped || 0);
        setFailed(latest.pagesFailed || 0);
        setSkipped(latest.pagesSkipped || 0);
        setTotal(latest.totalUrls || 0);
        setCacheHits(latest.cacheHits || 0);

        if (latest.status === 'completed' || latest.status === 'failed') {
          if (onCompleteRef.current) {
            onCompleteRef.current(latest);
          }
        }
      }
      return latest;
    } catch {
      // Fallback to /jobs/:id/runs if latest endpoint fails
      try {
        const fallbackRes = await api.get(`/jobs/${jobId}/runs`);
        const latest = fallbackRes.data?.runs?.[0] || null;
        if (latest) {
          setRun(latest);
          setStatus(latest.status || 'idle');
          setScraped(latest.pagesScraped || 0);
          setFailed(latest.pagesFailed || 0);
          setSkipped(latest.pagesSkipped || 0);
          setTotal(latest.totalUrls || 0);
          setCacheHits(latest.cacheHits || 0);
          if (latest.status === 'completed' || latest.status === 'failed') {
            if (onCompleteRef.current) {
              onCompleteRef.current(latest);
            }
          }
        }
        return latest;
      } catch {
        return null;
      }
    }
  }, [jobId]);

  // Initial load sync
  useEffect(() => {
    if (jobId) {
      fetchSnapshot();
    }
  }, [jobId, fetchSnapshot]);

  // Sync on initialRun prop update
  useEffect(() => {
    if (initialRun) {
      setRun(initialRun);
      setStatus(initialRun.status || 'idle');
      setScraped(initialRun.pagesScraped || 0);
      setFailed(initialRun.pagesFailed || 0);
      setSkipped(initialRun.pagesSkipped || 0);
      setTotal(initialRun.totalUrls || 0);
      setCacheHits(initialRun.cacheHits || 0);
    }
  }, [initialRun]);

  // Realtime Socket listeners & Reconnect Resync
  useEffect(() => {
    if (!socket || !jobId) return;

    // Resync on reconnect
    const handleConnect = () => {
      fetchSnapshot();
    };

    socket.on('connect', handleConnect);

    // Event: run:started
    const handleRunStarted = (event) => {
      if (event.jobId !== jobId) return;
      setStatus('running');
      setTotal(event.totalUrls || 0);
      setScraped(0);
      setFailed(0);
      setSkipped(0);
      setCacheHits(0);
      setRecentPages([]);
    };

    // Event: run:progress
    const handleRunProgress = (event) => {
      if (event.jobId !== jobId) return;
      setStatus('running');
      if (typeof event.scraped === 'number') setScraped(event.scraped);
      if (typeof event.failed === 'number') setFailed(event.failed);
      if (typeof event.skipped === 'number') setSkipped(event.skipped);
      if (typeof event.total === 'number') setTotal(event.total);
      if (typeof event.cacheHits === 'number') setCacheHits(event.cacheHits);
    };

    // Event: page:done (single)
    const handlePageDone = (event) => {
      if (event.jobId !== jobId) return;
      setRecentPages((prev) => {
        const item = {
          url: event.url,
          outcome: event.outcome,
          code: event.code,
          cached: event.cached,
          ts: event.ts || Date.now(),
        };
        const updated = [...prev, item];
        return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
      });
    };

    // Event: page:batch (batched pages)
    const handlePageBatch = (event) => {
      if (event.jobId !== jobId || !Array.isArray(event.pages)) return;
      setRecentPages((prev) => {
        const newItems = event.pages.map((p) => ({
          url: p.url,
          outcome: p.outcome,
          code: p.code,
          cached: p.cached,
          ts: p.ts || event.ts || Date.now(),
        }));
        const updated = [...prev, ...newItems];
        return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
      });
    };

    // Event: run:finished
    const handleRunFinished = (event) => {
      if (event.jobId !== jobId) return;
      setStatus(event.status);
      if (typeof event.scraped === 'number') setScraped(event.scraped);
      if (typeof event.failed === 'number') setFailed(event.failed);
      if (typeof event.skipped === 'number') setSkipped(event.skipped);
      if (typeof event.total === 'number') setTotal(event.total);

      if (onCompleteRef.current) {
        onCompleteRef.current(event);
      }
    };

    socket.on('run:started', handleRunStarted);
    socket.on('run:progress', handleRunProgress);
    socket.on('page:done', handlePageDone);
    socket.on('page:batch', handlePageBatch);
    socket.on('run:finished', handleRunFinished);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('run:started', handleRunStarted);
      socket.off('run:progress', handleRunProgress);
      socket.off('page:done', handlePageDone);
      socket.off('page:batch', handlePageBatch);
      socket.off('run:finished', handleRunFinished);
    };
  }, [socket, jobId, fetchSnapshot]);

  // Fallback Polling: automatically active when disconnected and run is not finished
  useEffect(() => {
    if (isConnected || isFinished || !jobId) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);

    const intervalId = setInterval(async () => {
      if (document.hidden) return; // Pause polling when document is hidden
      const latest = await fetchSnapshot();
      if (latest && (latest.status === 'completed' || latest.status === 'failed')) {
        setIsPolling(false);
        clearInterval(intervalId);
      }
    }, pollIntervalMs);

    return () => {
      clearInterval(intervalId);
      setIsPolling(false);
    };
  }, [isConnected, isFinished, jobId, pollIntervalMs, fetchSnapshot]);

  return {
    run,
    status,
    scraped,
    failed,
    skipped,
    total,
    cacheHits,
    percent,
    recentPages,
    isFinished,
    isPolling,
    isConnected,
    refetch: fetchSnapshot,
    progress: percent, // For backwards compatibility with components reading `progress`
  };
}
