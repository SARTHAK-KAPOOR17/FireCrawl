import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../exceptions/asyncHandler.js';
import {
  createJobSchema,
  runJobSchema,
  paginationQuerySchema,
  resultsQuerySchema,
  applySuggestionsSchema,
} from './jobs.validation.js';
import {
  createJob,
  runJob,
  getJobs,
  getJobById,
  deleteJob,
  getJobRuns,
  getLatestRun,
  getJobResults,
  exportJobResults,
  getJobSuggestions,
  applyJobSuggestions,
  deleteJobSuggestions,
} from './jobs.controller.js';

const router = Router();

// Protect all job endpoints with auth middleware
router.use(authenticate);

// Job routes with asyncHandler
router.post('/', validate(createJobSchema), asyncHandler(createJob));
router.get('/', validate(paginationQuerySchema), asyncHandler(getJobs));
router.get('/:id/suggestions', asyncHandler(getJobSuggestions));
router.post('/:id/suggestions/apply', validate(applySuggestionsSchema), asyncHandler(applyJobSuggestions));
router.delete('/:id/suggestions', asyncHandler(deleteJobSuggestions));
router.get('/:id/runs/latest', asyncHandler(getLatestRun));
router.get('/:id/runs', asyncHandler(getJobRuns));
router.get('/:id/results/export', asyncHandler(exportJobResults));
router.get('/:id/results', validate(resultsQuerySchema), asyncHandler(getJobResults));
router.post('/:id/run', validate(runJobSchema), asyncHandler(runJob));
router.get('/:id', asyncHandler(getJobById));
router.delete('/:id', asyncHandler(deleteJob));

export default router;
