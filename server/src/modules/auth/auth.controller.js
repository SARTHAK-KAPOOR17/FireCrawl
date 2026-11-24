import bcrypt from 'bcryptjs';
import passport from 'passport';
import {
  ConflictError,
  AuthenticationError,
  ValidationError,
} from '@scraper/shared';
import { User } from '../../models/User.js';
import { generateToken } from '../../utils/jwt.js';
import {
  generateOAuthState,
  verifyOAuthState,
  createOAuthCode,
  exchangeOAuthCode,
} from './oauthCodeService.js';
import { logger } from '../../utils/logger.js';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

export const signupHandler = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new ConflictError('An account with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: name?.trim() || '',
      isEmailVerified: false,
      providers: [],
    });

    const token = generateToken(user);
    logger.info({ userId: user._id, email: user.email }, 'User signed up successfully via email');

    return res.status(201).json({
      success: true,
      token,
      user: user.toJSON(),
    });
  } catch (err) {
    next(err);
  }
};

export const loginHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.passwordHash) {
      throw new AuthenticationError('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new AuthenticationError('Invalid credentials');
    }

    const token = generateToken(user);
    logger.info({ userId: user._id, email: user.email }, 'User logged in successfully via email');

    return res.status(200).json({
      success: true,
      token,
      user: user.toJSON(),
    });
  } catch (err) {
    next(err);
  }
};

export const getMeHandler = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
};

export const initiateGoogleAuth = async (req, res, next) => {
  try {
    const state = await generateOAuthState('google');
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      state,
      session: false,
    })(req, res, next);
  } catch (err) {
    next(err);
  }
};

export const handleGoogleCallback = async (req, res, next) => {
  if (req.query.error) {
    logger.warn({ error: req.query.error }, 'Google OAuth returned error');
    return res.redirect(`${CLIENT_URL}/login?error=${encodeURIComponent(req.query.error)}`);
  }

  const state = req.query.state;
  const isValidState = await verifyOAuthState(state, 'google');
  if (!isValidState) {
    logger.warn({ state }, 'Invalid or expired CSRF state for Google OAuth');
    return res.redirect(`${CLIENT_URL}/login?error=invalid_state`);
  }

  passport.authenticate('google', { session: false }, async (err, user) => {
    if (err || !user) {
      let errorParam = 'oauth_failed';
      if (err?.message === 'NO_EMAIL_PROVIDED') {
        errorParam = 'no_email';
      } else if (err?.message === 'UNVERIFIED_EMAIL_LINK_REJECTED') {
        errorParam = 'unverified_email';
      }
      logger.error({ err: err?.message }, 'Google callback authentication failure');
      return res.redirect(`${CLIENT_URL}/login?error=${errorParam}`);
    }

    try {
      const code = await createOAuthCode(user._id);
      return res.redirect(`${CLIENT_URL}/auth/callback?code=${code}`);
    } catch (codeErr) {
      logger.error({ err: codeErr.message }, 'Failed to create handoff code');
      return res.redirect(`${CLIENT_URL}/login?error=server_error`);
    }
  })(req, res, next);
};

export const initiateGithubAuth = async (req, res, next) => {
  try {
    const state = await generateOAuthState('github');
    passport.authenticate('github', {
      scope: ['user:email'],
      state,
      session: false,
    })(req, res, next);
  } catch (err) {
    next(err);
  }
};

export const handleGithubCallback = async (req, res, next) => {
  if (req.query.error) {
    logger.warn({ error: req.query.error }, 'GitHub OAuth returned error');
    return res.redirect(`${CLIENT_URL}/login?error=${encodeURIComponent(req.query.error)}`);
  }

  const state = req.query.state;
  const isValidState = await verifyOAuthState(state, 'github');
  if (!isValidState) {
    logger.warn({ state }, 'Invalid or expired CSRF state for GitHub OAuth');
    return res.redirect(`${CLIENT_URL}/login?error=invalid_state`);
  }

  passport.authenticate('github', { session: false }, async (err, user) => {
    if (err || !user) {
      let errorParam = 'oauth_failed';
      if (err?.message === 'NO_EMAIL_PROVIDED') {
        errorParam = 'no_email';
      } else if (err?.message === 'UNVERIFIED_EMAIL_LINK_REJECTED') {
        errorParam = 'unverified_email';
      }
      logger.error({ err: err?.message }, 'GitHub callback authentication failure');
      return res.redirect(`${CLIENT_URL}/login?error=${errorParam}`);
    }

    try {
      const code = await createOAuthCode(user._id);
      return res.redirect(`${CLIENT_URL}/auth/callback?code=${code}`);
    } catch (codeErr) {
      logger.error({ err: codeErr.message }, 'Failed to create handoff code');
      return res.redirect(`${CLIENT_URL}/login?error=server_error`);
    }
  })(req, res, next);
};

export const exchangeCodeHandler = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) {
      throw new ValidationError('Authorization code is required');
    }

    const { token, user } = await exchangeOAuthCode(code);

    return res.status(200).json({
      success: true,
      token,
      user,
    });
  } catch (err) {
    next(err);
  }
};
