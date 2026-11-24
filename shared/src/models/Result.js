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

resultSchema.index({ jobId: 1, url: 1, contentHash: 1 }, { unique: true });
resultSchema.index({ jobId: 1, scrapedAt: -1 });

/**
 * Safely drops legacy (jobId, contentHash) unique index if it exists in the database
 * @param {mongoose.Model} [ResultModel]
 */
export async function dropLegacyResultIndex(ResultModel = Result) {
  try {
    if (!ResultModel?.collection) return;
    const indexes = await ResultModel.collection.indexes();
    const legacyIndex = indexes.find(
      (idx) =>
        idx.name === 'jobId_1_contentHash_1' ||
        (idx.key?.jobId === 1 && idx.key?.contentHash === 1 && !idx.key?.url)
    );
    if (legacyIndex) {
      await ResultModel.collection.dropIndex(legacyIndex.name);
    }
  } catch (_) {
    // Ignore error if index doesn't exist or collection hasn't been created yet
  }
}

export const Result = mongoose.models.Result || mongoose.model('Result', resultSchema);
