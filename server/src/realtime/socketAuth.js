import { AuthenticationError, User } from '@scraper/shared';
import { verifyToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';

/**
 * Socket.io authentication middleware
 * - Enforces reading token ONLY from socket.handshake.auth.token (NEVER query string)
 * - Verifies JWT with verifyToken helper
 * - Attaches authenticated user and userId to socket.data
 * - Rejects unauthorized connections with typed AuthenticationError
 */
export async function socketAuthMiddleware(socket, next) {
  // Disallow tokens passed via query string
  if (socket.handshake.query?.token) {
    logger.warn({ socketId: socket.id }, 'Rejecting socket connection: token in query string is not permitted');
    return next(new AuthenticationError('Token in query string is not permitted'));
  }

  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new AuthenticationError('Authentication token required'));
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return next(new AuthenticationError('Invalid authentication token payload'));
    }

    const user = await User.findById(decoded.userId).select('-passwordHash');
    if (!user) {
      return next(new AuthenticationError('User not found'));
    }

    socket.data.user = user;
    socket.data.userId = user._id.toString();
    return next();
  } catch (err) {
    logger.debug({ err: err?.message, socketId: socket.id }, 'Socket authentication failed');
    return next(new AuthenticationError('Invalid or expired authentication token'));
  }
}
