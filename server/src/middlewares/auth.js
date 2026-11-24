import { AuthenticationError } from '@scraper/shared';
import { verifyToken } from '../utils/jwt.js';
import { User } from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Authentication required. No token provided.');
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      throw new AuthenticationError('Invalid or expired token');
    }

    const user = await User.findById(decoded.userId).select('-passwordHash');
    if (!user) {
      throw new AuthenticationError('User no longer exists');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
