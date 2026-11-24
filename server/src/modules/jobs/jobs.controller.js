import * as jobService from './jobs.service.js';

export const createJob = async (req, res) => {
  const { job, run } = await jobService.createJob({
    userId: req.user._id,
    data: req.body,
  });
  return res.status(201).json({
    success: true,
    job,
    run,
  });
};

export const runJob = async (req, res) => {
  const forceRefresh = Boolean(req.body?.forceRefresh);
  const { jobRun, job } = await jobService.startJobRun({
    jobId: req.params.id,
    userId: req.user._id,
    forceRefresh,
  });
  return res.status(200).json({
    success: true,
    run: jobRun,
    job,
  });
};

export const getJobs = async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 100);

  const result = await jobService.getJobs({
    userId: req.user._id,
    page,
    limit,
  });

  return res.status(200).json({
    success: true,
    ...result,
  });
};

export const getJobById = async (req, res) => {
  const job = await jobService.getJobById({
    jobId: req.params.id,
    userId: req.user._id,
  });
  return res.status(200).json({
    success: true,
    job,
  });
};

export const deleteJob = async (req, res) => {
  const result = await jobService.deleteJob({
    jobId: req.params.id,
    userId: req.user._id,
  });
  return res.status(200).json({
    success: true,
    ...result,
  });
};

export const getJobRuns = async (req, res) => {
  const runs = await jobService.getJobRuns({
    jobId: req.params.id,
    userId: req.user._id,
  });
  return res.status(200).json({
    success: true,
    runs,
  });
};

export const getJobResults = async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const search = req.query.search || '';
  const sort = req.query.sort === 'asc' ? 'asc' : 'desc';

  const result = await jobService.getJobResults({
    jobId: req.params.id,
    userId: req.user._id,
    page,
    limit,
    search,
    sort,
  });

  return res.status(200).json({
    success: true,
    ...result,
  });
};

export const exportJobResults = async (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const search = req.query.search || '';

  await jobService.exportJobResults({
    jobId: req.params.id,
    userId: req.user._id,
    format,
    search,
    res,
  });
};
