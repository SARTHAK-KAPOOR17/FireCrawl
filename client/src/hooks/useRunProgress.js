import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';

/**
 * Polls the latest run for a job every 2s while queued or running,
 * pausing when the document is hidden and stopping on completion.
 * @param {string} jobId
 * @param {Object} [options]
 * @param {Object} [options.initialRun]
 * @param {Function} [options.onComplete]
 * @param {number} [options.pollIntervalMs=2000]
 * @returns {Object} { run, progress, isFinished, isPolling, refetch }
 */
export function useRunProgress(
  jobId,
  { initialRun = null, onComplete, pollIntervalMs = 2000 } = {}
) {
  const [run, setRun] = useState(initialRun);
  const [isPolling, setIsPolling] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const isFinished = run?.status === 'completed' || run?.status === 'failed';

  const calculateProgress = useCallback((currentRun) => {
    if (!currentRun || !currentRun.totalUrls) return 0;
    const processed =
      (currentRun.pagesScraped || 0) +
      (currentRun.pagesFailed || 0) +
      (currentRun.pagesSkipped || 0);
    return Math.min(100, Math.round((processed / currentRun.totalUrls) * 100));
  }, []);

  const fetchLatestRun = useCallback(async () => {
    if (!jobId) return null;
    try {
      const response = await api.get(`/jobs/${jobId}/runs`);
      const runs = response.data?.runs || [];
      const latest = runs[0] || null;
      if (latest) {
        setRun(latest);
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
  }, [jobId]);

  useEffect(() => {
    if (initialRun) {
      setRun(initialRun);
    }
  }, [initialRun]);

  useEffect(() => {
    if (!jobId || isFinished) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    let intervalId = null;

    const tick = async () => {
      if (document.hidden) return; // Skip polling when page is not visible
      const latest = await fetchLatestRun();
      if (latest && (latest.status === 'completed' || latest.status === 'failed')) {
        if (intervalId) clearInterval(intervalId);
        setIsPolling(false);
      }
    };

    intervalId = setInterval(tick, pollIntervalMs);

    const handleVisibilityChange = () => {
      if (!document.hidden && !isFinished) {
        tick();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setIsPolling(false);
    };
  }, [jobId, isFinished, fetchLatestRun, pollIntervalMs]);

  const progress = calculateProgress(run);

  return {
    run,
    progress,
    isFinished,
    isPolling,
    refetch: fetchLatestRun,
  };
}
