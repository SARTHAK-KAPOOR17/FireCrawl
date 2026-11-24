import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import mongoose from 'mongoose';
import { logger } from './utils/logger.js';
import { redis } from './config/redis.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

// Security and utility middlewares
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);
app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const redisStatus = redis.status === 'ready' || redis.status === 'connect' ? 'connected' : redis.status;

  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoStatus,
      redis: redisStatus,
    },
  });
});

// Centralized error handler
app.use(errorHandler);

export default app;
