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

resultSchema.index({ jobId: 1, contentHash: 1 }, { unique: true });
resultSchema.index({ jobId: 1, scrapedAt: -1 });

export const Result = mongoose.models.Result || mongoose.model('Result', resultSchema);
