import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { useRunProgress } from '../hooks/useRunProgress';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Play,
  RotateCw,
  Download,
  Trash2,
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  Database,
  Calendar,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

export default function JobDetail() {
  const { id: jobId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('results'); // 'results' | 'runs' | 'settings'

  // Results Tab State
  const [results, setResults] = useState([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsTotalPages, setResultsTotalPages] = useState(1);
  const [resultsSearch, setResultsSearch] = useState('');
  const [resultsSort, setResultsSort] = useState('desc');
  const [resultsLoading, setResultsLoading] = useState(false);

  // Runs Tab State
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState(null);

  // Job Actions State
  const [isOperating, setIsOperating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Live socket & polling progress hook for active runs
  const {
    run: activeRun,
    status: runStatus,
    scraped,
    failed,
    skipped,
    total,
    percent: progress,
    recentPages,
    isFinished,
    isPolling,
    isConnected,
    refetch: refetchActiveRun,
  } = useRunProgress(jobId, {
    onComplete: (finishedEvent) => {
      if (finishedEvent.status === 'completed') {
        toast.success(`Job run completed successfully!`);
      } else {
        toast.error(`Job run finished with status: ${finishedEvent.status || 'failed'}`);
      }
      fetchJob();
      fetchResults(1);
      fetchRuns();
    },
  });

  // Auto-scroll state for Live Log panel
  const liveLogContainerRef = React.useRef(null);
  const liveLogEndRef = React.useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const handleLogScroll = () => {
    const el = liveLogContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    setAutoScroll(isNearBottom);
  };

  useEffect(() => {
    if (autoScroll && liveLogEndRef.current) {
      liveLogEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [recentPages, autoScroll]);

  const fetchJob = useCallback(async () => {
    try {
      const response = await api.get(`/jobs/${jobId}`);
      setJob(response.data?.job || null);
    } catch (err) {
      toast.error(err.friendlyMessage || 'Failed to fetch job details');
    }
  }, [jobId, toast]);

  const fetchResults = useCallback(
    async (targetPage = 1, searchQuery = resultsSearch, sortOrder = resultsSort) => {
      setResultsLoading(true);
      try {
        const response = await api.get(
          `/jobs/${jobId}/results?page=${targetPage}&limit=20&search=${encodeURIComponent(
            searchQuery
          )}&sort=${sortOrder}`
        );
        setResults(response.data?.results || []);
        setResultsTotal(response.data?.total || 0);
        setResultsPage(response.data?.page || 1);
        setResultsTotalPages(response.data?.totalPages || 1);
      } catch (err) {
        toast.error(err.friendlyMessage || 'Failed to fetch results');
      } finally {
        setResultsLoading(false);
      }
    },
    [jobId, resultsSearch, resultsSort, toast]
  );

  const fetchRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const response = await api.get(`/jobs/${jobId}/runs`);
      setRuns(response.data?.runs || []);
    } catch (err) {
      toast.error(err.friendlyMessage || 'Failed to fetch job run history');
    } finally {
      setRunsLoading(false);
    }
  }, [jobId, toast]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchJob();
      await Promise.all([fetchResults(1), fetchRuns()]);
      setLoading(false);
    };
    init();
  }, [fetchJob, fetchResults, fetchRuns]);

  // Debounced search for results
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchResults(1, resultsSearch, resultsSort);
    }, 350);
    return () => clearTimeout(timer);
  }, [resultsSearch, resultsSort, fetchResults]);

  const handleRunJob = async (forceRefresh = false) => {
    setIsOperating(true);
    try {
      await api.post(`/jobs/${jobId}/run`, { forceRefresh });
      toast.success(
        forceRefresh
          ? 'Scrape run queued with cache bypass (force refresh)!'
          : 'Scrape run queued successfully!'
      );
      fetchJob();
      refetchActiveRun();
      fetchRuns();
    } catch (err) {
      toast.error(err.friendlyMessage || 'Failed to trigger run');
    } finally {
      setIsOperating(false);
    }
  };

  const handleDeleteJob = async () => {
    setIsDeleting(true);
    try {
      await api.delete(`/jobs/${jobId}`);
      toast.success('Job deleted successfully');
      navigate('/jobs');
    } catch (err) {
      toast.error(err.friendlyMessage || 'Failed to delete job');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = (format) => {
    const serverUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    const token = localStorage.getItem('token');
    const searchParam = resultsSearch ? `&search=${encodeURIComponent(resultsSearch)}` : '';
    const exportUrl = `${serverUrl}/jobs/${jobId}/results/export?format=${format}${searchParam}`;

    // Trigger download with auth token header using fetch or hidden anchor
    fetch(exportUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Export request failed');
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const ext = format === 'csv' ? 'csv' : 'json';
        a.download = `${(job?.name || 'job').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-results.${ext}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success(`Exported results as ${format.toUpperCase()}`);
      })
      .catch((err) => {
        toast.error('Failed to export results: ' + err.message);
      });
  };

  // Determine all selector data keys from job
  const selectorKeys = job?.selectors
    ? job.selectors instanceof Map
      ? Array.from(job.selectors.keys())
      : typeof job.selectors === 'object'
      ? Object.keys(job.selectors)
      : []
    : [];

  if (loading || !job) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const isJobRunning = job.status === 'running' || job.status === 'queued' || activeRun?.status === 'running';

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <Link
            to="/jobs"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Jobs
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{job.name}</h1>
            <StatusBadge status={activeRun?.status || job.status} />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={isOperating || isJobRunning}
            loading={isOperating}
            onClick={() => handleRunJob(false)}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Run
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isOperating || isJobRunning}
            onClick={() => handleRunJob(true)}
            title="Bypass Redis cache and force network fetch"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Force Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteModalOpen(true)}
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Live Run Progress Bar & Live Log Panel */}
      {(isJobRunning || recentPages.length > 0) && (
        <Card className="p-5 border-blue-200 bg-blue-50/30 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {isJobRunning ? (
                <Spinner size="sm" />
              ) : (
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              )}
              <span className="font-semibold text-blue-900">
                {isJobRunning ? 'Scrape run in progress...' : 'Latest Run Outcomes'}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  isConnected
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {isConnected ? 'Realtime (Socket.io)' : 'Polling Fallback'}
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-blue-800">
              {progress}% ({scraped + failed + skipped} / {total || activeRun?.totalUrls || 0} URLs)
            </span>
          </div>

          <div className="w-full bg-blue-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-brand-500 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center gap-4 text-xs font-medium text-slate-600 pt-1 border-t border-blue-100">
            <span className="text-emerald-700">Scraped: {scraped}</span>
            <span className="text-rose-700">Failed: {failed}</span>
            <span className="text-amber-700">Skipped: {skipped}</span>
            <span className="text-blue-700">Total: {total || activeRun?.totalUrls || 0}</span>
          </div>

          {/* Live Log Panel */}
          {recentPages.length > 0 && (
            <div className="mt-3 bg-slate-900 rounded-lg p-3 text-slate-100 font-mono text-xs shadow-inner">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">
                  Live Log ({recentPages.length} pages recorded)
                </span>
                <div className="flex items-center gap-2">
                  {!autoScroll && (
                    <button
                      onClick={() => {
                        setAutoScroll(true);
                        liveLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="text-amber-400 hover:text-amber-300 underline cursor-pointer"
                    >
                      Resume auto-scroll
                    </button>
                  )}
                  <span
                    className={`w-2 h-2 rounded-full ${
                      autoScroll ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span>{autoScroll ? 'Auto-scrolling' : 'Scroll paused'}</span>
                </div>
              </div>

              <div
                ref={liveLogContainerRef}
                onScroll={handleLogScroll}
                className="max-h-56 overflow-y-auto divide-y divide-slate-800/60 mt-2 space-y-1.5 pr-1"
              >
                {recentPages.map((pageItem, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 py-1 text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0 truncate">
                      {pageItem.outcome === 'scraped' && (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      {pageItem.outcome === 'skipped' && (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      {pageItem.outcome === 'failed' && (
                        <span className="w-3.5 h-3.5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                          ✕
                        </span>
                      )}
                      <span className="truncate text-slate-200" title={pageItem.url}>
                        {pageItem.url}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {pageItem.cached && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-sans font-medium">
                          Cached
                        </span>
                      )}
                      {pageItem.code && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-sans">
                          {pageItem.code}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">
                        {new Date(pageItem.ts).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={liveLogEndRef} />
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-8 -mb-px">
          <button
            onClick={() => setActiveTab('results')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'results'
                ? 'border-brand-500 text-brand-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Results ({resultsTotal})
          </button>
          <button
            onClick={() => setActiveTab('runs')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'runs'
                ? 'border-brand-500 text-brand-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Run History ({runs.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-brand-500 text-brand-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Job Configuration
          </button>
        </nav>
      </div>

      {/* TAB A: RESULTS */}
      {activeTab === 'results' && (
        <div className="space-y-4">
          {/* Controls: Search & Export */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={resultsSearch}
                onChange={(e) => setResultsSearch(e.target.value)}
                placeholder="Search URL or data..."
                className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('csv')}
                disabled={resultsTotal === 0}
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('json')}
                disabled={resultsTotal === 0}
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Export JSON
              </Button>
            </div>
          </div>

          {/* Results Table */}
          {resultsLoading && results.length === 0 ? (
            <div className="py-16 flex justify-center">
              <Spinner size="md" />
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              title="No results found"
              description={
                resultsSearch
                  ? 'No results match your search query.'
                  : 'Run this job to start extracting data.'
              }
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Target URL</th>
                      {selectorKeys.map((key) => (
                        <th key={key} className="px-6 py-3.5">
                          {key}
                        </th>
                      ))}
                      <th className="px-6 py-3.5">Scraped At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.map((res) => (
                      <tr key={res._id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-slate-700 max-w-xs truncate" title={res.url}>
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-brand-600 hover:underline"
                          >
                            {res.url}
                          </a>
                        </td>
                        {selectorKeys.map((key) => {
                          const val = res.data?.[key];
                          return (
                            <td key={key} className="px-6 py-4 text-slate-900 max-w-sm truncate" title={String(val || '')}>
                              {val !== null && val !== undefined ? String(val) : <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                          {res.scrapedAt ? new Date(res.scrapedAt).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Results Pagination */}
              {resultsTotalPages > 1 && (
                <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Showing page <strong className="text-slate-900">{resultsPage}</strong> of{' '}
                    <strong className="text-slate-900">{resultsTotalPages}</strong>
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resultsPage <= 1}
                      onClick={() => fetchResults(resultsPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resultsPage >= resultsTotalPages}
                      onClick={() => fetchResults(resultsPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* TAB B: RUNS */}
      {activeTab === 'runs' && (
        <div className="space-y-4">
          {runsLoading ? (
            <div className="py-16 flex justify-center">
              <Spinner size="md" />
            </div>
          ) : runs.length === 0 ? (
            <EmptyState
              title="No run history"
              description="This job hasn't been executed yet. Click 'Run' to trigger its first scrape."
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="w-8 px-4 py-3.5"></th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Started</th>
                      <th className="px-6 py-3.5">Duration</th>
                      <th className="px-6 py-3.5">Scraped / Total</th>
                      <th className="px-6 py-3.5">Skipped / Duplicates</th>
                      <th className="px-6 py-3.5">Robots Blocked</th>
                      <th className="px-6 py-3.5">Cache Hits</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {runs.map((r) => {
                      const isExpanded = expandedRunId === r._id;
                      const hasFailures = (r.failedUrls?.length > 0) || (r.failureReasons && Object.keys(r.failureReasons).length > 0);

                      return (
                        <React.Fragment key={r._id}>
                          <tr
                            className={`hover:bg-slate-50/70 transition-colors cursor-pointer ${
                              isExpanded ? 'bg-slate-50/90' : ''
                            }`}
                            onClick={() => setExpandedRunId(isExpanded ? null : r._id)}
                          >
                            <td className="px-4 py-4 text-slate-400">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <StatusBadge status={r.status} />
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-600 whitespace-nowrap">
                              {r.startedAt ? new Date(r.startedAt).toLocaleString() : '—'}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-600">
                              {r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
                            </td>
                            <td className="px-6 py-4 text-slate-900 font-medium">
                              <span className="text-emerald-600">{r.pagesScraped || 0}</span> /{' '}
                              {r.totalUrls || 0}
                              {r.pagesFailed > 0 && (
                                <span className="text-rose-600 text-xs ml-1.5 font-bold">
                                  ({r.pagesFailed} failed)
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600 text-xs">
                              {r.pagesSkipped || 0}{' '}
                              {r.duplicatesSkipped > 0 && (
                                <span className="text-slate-400 font-medium">
                                  ({r.duplicatesSkipped} dup)
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-slate-600 text-xs">
                              {r.robotsBlocked || 0}
                            </td>
                            <td className="px-6 py-4 text-blue-600 font-medium text-xs">
                              {r.cacheHits || 0}
                            </td>
                          </tr>

                          {/* Expandable details row for failures */}
                          {isExpanded && (
                            <tr className="bg-slate-50/90 border-b border-slate-200/80">
                              <td colSpan={8} className="px-8 py-5 space-y-4">
                                <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                                  Run Diagnostics ({r._id})
                                </h4>

                                {r.failureReasons && Object.keys(r.failureReasons).length > 0 && (
                                  <div>
                                    <h5 className="text-xs font-medium text-slate-700 mb-1.5">
                                      Failure Reasons Breakdown:
                                    </h5>
                                    <div className="flex flex-wrap gap-2">
                                      {Object.entries(r.failureReasons).map(([code, count]) => (
                                        <span
                                          key={code}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-100 text-rose-800 font-mono text-xs"
                                        >
                                          <strong>{code}:</strong> {count}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {r.failedUrls && r.failedUrls.length > 0 ? (
                                  <div>
                                    <h5 className="text-xs font-medium text-slate-700 mb-1.5">
                                      Failed URLs (capped at last 50):
                                    </h5>
                                    <div className="max-h-48 overflow-y-auto rounded border border-slate-200 bg-white p-2 space-y-1.5 text-xs font-mono">
                                      {r.failedUrls.map((fu, idx) => (
                                        <div key={idx} className="flex items-start gap-2 text-slate-700">
                                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                                          <span className="font-semibold text-rose-600">[{fu.code}]</span>
                                          <span className="truncate flex-1">{fu.url}</span>
                                          <span className="text-slate-400 truncate max-w-xs">{fu.message}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-xs text-emerald-700">
                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    No terminal failures recorded for this run.
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB C: SETTINGS */}
      {activeTab === 'settings' && (
        <Card className="p-6 space-y-6">
          <div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Configuration</h3>
            <p className="text-sm text-slate-500">Read-only job settings and extraction rules.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Extraction Selectors
              </h4>
              <div className="bg-slate-50 rounded-lg border border-slate-200/80 p-3 space-y-1.5 font-mono text-xs">
                {selectorKeys.map((key) => (
                  <div key={key} className="flex justify-between py-1 border-b border-slate-200/50 last:border-0">
                    <span className="font-bold text-slate-800">{key}:</span>
                    <span className="text-slate-600">{job.selectors?.[key]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Target URLs ({job.urls?.length || 0})
              </h4>
              <div className="bg-slate-50 rounded-lg border border-slate-200/80 p-3 max-h-60 overflow-y-auto space-y-1 font-mono text-xs">
                {job.urls?.map((url, i) => (
                  <div key={i} className="truncate text-slate-700 hover:text-brand-600">
                    {url}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Job"
        description="Are you sure you want to delete this job?"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteJob} loading={isDeleting}>
              Delete Permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Deleting <strong className="text-slate-900">"{job.name}"</strong> will permanently
          remove its results, run history, and configuration.
        </p>
      </Modal>
    </div>
  );
}
