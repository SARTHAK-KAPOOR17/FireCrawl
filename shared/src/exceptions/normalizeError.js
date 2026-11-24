import { AppError } from './AppError.js';
import { ErrorCodes } from './errorCodes.js';
import {
  ValidationError,
  AuthenticationError,
  ConflictError,
} from './http.errors.js';
import {
  NetworkError,
  TimeoutError,
  HttpStatusError,
} from './scrape.errors.js';

/**
 * Normalizes any error (Axios, Mongoose, JWT, Zod, native Error) into an AppError subclass
 * @param {any} err
 * @returns {AppError}
 */
export function normalizeError(err) {
  if (err instanceof AppError) {
    return err;
  }

  if (!err) {
    return new AppError('An unknown error occurred', {
      code: ErrorCodes.INTERNAL_ERROR,
      statusCode: 500,
      isOperational: false,
    });
  }

  // 1. Zod validation error
  if (err.name === 'ZodError' || Array.isArray(err.errors)) {
    const details = err.errors?.map((e) => ({
      field: Array.isArray(e.path) ? e.path.join('.') : e.path,
      message: e.message,
    }));
    return new ValidationError('Validation failed', details);
  }

  // 2. Axios HTTP / Network errors
  if (err.isAxiosError || err.config) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return new TimeoutError(err.message || 'Request timed out', { code: err.code });
    }
    if (err.response?.status) {
      return new HttpStatusError(
        err.response.status,
        `Request failed with status code ${err.response.status}`,
        {
          data: err.response.data,
          headers: err.response.headers,
        }
      );
    }
    const networkCodes = ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'ERR_NETWORK'];
    if (networkCodes.includes(err.code) || !err.response) {
      return new NetworkError(err.message || 'Network communication failed', {
        code: err.code,
      });
    }
  }

  // 3. Mongoose Errors
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.entries(err.errors).map(([field, errObj]) => ({
      field,
      message: errObj.message,
    }));
    return new ValidationError('Database validation failed', details);
  }

  if (err.name === 'CastError') {
    return new ValidationError(`Invalid format for field ${err.path}: ${err.value}`, {
      field: err.path,
      value: err.value,
    });
  }

  if (err.code === 11000) {
    return new ConflictError('A duplicate record already exists', {
      keyPattern: err.keyPattern,
      keyValue: err.keyValue,
    });
  }

  // 4. JWT Errors
  if (
    err.name === 'JsonWebTokenError' ||
    err.name === 'TokenExpiredError' ||
    err.name === 'NotBeforeError'
  ) {
    return new AuthenticationError(err.message || 'Invalid or expired token', {
      name: err.name,
    });
  }

  // 5. Generic Error fallback
  const message = err.message || 'An unexpected error occurred';
  const statusCode = err.statusCode || err.status || 500;
  const isOperational = Boolean(err.isOperational);

  return new AppError(message, {
    code: err.code || ErrorCodes.INTERNAL_ERROR,
    statusCode,
    isOperational,
    details: err.details || null,
  });
}
