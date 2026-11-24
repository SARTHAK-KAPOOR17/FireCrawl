import { AppError } from './AppError.js';
import { ErrorCodes } from './errorCodes.js';

export class AiExtractionError extends AppError {
  constructor(message = 'AI extraction request failed', { statusCode = 502, details = null, retryable = null } = {}) {
    const isRetryable = retryable !== null ? retryable : (statusCode === 429 || statusCode >= 500);
    super(message, {
      code: ErrorCodes.AI_EXTRACTION_ERROR,
      statusCode,
      isOperational: true,
      details,
      retryable: isRetryable,
    });
  }
}

export class AiInvalidOutputError extends AppError {
  constructor(message = 'AI model returned invalid or unparseable output', details = null) {
    super(message, {
      code: ErrorCodes.AI_INVALID_OUTPUT,
      statusCode: 422,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}

export class AiQuotaExceededError extends AppError {
  constructor(message = 'AI extraction quota exceeded', details = null) {
    super(message, {
      code: ErrorCodes.AI_QUOTA_EXCEEDED,
      statusCode: 429,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}

export class AiDisabledError extends AppError {
  constructor(message = 'AI fallback is disabled for this job or environment', details = null) {
    super(message, {
      code: ErrorCodes.AI_DISABLED,
      statusCode: 400,
      isOperational: true,
      details,
      retryable: false,
    });
  }
}
