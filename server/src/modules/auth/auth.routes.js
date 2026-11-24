import { Router } from 'express';
import './passport.js';
import {
  signupHandler,
  loginHandler,
  getMeHandler,
  initiateGoogleAuth,
  handleGoogleCallback,
  initiateGithubAuth,
  handleGithubCallback,
  exchangeCodeHandler,
} from './auth.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { asyncHandler } from '../../exceptions/asyncHandler.js';
import { signupSchema, loginSchema } from './auth.validation.js';

const router = Router();

// Email Authentication routes
router.post('/signup', validate(signupSchema), asyncHandler(signupHandler));
router.post('/login', validate(loginSchema), asyncHandler(loginHandler));
router.get('/me', authenticate, asyncHandler(getMeHandler));

// Google OAuth routes
router.get('/google', asyncHandler(initiateGoogleAuth));
router.get('/google/callback', asyncHandler(handleGoogleCallback));

// GitHub OAuth routes
router.get('/github', asyncHandler(initiateGithubAuth));
router.get('/github/callback', asyncHandler(handleGithubCallback));

// Secure token handoff exchange
router.post('/oauth/exchange', asyncHandler(exchangeCodeHandler));

export default router;
