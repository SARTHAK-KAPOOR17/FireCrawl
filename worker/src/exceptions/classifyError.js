import { normalizeError } from '@scraper/shared';

/**
 * Classifies an error into a typed AppError subclass
 * @param {any} err
 * @returns {import('@scraper/shared').AppError}
 */
export function classifyError(err) {
  return normalizeError(err);
}
