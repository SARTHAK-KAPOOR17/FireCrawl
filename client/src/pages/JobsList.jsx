import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Plus,
  Play,
  RotateCw,
  ExternalLink,
  Trash2,
  Calendar,
  Globe,
  Layers,
} from 'lucide-react';

export default function JobsList() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [runningJobId, setRunningJobId] = useState(null);
  const [deleteModalJob, setDeleteModalJob] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const toast = useToast();
  const navigate = useNavigate();

  const fetchJobs = useCallback(async (targetPage = 1) => {
    setLoading(true);
    try {
      const response = await api.get(`/jobs?page=${targetPage}&limit=10`);
      setJobs(response.data?.jobs || []);
      setTotalPages(response.data?.totalPages || 1);
      setPage(response.data?.page || 1);
    } catch (err) {
      toast.error(err.friendlyMessage || 'Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchJobs(page);
  }, [page, fetchJobs]);

  const handleRunJob = async (jobId, forceRefresh = false) => {
    setRunningJobId(jobId);
    try {
      const response = await api.post(`/jobs/${jobId}/run`, { forceRefresh });
      toast.success(
        forceRefresh
          ? 'Run started with cache bypass (force refresh)!'
          : 'Scrape run queued successfully!'
      );
      // Refresh list to update status
      fetchJobs(page);
      if (response.data?.run?._id) {
        navigate(`/jobs/${jobId}`);
      }
    } catch (err) {
      toast.error(err.friendlyMessage || 'Failed to start job run');
    } finally {
      setRunningJobId(null);
    }
  };

  const handleDeleteJob = async () => {
    if (!deleteModalJob) return;
    setIsDeleting(true);
    try {
      await api.delete(`/jobs/${deleteModalJob._id}`);
      toast.success(`Job "${deleteModalJob.name}" deleted`);
      setDeleteModalJob(null);
      fetchJobs(page);
    } catch (err) {
      toast.error(err.friendlyMessage || 'Failed to delete job');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Scraping Jobs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your target URLs, extraction rules, and triggered runs.
          </p>
        </div>
        <Link to="/jobs/new">
          <Button variant="primary" className="shadow-sm">
            <Plus className="w-4 h-4" />
            Create Job
          </Button>
        </Link>
      </div>

      {/* Main Content */}
      {loading && jobs.length === 0 ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Create your first scraping job by specifying URLs and CSS selectors."
          action={
            <Link to="/jobs/new">
              <Button variant="primary">
                <Plus className="w-4 h-4 mr-2" />
                Create First Job
              </Button>
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">URLs</th>
                  <th className="px-6 py-3.5">Mode</th>
                  <th className="px-6 py-3.5">Created</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => {
                  const isOperating = runningJobId === job._id;
                  return (
                    <tr key={job._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        <Link
                          to={`/jobs/${job._id}`}
                          className="hover:text-brand-600 transition-colors flex items-center gap-2 group"
                        >
                          <span>{job.name}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Globe className="w-3.5 h-3.5 text-slate-400" />
                          {job.urls?.length || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-xs uppercase font-medium tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          <Layers className="w-3 h-3" />
                          {job.mode}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isOperating || job.status === 'running' || job.status === 'queued'}
                          loading={isOperating}
                          onClick={() => handleRunJob(job._id, false)}
                          title="Run job"
                        >
                          <Play className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                          <span className="hidden sm:inline">Run</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isOperating || job.status === 'running' || job.status === 'queued'}
                          onClick={() => handleRunJob(job._id, true)}
                          title="Run with force refresh (bypasses Redis HTML cache)"
                        >
                          <RotateCw className="w-3 h-3 text-blue-600" />
                          <span className="hidden sm:inline">Force</span>
                        </Button>

                        <Link to={`/jobs/${job._id}`}>
                          <Button variant="ghost" size="sm" title="View Results & Runs">
                            View
                          </Button>
                        </Link>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteModalJob(job)}
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          title="Delete job"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Page <strong className="text-slate-900">{page}</strong> of{' '}
                <strong className="text-slate-900">{totalPages}</strong>
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteModalJob)}
        onClose={() => setDeleteModalJob(null)}
        title="Delete Job"
        description="Are you sure you want to delete this job?"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteModalJob(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteJob} loading={isDeleting}>
              Delete Permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Deleting <strong className="text-slate-900">"{deleteModalJob?.name}"</strong> will
          permanently remove all of its associated results and run history. This action cannot be
          undone.
        </p>
      </Modal>
    </div>
  );
}
