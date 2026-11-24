import { AppError } from './AppError.js';
import { ErrorCodes } from './errorCodes.js';

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, {
      code: ErrorCodes.VALIDATION_ERROR,
      statusCode: 400,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', details = null) {
    super(message, {
      code: ErrorCodes.AUTHENTICATION_ERROR,
      statusCode: 401,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied', details = null) {
    super(message, {
      code: ErrorCodes.AUTHORIZATION_ERROR,
      statusCode: 403,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = null) {
    super(message, {
      code: ErrorCodes.NOT_FOUND,
      statusCode: 404,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details = null) {
    super(message, {
      code: ErrorCodes.CONFLICT,
      statusCode: 409,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', details = null) {
    super(message, {
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      statusCode: 429,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}
