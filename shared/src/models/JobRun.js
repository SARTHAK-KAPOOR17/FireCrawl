import mongoose from 'mongoose';

const failedUrlSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const jobRunSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    totalUrls: {
      type: Number,
      required: true,
      default: 0,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    pagesScraped: {
      type: Number,
      default: 0,
    },
    pagesFailed: {
      type: Number,
      default: 0,
    },
    pagesSkipped: {
      type: Number,
      default: 0,
    },
    duplicatesSkipped: {
      type: Number,
      default: 0,
    },
    robotsBlocked: {
      type: Number,
      default: 0,
    },
    cacheHits: {
      type: Number,
      default: 0,
    },
    failureReasons: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
    failedUrls: {
      type: [failedUrlSchema],
      default: () => [],
    },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed'],
      default: 'running',
    },
  },
  {
    timestamps: false,
  }
);

jobRunSchema.index({ jobId: 1, startedAt: -1 });

export const JobRun = mongoose.models.JobRun || mongoose.model('JobRun', jobRunSchema);
