import crypto from 'crypto';
import {
  ValidationError,
  AuthenticationError,
  NotFoundError,
} from '@scraper/shared';
import { redis as defaultRedis } from '../../config/redis.js';
import { User as DefaultUser } from '../../models/User.js';
import { generateToken as defaultGenerateToken } from '../../utils/jwt.js';

const STATE_PREFIX = 'oauth:state:';
const CODE_PREFIX = 'oauth:code:';
const STATE_TTL = 300; // 5 minutes
const CODE_TTL = 60; // 60 seconds single-use

export async function generateOAuthState(provider, redisClient = defaultRedis) {
  const state = crypto.randomBytes(32).toString('hex');
  const key = `${STATE_PREFIX}${state}`;
  await redisClient.set(key, provider, 'EX', STATE_TTL);
  return state;
}

export async function verifyOAuthState(state, expectedProvider, redisClient = defaultRedis) {
  if (!state || typeof state !== 'string') return false;
  const key = `${STATE_PREFIX}${state}`;

  let savedProvider;
  if (typeof redisClient.getdel === 'function') {
    savedProvider = await redisClient.getdel(key);
  } else {
    const pipeline = redisClient.pipeline().get(key).del(key);
    const results = await pipeline.exec();
    savedProvider = results?.[0]?.[1];
  }

  return savedProvider === expectedProvider;
}

export async function createOAuthCode(userId, redisClient = defaultRedis) {
  const code = crypto.randomBytes(32).toString('hex');
  const key = `${CODE_PREFIX}${code}`;
  await redisClient.set(key, userId.toString(), 'EX', CODE_TTL);
  return code;
}

export async function exchangeOAuthCode(
  code,
  {
    redisClient = defaultRedis,
    userModel = DefaultUser,
    generateTokenFn = defaultGenerateToken,
  } = {}
) {
  if (!code || typeof code !== 'string') {
    throw new ValidationError('CODE_REQUIRED');
  }

  const key = `${CODE_PREFIX}${code}`;

  let userId;
  if (typeof redisClient.getdel === 'function') {
    userId = await redisClient.getdel(key);
  } else {
    const pipeline = redisClient.pipeline().get(key).del(key);
    const results = await pipeline.exec();
    userId = results?.[0]?.[1];
  }

  if (!userId) {
    throw new AuthenticationError('INVALID_OR_EXPIRED_CODE');
  }

  const user = await userModel.findById(userId);
  if (!user) {
    throw new NotFoundError('USER_NOT_FOUND');
  }

  const token = generateTokenFn(user);

  return {
    token,
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isEmailVerified: user.isEmailVerified,
      providers: user.providers,
    },
  };
}
