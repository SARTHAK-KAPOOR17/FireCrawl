import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createRedisClient } from '../config/redis.js';
import { socketAuthMiddleware } from './socketAuth.js';
import { defaultConnectionManager } from './connectionManager.js';
import { initRedisSubscriber, closeRedisSubscriber } from './redisSubscriber.js';
import { logger } from '../utils/logger.js';

let ioInstance = null;
let pubClientInstance = null;
let subClientInstance = null;

/**
 * Initializes Socket.io attached to the given HTTP server
 * @param {import('http').Server} httpServer
 * @param {Object} [options]
 * @param {boolean} [options.enableRedisAdapter=true]
 * @param {boolean} [options.enableSubscriber=true]
 * @param {import('ioredis').Redis} [options.pubClient]
 * @param {import('ioredis').Redis} [options.subClient]
 * @param {import('ioredis').Redis} [options.eventsSubscriber]
 * @param {Object} [options.connectionManager]
 * @returns {Promise<import('socket.io').Server>}
 */
export async function initRealtime(
  httpServer,
  {
    enableRedisAdapter = true,
    enableSubscriber = true,
    pubClient = null,
    subClient = null,
    eventsSubscriber = null,
    connectionManager = defaultConnectionManager,
  } = {}
) {
  const clientUrl = process.env.CLIENT_URL || process.env.CORS_ORIGIN || 'http://localhost:5173';

  const io = new Server(httpServer, {
    cors: {
      origin: clientUrl,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  ioInstance = io;

  // 1. Setup Redis Adapter if enabled
  if (enableRedisAdapter) {
    try {
      pubClientInstance = pubClient || createRedisClient();
      subClientInstance = subClient || pubClientInstance.duplicate();

      io.adapter(createAdapter(pubClientInstance, subClientInstance));
      logger.info('Socket.io Redis adapter attached successfully');
    } catch (adapterErr) {
      logger.warn({ err: adapterErr?.message }, 'Failed to initialize Socket.io Redis adapter (continuing in standalone mode)');
    }
  }

  // 2. Authentication middleware (reads token ONLY from socket.handshake.auth.token)
  io.use(socketAuthMiddleware);

  // 3. Connection limit middleware (MAX_SOCKETS_PER_USER)
  io.use(connectionManager.middleware());

  // 4. Connection lifecycle
  io.on('connection', (socket) => {
    const userId = socket.data?.userId;
    logger.debug({ socketId: socket.id, userId }, 'Authenticated socket connected');

    // Join ONLY the user room - no client-controlled room joins
    socket.join(`user:${userId}`);

    // Prevent client-controlled room joins
    const originalJoin = socket.join.bind(socket);
    socket.join = (...rooms) => {
      // Disallow client code from joining arbitrary rooms
      const filtered = rooms.filter((r) => r === `user:${userId}`);
      if (filtered.length > 0) {
        return originalJoin(...filtered);
      }
      logger.warn({ socketId: socket.id, rooms }, 'Denied client attempt to join unauthorized room');
      return Promise.resolve();
    };

    // Register with connection manager for rate limiting and socket tracking
    connectionManager.registerSocket(socket);
  });

  // 5. Initialize Redis pub/sub subscriber listening on EVENTS_CHANNEL
  if (enableSubscriber) {
    try {
      await initRedisSubscriber(io, { subscriberClient: eventsSubscriber });
    } catch (subErr) {
      logger.warn({ err: subErr?.message }, 'Failed to initialize Redis events subscriber');
    }
  }

  return io;
}

/**
 * Returns current Socket.io instance
 * @returns {import('socket.io').Server | null}
 */
export function getIO() {
  return ioInstance;
}

/**
 * Gracefully shuts down all realtime resources
 */
export async function closeRealtime() {
  await closeRedisSubscriber();

  if (ioInstance) {
    try {
      ioInstance.disconnectSockets(true);
      await ioInstance.close();
    } catch (_) {}
    ioInstance = null;
  }

  if (pubClientInstance) {
    try {
      await pubClientInstance.quit();
    } catch (_) {}
    pubClientInstance = null;
  }

  if (subClientInstance) {
    try {
      await subClientInstance.quit();
    } catch (_) {}
    subClientInstance = null;
  }

  defaultConnectionManager.reset();
}

export { socketAuthMiddleware } from './socketAuth.js';
export { ConnectionManager, defaultConnectionManager } from './connectionManager.js';
export { initRedisSubscriber, closeRedisSubscriber } from './redisSubscriber.js';
