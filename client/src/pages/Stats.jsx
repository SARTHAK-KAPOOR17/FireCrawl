import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import {
  FileText,
  CheckCircle2,
  Zap,
  HardDrive,
  AlertTriangle,
  TrendingUp,
  BarChart2,
  Copy,
  ShieldAlert,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const response = await api.get('/stats');
        setStats(response.data?.stats || null);
      } catch (err) {
        toast.error(err.friendlyMessage || 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [toast]);

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const hasData = stats && (stats.totalRuns > 0 || stats.totalPagesScraped > 0);

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Platform Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Aggregated performance metrics across your scraping runs.
          </p>
        </div>
        <EmptyState
          icon={BarChart2}
          title="No scraping statistics yet"
          description="Execute your first scraping job to see live throughput, success rates, and caching KPIs."
        />
      </div>
    );
  }

  // Prepare failure reasons chart data
  const failureReasonsData = Object.entries(stats.failureReasons || {}).map(([code, count]) => ({
    name: code,
    count,
  }));

  // Format success rate and cache hit rate as percentages
  const successRatePct = (stats.successRate * 100).toFixed(1);
  const cacheHitRatePct = (stats.cacheHitRate * 100).toFixed(1);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Platform Analytics</h1>
        <p className="text-sm text-slate-500 mt-1">
          Real-time aggregated performance metrics across your scraping runs.
        </p>
      </div>

      {/* 4 Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1: Pages Scraped */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pages Scraped
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">
              {stats.totalPagesScraped.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Across {stats.totalRuns} total runs ({stats.totalJobs} jobs)
          </p>
        </Card>

        {/* KPI 2: Success Rate */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Success Rate
            </span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{successRatePct}%</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {stats.totalPagesFailed.toLocaleString()} total failed pages
          </p>
        </Card>

        {/* KPI 3: Avg Speed */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Avg Speed / Page
            </span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{stats.avgMsPerPage}</span>
            <span className="text-sm font-semibold text-slate-500">ms</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Mean processing latency per page</p>
        </Card>

        {/* KPI 4: Cache Hit Rate */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Cache Hit Rate
            </span>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <HardDrive className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{cacheHitRatePct}%</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Served directly from Redis HTML cache</p>
        </Card>
      </div>

      {/* Secondary Efficiency Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700">
            <Copy className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900">
              {stats.duplicatesSkipped.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Duplicate Contents Skipped by ResultWriter
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900">
              {stats.robotsBlocked.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 font-medium">
              URLs Blocked by robots.txt
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Pages Scraped Per Day */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0 pb-4">
            <CardTitle>Pages Scraped per Day</CardTitle>
            <CardDescription>Daily throughput over the last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stats.runsPerDay}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorPages" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(str) => str.slice(5)} // MM-DD
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#e2e8f0',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="pagesScraped"
                    stroke="#ea580c"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPages)"
                    name="Pages Scraped"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Chart 2: Failure Reasons Breakdown */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0 pb-4">
            <CardTitle>Failure Reasons Breakdown</CardTitle>
            <CardDescription>Distribution of terminal error codes</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {failureReasonsData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-2" />
                <p className="text-sm font-medium text-slate-600">Zero scraping failures</p>
                <p className="text-xs text-slate-400">All target URLs processed cleanly.</p>
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={failureReasonsData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      angle={-20}
                      textAnchor="end"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="#f43f5e"
                      radius={[4, 4, 0, 0]}
                      name="Failure Count"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
