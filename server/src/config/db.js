import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

export const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/firecrawl';

  try {
    await mongoose.connect(mongoURI);
    logger.info({ uri: mongoURI }, 'MongoDB connected successfully');
  } catch (error) {
    logger.error({ err: error.message }, 'MongoDB connection error');
    // Note: In development or startup, allow application to handle retry or exit
    throw error;
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error({ err: err.message }, 'MongoDB error');
});
