import { describe, it, expect, afterEach, jest } from '@jest/globals';
import bcrypt from 'bcryptjs';
import { User } from '../src/models/User.js';
import { generateToken } from '../src/utils/jwt.js';
import { signupHandler, loginHandler, getMeHandler } from '../src/modules/auth/auth.controller.js';
import { validate } from '../src/middlewares/validate.js';
import { authenticate } from '../src/middlewares/auth.js';
import { signupSchema, loginSchema } from '../src/modules/auth/auth.validation.js';
import { errorHandler } from '../src/exceptions/errorHandler.js';

const mockResponse = () => {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((data) => {
    res.body = data;
    return res;
  });
  return res;
};

const createNext = (req, res) =>
  jest.fn((err) => {
    if (err) {
      errorHandler(err, req, res, () => {});
    }
  });

describe('Email Auth Unit Tests (Validation, Handlers & Middlewares)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Validation Middleware (signupSchema & loginSchema)', () => {
    it('fails validation on invalid email format', async () => {
      const req = { body: { email: 'not-an-email', password: 'validpassword123' } };
      const res = mockResponse();
      const next = createNext(req, res);

      validate(signupSchema)(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
      expect(res.body.details[0].field).toBe('email');
    });

    it('fails validation if password is shorter than 8 characters', async () => {
      const req = { body: { email: 'user@example.com', password: 'short' } };
      const res = mockResponse();
      const next = createNext(req, res);

      validate(signupSchema)(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
      expect(res.body.details[0].field).toBe('password');
    });

    it('passes validation when inputs are valid', async () => {
      const req = { body: { email: 'valid@example.com', password: 'validpassword123' } };
      const res = mockResponse();
      const next = createNext(req, res);

      validate(signupSchema)(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/signup Handler', () => {
    it('successfully registers a new user and returns JWT + user without passwordHash', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue(null);
      jest.spyOn(User, 'create').mockImplementation(async (userData) => {
        return new User({
          _id: '507f1f77bcf86cd799439011',
          ...userData,
        });
      });

      const req = {
        body: {
          email: 'newuser@example.com',
          password: 'securepassword123',
          name: 'Jane Doe',
        },
      };
      const res = mockResponse();
      const next = jest.fn();

      await signupHandler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('newuser@example.com');
      expect(res.body.user.name).toBe('Jane Doe');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('rejects signup if email is already in use', async () => {
      const existingUser = new User({
        _id: '507f1f77bcf86cd799439012',
        email: 'duplicate@example.com',
        passwordHash: 'hash',
      });
      jest.spyOn(User, 'findOne').mockResolvedValue(existingUser);

      const req = {
        body: {
          email: 'duplicate@example.com',
          password: 'password123',
        },
      };
      const res = mockResponse();
      const next = createNext(req, res);

      await signupHandler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already exists/i);
    });
  });

  describe('POST /auth/login Handler', () => {
    it('successfully logs in with valid credentials and returns JWT + user', async () => {
      const rawPassword = 'validPassword123';
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(rawPassword, salt);

      const mockUser = new User({
        _id: '507f1f77bcf86cd799439013',
        email: 'login@example.com',
        name: 'Login User',
        passwordHash,
      });

      jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);

      const req = {
        body: {
          email: 'login@example.com',
          password: rawPassword,
        },
      };
      const res = mockResponse();
      const next = jest.fn();

      await loginHandler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('login@example.com');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('returns generic "Invalid credentials" message for wrong password', async () => {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('correctPassword', salt);

      const mockUser = new User({
        _id: '507f1f77bcf86cd799439014',
        email: 'user@example.com',
        passwordHash,
      });

      jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);

      const req = {
        body: {
          email: 'user@example.com',
          password: 'wrongPassword123',
        },
      };
      const res = mockResponse();
      const next = createNext(req, res);

      await loginHandler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('returns generic "Invalid credentials" message for non-existent email', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue(null);

      const req = {
        body: {
          email: 'unknown@example.com',
          password: 'anyPassword123',
        },
      };
      const res = mockResponse();
      const next = createNext(req, res);

      await loginHandler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('returns generic "Invalid credentials" message for OAuth-only account (no passwordHash)', async () => {
      const oauthUser = new User({
        _id: '507f1f77bcf86cd799439015',
        email: 'oauthuser@example.com',
        name: 'OAuth User',
        isEmailVerified: true,
        providers: [{ provider: 'google', providerId: 'google-uid-123' }],
      });

      jest.spyOn(User, 'findOne').mockResolvedValue(oauthUser);

      const req = {
        body: {
          email: 'oauthuser@example.com',
          password: 'somePassword123',
        },
      };
      const res = mockResponse();
      const next = createNext(req, res);

      await loginHandler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid credentials');
    });
  });

  describe('GET /auth/me (authenticate middleware & getMeHandler)', () => {
    it('authenticates and returns the current user when given a valid Bearer token', async () => {
      const mockUser = new User({
        _id: '507f1f77bcf86cd799439016',
        email: 'me@example.com',
        name: 'Me User',
      });

      const token = generateToken(mockUser);

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser),
      });

      const req = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      };
      const res = mockResponse();
      const next = jest.fn();

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.email).toBe('me@example.com');

      // Now call getMeHandler with the authenticated user
      await getMeHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('me@example.com');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('returns 401 when no token is provided', async () => {
      const req = { headers: {} };
      const res = mockResponse();
      const next = createNext(req, res);

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/no token provided/i);
    });

    it('returns 401 when token is invalid or malformed', async () => {
      const req = {
        headers: {
          authorization: 'Bearer invalid_or_malformed_token',
        },
      };
      const res = mockResponse();
      const next = createNext(req, res);

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid or expired token/i);
    });
  });
});
