import mongoose from 'mongoose';

const resultSchema = new mongoose.Schema(
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
    url: {
      type: String,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    contentHash: {
      type: String,
      required: true,
    },
    scrapedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Unique compound index on (jobId, contentHash)
resultSchema.index({ jobId: 1, contentHash: 1 }, { unique: true });

// Index on (jobId, scrapedAt desc)
resultSchema.index({ jobId: 1, scrapedAt: -1 });

export const Result = mongoose.model('Result', resultSchema);
