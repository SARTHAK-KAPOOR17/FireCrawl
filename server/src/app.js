import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import mongoose from 'mongoose';
import passport from 'passport';
import { logger } from './utils/logger.js';
import { redis } from './config/redis.js';
import { errorHandler } from './exceptions/errorHandler.js';
import { requestId } from './exceptions/requestId.js';
import { notFoundHandler } from './exceptions/notFoundHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import jobsRoutes from './modules/jobs/jobs.routes.js';
import statsRoutes from './modules/stats/stats.routes.js';

const app = express();

// Security and utility middlewares
app.use(requestId);
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(pinoHttp({ logger, genReqId: (req) => req.id }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Passport initialization (session: false)
app.use(passport.initialize());

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

// Authentication routes
app.use('/auth', authRoutes);

// Jobs routes
app.use('/jobs', jobsRoutes);

// Stats routes
app.use('/stats', statsRoutes);

// 404 handler for unknown routes
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

export default app;
