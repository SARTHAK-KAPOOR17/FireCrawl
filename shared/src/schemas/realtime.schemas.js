import { z } from 'zod';
import { REALTIME_EVENTS } from '../constants.js';

export const baseEventSchema = z.object({
  type: z.string(),
  userId: z.string(),
  jobId: z.string(),
  runId: z.string(),
  ts: z.number().default(() => Date.now()),
});

export const runStartedSchema = baseEventSchema.extend({
  type: z.literal(REALTIME_EVENTS.RUN_STARTED),
  totalUrls: z.number().nonnegative(),
});

export const runProgressSchema = baseEventSchema.extend({
  type: z.literal(REALTIME_EVENTS.RUN_PROGRESS),
  scraped: z.number().nonnegative(),
  failed: z.number().nonnegative(),
  skipped: z.number().nonnegative(),
  total: z.number().nonnegative(),
  cacheHits: z.number().nonnegative().default(0),
});

export const pageDoneItemSchema = z.object({
  url: z.string(),
  outcome: z.enum(['scraped', 'skipped', 'failed']),
  code: z.string().optional(),
  cached: z.boolean().optional(),
});

export const pageDoneSchema = baseEventSchema.extend({
  type: z.literal(REALTIME_EVENTS.PAGE_DONE),
  url: z.string(),
  outcome: z.enum(['scraped', 'skipped', 'failed']),
  code: z.string().optional(),
  cached: z.boolean().optional(),
});

export const pageBatchSchema = baseEventSchema.extend({
  type: z.literal(REALTIME_EVENTS.PAGE_BATCH),
  pages: z.array(pageDoneItemSchema),
});

export const runFinishedSchema = baseEventSchema.extend({
  type: z.literal(REALTIME_EVENTS.RUN_FINISHED),
  status: z.enum(['completed', 'failed']),
  durationMs: z.number().nonnegative(),
  scraped: z.number().nonnegative(),
  failed: z.number().nonnegative(),
  skipped: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

export const realtimeEventSchema = z.discriminatedUnion('type', [
  runStartedSchema,
  runProgressSchema,
  pageDoneSchema,
  pageBatchSchema,
  runFinishedSchema,
]);

/**
 * Validates a parsed JSON payload as a known Realtime Event
 * @param {unknown} data
 * @returns {z.infer<typeof realtimeEventSchema>}
 */
export function validateRealtimeEvent(data) {
  return realtimeEventSchema.parse(data);
}

/**
 * Safely parses and validates a raw Redis pub/sub string message
 * @param {string} rawString
 * @returns {z.infer<typeof realtimeEventSchema> | null}
 */
export function safeParseRealtimeMessage(rawString) {
  try {
    const parsed = typeof rawString === 'string' ? JSON.parse(rawString) : rawString;
    const result = realtimeEventSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}
