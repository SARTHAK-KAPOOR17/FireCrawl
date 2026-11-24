import { normalizeError, ErrorCodes } from '@scraper/shared';
import { logger } from '../utils/logger.js';

export const errorHandler = (rawErr, req, res, next) => {
  const err = normalizeError(rawErr);
  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = err.statusCode || 500;

  const logPayload = {
    requestId: req.id,
    userId: req.user?._id,
    route: req.originalUrl,
    code: err.code,
  };

  if (statusCode < 500) {
    logger.warn({ ...logPayload, message: err.message }, 'Client request error');
  } else {
    logger.error({ ...logPayload, err: err.stack || err.message }, 'Server request error');
  }

  let message = err.message;
  let code = err.code;

  if (!err.isOperational && isProduction) {
    message = 'Internal server error';
    code = ErrorCodes.INTERNAL_ERROR;
  }

  const responseBody = {
    success: false,
    code,
    message,
    ...(err.details ? { details: err.details } : {}),
    ...(!isProduction && err.stack ? { stack: err.stack } : {}),
  };

  res.status(statusCode).json(responseBody);
};
