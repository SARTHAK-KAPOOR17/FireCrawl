import { UnrecoverableError } from 'bullmq';
import { classifyError } from './classifyError.js';
import { logger } from '../utils/logger.js';

/**
 * Applies BullMQ retry policy based on error classification.
 * - Non-retryable errors are wrapped in UnrecoverableError so BullMQ skips retries.
 * - Retryable errors are rethrown as-is for exponential backoff.
 * @param {any} rawErr
 * @param {Object} [context]
 * @throws {UnrecoverableError|Error}
 */
export function applyRetryPolicy(rawErr, context = {}) {
  const err = classifyError(rawErr);

  if (!err.retryable) {
    logger.warn(
      { code: err.code, message: err.message, ...context },
      'Encountered non-retryable error. Halting retries via UnrecoverableError.'
    );
    const unrecoverable = new UnrecoverableError(err.message);
    unrecoverable.code = err.code;
    unrecoverable.originalError = err;
    throw unrecoverable;
  }

  logger.warn(
    { code: err.code, message: err.message, ...context },
    'Encountered retryable error. Allowing BullMQ exponential backoff.'
  );
  throw err;
}
