import mongoose from 'mongoose';

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
    cacheHits: {
      type: Number,
      default: 0,
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
