import { AppError } from './AppError.js';
import { ErrorCodes } from './errorCodes.js';

export class NetworkError extends AppError {
  constructor(message = 'Network error occurred', details = null) {
    super(message, {
      code: ErrorCodes.NETWORK_ERROR,
      statusCode: 502,
      isOperational: true,
      details,
      retryable: true,
    });
  }
}

export class TimeoutError extends AppError {
  constructor(message = 'Request timed out', details = null) {
    super(message, {
      code: ErrorCodes.TIMEOUT_ERROR,
      statusCode: 504,
      isOperational: true,
      details,
      retryable: true,
    });
  }
}

export class HttpStatusError extends AppError {
  constructor(status, message = null, details = null) {
    const isRetryable = status >= 500 || status === 429;
    super(message || `Request failed with HTTP status ${status}`, {
      code: ErrorCodes.HTTP_STATUS_ERROR,
      statusCode: status,
      isOperational: true,
      details: { status, ...(details || {}) },
      retryable: isRetryable,
    });
  }
}

export class ParseError extends AppError {
  constructor(message = 'Failed to parse page content', details = null) {
    super(message, {
      code: ErrorCodes.PARSE_ERROR,
      statusCode: 422,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}

export class NoDataExtractedError extends AppError {
  constructor(message = 'Page returned no data for all fields', details = null) {
    super(message, {
      code: ErrorCodes.NO_DATA_EXTRACTED,
      statusCode: 422,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}

export class RobotsDisallowedError extends AppError {
  constructor(message = 'Scraping disallowed by robots.txt', details = null) {
    super(message, {
      code: ErrorCodes.ROBOTS_DISALLOWED,
      statusCode: 403,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}

export class InvalidUrlError extends AppError {
  constructor(message = 'Invalid URL provided', details = null) {
    super(message, {
      code: ErrorCodes.INVALID_URL,
      statusCode: 400,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}

export class RateLimitWaitTimeoutError extends AppError {
  constructor(message = 'Timed out waiting for rate limit delay', details = null) {
    super(message, {
      code: ErrorCodes.RATE_LIMIT_WAIT_TIMEOUT,
      statusCode: 504,
      isOperational: true,
      details,
      retryable: true,
    });
  }
}

export class SsrfBlockedError extends AppError {
  constructor(message = 'Access to private or internal IP address is blocked', details = null) {
    super(message, {
      code: ErrorCodes.SSRF_BLOCKED,
      statusCode: 403,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}
