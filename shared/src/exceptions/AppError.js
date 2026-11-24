import { ErrorCodes } from './errorCodes.js';

export class AppError extends Error {
  /**
   * @param {string} message
   * @param {Object} [options]
   * @param {string} [options.code]
   * @param {number} [options.statusCode]
   * @param {boolean} [options.isOperational]
   * @param {any} [options.details]
   * @param {boolean} [options.retryable]
   */
  constructor(
    message,
    {
      code = ErrorCodes.INTERNAL_ERROR,
      statusCode = 500,
      isOperational = true,
      details = null,
      retryable = false,
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    this.retryable = retryable;
    Error.captureStackTrace(this, this.constructor);
  }
}
