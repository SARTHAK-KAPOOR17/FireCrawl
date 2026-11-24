import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { asyncHandler } from '../../exceptions/asyncHandler.js';
import { getStats } from './stats.controller.js';

const router = Router();

router.use(authenticate);
router.get('/', asyncHandler(getStats));

export default router;
