import { EVENTS_CHANNEL, safeParseRealtimeMessage } from '@scraper/shared';
import { createRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

let sharedSubscriber = null;

/**
 * Initializes Redis pub/sub subscriber listening on EVENTS_CHANNEL
 * Validates each incoming message with Zod schema and emits to user room
 * @param {import('socket.io').Server} io
 * @param {Object} [options]
 * @param {import('ioredis').Redis} [options.subscriberClient]
 */
export async function initRedisSubscriber(io, { subscriberClient = null } = {}) {
  const subscriber = subscriberClient || createRedisClient();
  sharedSubscriber = subscriber;

  subscriber.on('error', (err) => {
    logger.error({ err: err?.message }, 'Realtime Redis subscriber connection error');
  });

  try {
    if (subscriber.status === 'wait' || subscriber.status === 'close') {
      await subscriber.connect();
    }
  } catch (connErr) {
    logger.warn({ err: connErr?.message }, 'Redis subscriber connection deferred or failed');
  }

  await subscriber.subscribe(EVENTS_CHANNEL);
  logger.info({ channel: EVENTS_CHANNEL }, 'Subscribed to Redis realtime events channel');

  subscriber.on('message', (channel, message) => {
    if (channel !== EVENTS_CHANNEL) return;

    try {
      const event = safeParseRealtimeMessage(message);
      if (!event) {
        logger.warn({ message }, 'Dropped malformed realtime event from Redis pub/sub channel');
        return;
      }

      const targetRoom = `user:${event.userId}`;
      io.to(targetRoom).emit(event.type, event);
      logger.debug({ type: event.type, userId: event.userId, jobId: event.jobId }, 'Relayed realtime event to user room');
    } catch (parseErr) {
      logger.error({ err: parseErr?.message, message }, 'Unexpected error processing pub/sub message; dropping');
    }
  });

  return subscriber;
}

/**
 * Closes the Redis subscriber
 */
export async function closeRedisSubscriber() {
  if (sharedSubscriber) {
    try {
      await sharedSubscriber.unsubscribe(EVENTS_CHANNEL);
      await sharedSubscriber.quit();
    } catch (_) {}
    sharedSubscriber = null;
  }
}
