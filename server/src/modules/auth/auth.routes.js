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
import { signupSchema, loginSchema } from './auth.validation.js';

const router = Router();

// Email Authentication routes
router.post('/signup', validate(signupSchema), signupHandler);
router.post('/login', validate(loginSchema), loginHandler);
router.get('/me', authenticate, getMeHandler);

// Google OAuth routes
router.get('/google', initiateGoogleAuth);
router.get('/google/callback', handleGoogleCallback);

// GitHub OAuth routes
router.get('/github', initiateGithubAuth);
router.get('/github/callback', handleGithubCallback);

// Secure token handoff exchange
router.post('/oauth/exchange', exchangeCodeHandler);

export default router;
