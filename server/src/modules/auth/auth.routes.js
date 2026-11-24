import { Router } from 'express';
import './passport.js';
import {
  initiateGoogleAuth,
  handleGoogleCallback,
  initiateGithubAuth,
  handleGithubCallback,
  exchangeCodeHandler,
} from './auth.controller.js';

const router = Router();

// Google OAuth routes
router.get('/google', initiateGoogleAuth);
router.get('/google/callback', handleGoogleCallback);

// GitHub OAuth routes
router.get('/github', initiateGithubAuth);
router.get('/github/callback', handleGithubCallback);

// Secure token handoff exchange
router.post('/oauth/exchange', exchangeCodeHandler);

export default router;
