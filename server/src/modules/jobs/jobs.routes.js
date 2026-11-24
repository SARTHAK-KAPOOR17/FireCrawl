import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../exceptions/asyncHandler.js';
import {
  createJobSchema,
  runJobSchema,
  paginationQuerySchema,
  resultsQuerySchema,
} from './jobs.validation.js';
import {
  createJob,
  runJob,
  getJobs,
  getJobById,
  deleteJob,
  getJobRuns,
  getJobResults,
} from './jobs.controller.js';

const router = Router();

// Protect all job endpoints with auth middleware
router.use(authenticate);

// Job routes with asyncHandler
router.post('/', validate(createJobSchema), asyncHandler(createJob));
router.get('/', validate(paginationQuerySchema), asyncHandler(getJobs));
router.get('/:id', asyncHandler(getJobById));
router.delete('/:id', asyncHandler(deleteJob));
router.post('/:id/run', validate(runJobSchema), asyncHandler(runJob));
router.get('/:id/runs', asyncHandler(getJobRuns));
router.get('/:id/results', validate(resultsQuerySchema), asyncHandler(getJobResults));

export default router;
