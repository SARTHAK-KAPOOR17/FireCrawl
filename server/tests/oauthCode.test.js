import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  createOAuthCode,
  exchangeOAuthCode,
  generateOAuthState,
  verifyOAuthState,
} from '../src/modules/auth/oauthCodeService.js';

describe('OAuth Code Exchange & CSRF State Logic', () => {
  let redisStorage = new Map();

  // Mock Redis client implementing single-use atomic operations
  const mockRedisClient = {
    set: async (key, value, mode, ttl) => {
      redisStorage.set(key, { value: value.toString(), expiresAt: Date.now() + (ttl || 60) * 1000 });
      return 'OK';
    },
    get: async (key) => {
      const entry = redisStorage.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        redisStorage.delete(key);
        return null;
      }
      return entry.value;
    },
    del: async (key) => {
      const existed = redisStorage.has(key);
      redisStorage.delete(key);
      return existed ? 1 : 0;
    },
    getdel: async (key) => {
      const entry = redisStorage.get(key);
      if (!entry) return null;
      redisStorage.delete(key);
      if (Date.now() > entry.expiresAt) {
        return null;
      }
      return entry.value;
    },
  };

  const mockUserModel = {
    findById: async (id) => {
      if (id === 'valid_user_123') {
        return {
          _id: 'valid_user_123',
          email: 'test@example.com',
          name: 'Test User',
          avatarUrl: 'https://avatar.url',
          isEmailVerified: true,
          providers: [{ provider: 'google', providerId: 'google-99' }],
        };
      }
      return null;
    },
  };

  const mockGenerateToken = (user) => `mock_jwt_for_${user._id}`;

  beforeEach(() => {
    redisStorage.clear();
  });

  describe('createOAuthCode & exchangeOAuthCode', () => {
    it('successfully exchanges a valid one-time code for token and user', async () => {
      const code = await createOAuthCode('valid_user_123', mockRedisClient);
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');

      const result = await exchangeOAuthCode(code, {
        redisClient: mockRedisClient,
        userModel: mockUserModel,
        generateTokenFn: mockGenerateToken,
      });

      expect(result.token).toBe('mock_jwt_for_valid_user_123');
      expect(result.user._id).toBe('valid_user_123');
      expect(result.user.email).toBe('test@example.com');
    });

    it('fails when code is reused (single-use guarantee)', async () => {
      const code = await createOAuthCode('valid_user_123', mockRedisClient);

      // First exchange succeeds
      const firstExchange = await exchangeOAuthCode(code, {
        redisClient: mockRedisClient,
        userModel: mockUserModel,
        generateTokenFn: mockGenerateToken,
      });
      expect(firstExchange.token).toBeDefined();

      // Second exchange must fail because code was deleted
      await expect(
        exchangeOAuthCode(code, {
          redisClient: mockRedisClient,
          userModel: mockUserModel,
          generateTokenFn: mockGenerateToken,
        })
      ).rejects.toThrow('INVALID_OR_EXPIRED_CODE');
    });

    it('fails when code is expired or invalid', async () => {
      // Non-existent code
      await expect(
        exchangeOAuthCode('non_existent_code', {
          redisClient: mockRedisClient,
          userModel: mockUserModel,
          generateTokenFn: mockGenerateToken,
        })
      ).rejects.toThrow('INVALID_OR_EXPIRED_CODE');

      // Expired code simulated
      const code = 'expired_code_xyz';
      redisStorage.set(`oauth:code:${code}`, {
        value: 'valid_user_123',
        expiresAt: Date.now() - 1000, // expired 1s ago
      });

      await expect(
        exchangeOAuthCode(code, {
          redisClient: mockRedisClient,
          userModel: mockUserModel,
          generateTokenFn: mockGenerateToken,
        })
      ).rejects.toThrow('INVALID_OR_EXPIRED_CODE');
    });
  });

  describe('CSRF state verification', () => {
    it('generates, verifies, and consumes single-use state', async () => {
      const state = await generateOAuthState('google', mockRedisClient);
      expect(state).toBeDefined();

      // First verification matches provider and consumes state
      const isValid = await verifyOAuthState(state, 'google', mockRedisClient);
      expect(isValid).toBe(true);

      // Second verification fails because state is single-use
      const isReusedValid = await verifyOAuthState(state, 'google', mockRedisClient);
      expect(isReusedValid).toBe(false);
    });

    it('rejects state when expected provider does not match', async () => {
      const state = await generateOAuthState('google', mockRedisClient);

      const isValidForGithub = await verifyOAuthState(state, 'github', mockRedisClient);
      expect(isValidForGithub).toBe(false);
    });
  });
});
