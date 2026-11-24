import { AiInvalidOutputError } from '@scraper/shared';

/**
 * Validates and sanitizes AI model extraction output with Zod-style strict rules:
 * - Only requested field names are permitted (extra fields stripped)
 * - Each extracted value is string or null, trimmed, max length 2000
 * - Suggested CSS selectors are strings, max length 300
 * - Invalid outputs throw AiInvalidOutputError
 *
 * @param {Object} params
 * @param {any} params.rawOutput - Raw JSON string or object from LLM
 * @param {string[]} params.fields - Array of requested field names
 * @returns {{ values: Record<string, string | null>, suggestedSelectors: Record<string, string> }}
 */
export function validateAiOutput({ rawOutput, fields }) {
  if (!rawOutput) {
    throw new AiInvalidOutputError('Empty response from AI model');
  }

  let parsed = rawOutput;
  if (typeof rawOutput === 'string') {
    try {
      parsed = JSON.parse(rawOutput);
    } catch (parseErr) {
      throw new AiInvalidOutputError('Failed to parse AI model output as JSON', {
        raw: rawOutput.slice(0, 500),
      });
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AiInvalidOutputError('AI model output must be a JSON object');
  }

  const rawValues =
    parsed.values && typeof parsed.values === 'object' && !Array.isArray(parsed.values)
      ? parsed.values
      : parsed;

  const rawSelectors =
    parsed.suggestedSelectors &&
    typeof parsed.suggestedSelectors === 'object' &&
    !Array.isArray(parsed.suggestedSelectors)
      ? parsed.suggestedSelectors
      : {};

  const cleanValues = {};
  const cleanSelectors = {};

  for (const field of fields) {
    const val = rawValues[field];

    if (val === undefined || val === null) {
      cleanValues[field] = null;
    } else if (typeof val === 'string') {
      if (val.length > 2000) {
        throw new AiInvalidOutputError(
          `Field '${field}' exceeds maximum allowed length of 2000 characters`
        );
      }
      cleanValues[field] = val.trim();
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      cleanValues[field] = String(val);
    } else {
      throw new AiInvalidOutputError(`Field '${field}' must be a string or null`);
    }

    const sel = rawSelectors[field];
    if (typeof sel === 'string') {
      const trimmedSel = sel.trim();
      if (trimmedSel.length > 0) {
        if (trimmedSel.length > 300) {
          throw new AiInvalidOutputError(
            `Suggested selector for '${field}' exceeds maximum allowed length of 300 characters`
          );
        }
        cleanSelectors[field] = trimmedSel;
      }
    }
  }

  return {
    values: cleanValues,
    suggestedSelectors: cleanSelectors,
  };
}
