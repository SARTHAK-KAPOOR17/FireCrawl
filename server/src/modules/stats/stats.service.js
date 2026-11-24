import mongoose from 'mongoose';
import { Job, JobRun } from '@scraper/shared';

/**
 * Aggregates user stats across Job and JobRun collections using MongoDB pipelines
 * @param {Object} options
 * @param {string|mongoose.Types.ObjectId} options.userId
 * @returns {Promise<Object>}
 */
export async function getUserStats({ userId }) {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [totalJobs, statsAgg, runsPerDayAgg, failureReasonsAgg] = await Promise.all([
    Job.countDocuments({ userId: userObjectId }),
    JobRun.aggregate([
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: null,
          totalRuns: { $sum: 1 },
          totalPagesScraped: { $sum: '$pagesScraped' },
          totalPagesFailed: { $sum: '$pagesFailed' },
          totalPagesSkipped: { $sum: '$pagesSkipped' },
          totalCacheHits: { $sum: '$cacheHits' },
          duplicatesSkipped: { $sum: '$duplicatesSkipped' },
          robotsBlocked: { $sum: '$robotsBlocked' },
          totalDurationMs: {
            $sum: {
              $cond: [{ $gt: ['$durationMs', 0] }, '$durationMs', 0],
            },
          },
        },
      },
    ]),
    (async () => {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 13);
      fourteenDaysAgo.setUTCHours(0, 0, 0, 0);

      return await JobRun.aggregate([
        {
          $match: {
            userId: userObjectId,
            startedAt: { $gte: fourteenDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$startedAt' },
            },
            runs: { $sum: 1 },
            pagesScraped: { $sum: '$pagesScraped' },
          },
        },
        { $sort: { _id: 1 } },
      ]);
    })(),
    JobRun.aggregate([
      { $match: { userId: userObjectId } },
      { $project: { failureReasonsArray: { $objectToArray: '$failureReasons' } } },
      { $unwind: '$failureReasonsArray' },
      {
        $group: {
          _id: '$failureReasonsArray.k',
          count: { $sum: '$failureReasonsArray.v' },
        },
      },
    ]),
  ]);

  const summary = statsAgg[0] || {};
  const totalRuns = summary.totalRuns || 0;
  const totalPagesScraped = summary.totalPagesScraped || 0;
  const totalPagesFailed = summary.totalPagesFailed || 0;
  const totalPagesSkipped = summary.totalPagesSkipped || 0;
  const totalCacheHits = summary.totalCacheHits || 0;
  const duplicatesSkipped = summary.duplicatesSkipped || 0;
  const robotsBlocked = summary.robotsBlocked || 0;
  const totalDurationMs = summary.totalDurationMs || 0;

  const totalScrapedAndFailed = totalPagesScraped + totalPagesFailed;
  const successRate =
    totalScrapedAndFailed > 0
      ? Number((totalPagesScraped / totalScrapedAndFailed).toFixed(4))
      : 0;

  const avgMsPerPage =
    totalPagesScraped > 0
      ? Math.round(totalDurationMs / totalPagesScraped)
      : 0;

  const totalProcessed = totalPagesScraped + totalPagesFailed + totalPagesSkipped;
  const cacheHitRate =
    totalProcessed > 0
      ? Number((totalCacheHits / totalProcessed).toFixed(4))
      : 0;

  const failureReasons = {};
  for (const item of failureReasonsAgg) {
    if (item._id && item.count) {
      failureReasons[item._id] = item.count;
    }
  }

  const runsPerDayMap = new Map();
  for (const item of runsPerDayAgg) {
    runsPerDayMap.set(item._id, {
      runs: item.runs || 0,
      pagesScraped: item.pagesScraped || 0,
    });
  }

  const runsPerDay = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayData = runsPerDayMap.get(dateStr) || { runs: 0, pagesScraped: 0 };
    runsPerDay.push({
      date: dateStr,
      runs: dayData.runs,
      pagesScraped: dayData.pagesScraped,
    });
  }

  return {
    totalJobs,
    totalRuns,
    totalPagesScraped,
    totalPagesFailed,
    successRate,
    avgMsPerPage,
    cacheHitRate,
    duplicatesSkipped,
    robotsBlocked,
    failureReasons,
    runsPerDay,
  };
}
