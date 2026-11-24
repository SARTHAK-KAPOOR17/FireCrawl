import { AuthenticationError } from '@scraper/shared';
import { logger } from '../utils/logger.js';

export class ConnectionManager {
  constructor({ maxSocketsPerUser = parseInt(process.env.MAX_SOCKETS_PER_USER || '10', 10) } = {}) {
    this.maxSocketsPerUser = maxSocketsPerUser;
    // Map<userId, Set<socketId>>
    this.userSockets = new Map();
    // Map<socketId, { count: number, resetAt: number }> for basic client event rate limiting
    this.socketEventRates = new Map();
  }

  /**
   * Middleware to check and limit active connections per user
   */
  middleware() {
    return (socket, next) => {
      const userId = socket.data?.userId;
      if (!userId) {
        return next(new AuthenticationError('Unauthenticated socket'));
      }

      const currentSockets = this.userSockets.get(userId) || new Set();
      if (currentSockets.size >= this.maxSocketsPerUser) {
        logger.warn(
          { userId, count: currentSockets.size, limit: this.maxSocketsPerUser },
          'Connection rejected: MAX_SOCKETS_PER_USER exceeded'
        );
        return next(new AuthenticationError('Maximum connections per user exceeded'));
      }

      next();
    };
  }

  /**
   * Registers a newly connected socket
   */
  registerSocket(socket) {
    const userId = socket.data?.userId;
    if (!userId) return;

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(socket.id);

    // Track disconnection
    socket.on('disconnect', () => {
      this.unregisterSocket(socket);
    });

    // Client-sent event handling:
    // Rate limit and ignore unknown custom client events
    socket.onAny((event) => {
      this.handleClientEvent(socket, event);
    });
  }

  /**
   * Handles client-sent events with basic rate limiting and ignores unknown ones
   */
  handleClientEvent(socket, eventName) {
    const now = Date.now();
    let rate = this.socketEventRates.get(socket.id);

    if (!rate || now > rate.resetAt) {
      rate = { count: 1, resetAt: now + 10000 };
      this.socketEventRates.set(socket.id, rate);
    } else {
      rate.count += 1;
    }

    if (rate.count > 30) {
      logger.warn({ socketId: socket.id, eventName }, 'Socket exceeded client event rate limit');
      socket.disconnect(true);
      return;
    }

    // Client should not send custom events; log and ignore unknown ones
    logger.debug({ socketId: socket.id, eventName }, 'Ignored unknown client-sent event');
  }

  /**
   * Unregisters a disconnected socket
   */
  unregisterSocket(socket) {
    const userId = socket.data?.userId;
    if (userId && this.userSockets.has(userId)) {
      const set = this.userSockets.get(userId);
      set.delete(socket.id);
      if (set.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.socketEventRates.delete(socket.id);
  }

  /**
   * Returns current active socket count for a user
   */
  getUserSocketCount(userId) {
    return this.userSockets.get(userId)?.size || 0;
  }

  /**
   * Clears all connection tracking
   */
  reset() {
    this.userSockets.clear();
    this.socketEventRates.clear();
  }
}

export const defaultConnectionManager = new ConnectionManager();
