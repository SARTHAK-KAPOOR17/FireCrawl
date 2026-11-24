import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  logger.error({
    err: {
      message: err.message,
      stack: err.stack,
      statusCode,
    },
    req: {
      method: req.method,
      url: req.originalUrl,
    },
  }, 'Request error encountered');

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(isProduction ? {} : { stack: err.stack }),
  });
};
