import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app.js';
import { logger } from './utils/logger.js';
import { connectDB } from './config/db.js';
import { connectRedis, redis } from './config/redis.js';
import { initRealtime, closeRealtime } from './realtime/index.js';
import { setupProcessHandlers } from './exceptions/processHandlers.js';

const PORT = parseInt(process.env.PORT || '5000', 10);

const startServer = async () => {
  try {
    // Attempt connections (log warnings if databases are not yet started)
    try {
      await connectDB();
    } catch (dbErr) {
      logger.warn('Server starting without immediate MongoDB connection (is Docker running?)');
    }

    try {
      await connectRedis();
    } catch (redisErr) {
      logger.warn('Server starting without immediate Redis connection (is Docker running?)');
    }

    const httpServer = http.createServer(app);

    try {
      await initRealtime(httpServer);
    } catch (realtimeErr) {
      logger.warn({ err: realtimeErr?.message }, 'Realtime Socket.io initialization deferred or degraded');
    }

    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });

    setupProcessHandlers(httpServer, { closeRealtime });

    const shutdown = async (signal) => {
      logger.info(`${signal} received: closing HTTP server and connections`);
      try {
        await closeRealtime();
      } catch (_) {}
      httpServer.close(async () => {
        try {
          await redis.quit();
        } catch (_) {}
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
