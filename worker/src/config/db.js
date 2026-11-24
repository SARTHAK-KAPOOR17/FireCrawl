import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

export const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/firecrawl';

  try {
    await mongoose.connect(mongoURI);
    logger.info({ uri: mongoURI }, 'Worker connected to MongoDB');
  } catch (error) {
    logger.error({ err: error.message }, 'Worker failed to connect to MongoDB');
    throw error;
  }
};
