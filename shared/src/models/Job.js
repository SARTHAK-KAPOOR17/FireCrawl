import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    urls: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Job must contain at least one URL',
      },
    },
    selectors: {
      type: Map,
      of: String,
      default: () => new Map(),
    },
    mode: {
      type: String,
      enum: ['static', 'dynamic'],
      default: 'static',
    },
    status: {
      type: String,
      enum: ['idle', 'queued', 'running', 'completed', 'failed'],
      default: 'idle',
    },
    schedule: {
      type: String,
      default: null,
    },
    aiFallback: {
      type: Boolean,
      default: false,
    },
    suggestedSelectors: {
      type: Map,
      of: new mongoose.Schema(
        {
          selector: { type: String, required: true },
          verifiedAt: { type: Date, default: Date.now },
          sampleUrl: { type: String, default: null },
        },
        { _id: false }
      ),
      default: () => new Map(),
    },
  },
  {
    timestamps: true,
  }
);

jobSchema.index({ userId: 1 });

export const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);
