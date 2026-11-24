import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  createJobSchema,
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

// Job routes
router.post('/', validate(createJobSchema), createJob);
router.get('/', validate(paginationQuerySchema), getJobs);
router.get('/:id', getJobById);
router.delete('/:id', deleteJob);
router.post('/:id/run', runJob);
router.get('/:id/runs', getJobRuns);
router.get('/:id/results', validate(resultsQuerySchema), getJobResults);

export default router;
