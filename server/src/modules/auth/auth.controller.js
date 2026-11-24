import bcrypt from 'bcryptjs';
import passport from 'passport';
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

/**
 * Register a new user with email and password
 * POST /auth/signup
 */
export const signupHandler = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
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

/**
 * Log in an existing user with email and password
 * POST /auth/login
 */
export const loginHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });

    // Use generic "Invalid credentials" if user does not exist OR if user has no passwordHash (OAuth-only)
    if (!user || !user.passwordHash) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
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

/**
 * Get current authenticated user
 * GET /auth/me
 */
export const getMeHandler = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
};

/**
 * Initiate Google OAuth with CSRF state
 */
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

/**
 * Handle Google OAuth callback
 */
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

/**
 * Initiate GitHub OAuth with CSRF state
 */
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

/**
 * Handle GitHub OAuth callback
 */
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

/**
 * Exchange one-time handoff code for JWT and user
 * POST /auth/oauth/exchange
 */
export const exchangeCodeHandler = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required',
      });
    }

    const { token, user } = await exchangeOAuthCode(code);

    return res.status(200).json({
      success: true,
      token,
      user,
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Code exchange error');
    return res.status(400).json({
      success: false,
      message:
        err.message === 'INVALID_OR_EXPIRED_CODE'
          ? 'Invalid or expired authorization code'
          : err.message || 'Code exchange failed',
    });
  }
};
