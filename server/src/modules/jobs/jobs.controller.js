import * as jobService from './jobs.service.js';

export const createJob = async (req, res, next) => {
  try {
    const { job, run } = await jobService.createJob({
      userId: req.user._id,
      data: req.body,
    });
    return res.status(201).json({
      success: true,
      job,
      run,
    });
  } catch (err) {
    next(err);
  }
};

export const runJob = async (req, res, next) => {
  try {
    const { jobRun, job } = await jobService.startJobRun({
      jobId: req.params.id,
      userId: req.user._id,
    });
    return res.status(200).json({
      success: true,
      run: jobRun,
      job,
    });
  } catch (err) {
    if (err instanceof jobService.JobServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

export const getJobs = async (req, res, next) => {
  try {
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
  } catch (err) {
    next(err);
  }
};

export const getJobById = async (req, res, next) => {
  try {
    const job = await jobService.getJobById({
      jobId: req.params.id,
      userId: req.user._id,
    });
    return res.status(200).json({
      success: true,
      job,
    });
  } catch (err) {
    if (err instanceof jobService.JobServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

export const deleteJob = async (req, res, next) => {
  try {
    const result = await jobService.deleteJob({
      jobId: req.params.id,
      userId: req.user._id,
    });
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    if (err instanceof jobService.JobServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

export const getJobRuns = async (req, res, next) => {
  try {
    const runs = await jobService.getJobRuns({
      jobId: req.params.id,
      userId: req.user._id,
    });
    return res.status(200).json({
      success: true,
      runs,
    });
  } catch (err) {
    if (err instanceof jobService.JobServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

export const getJobResults = async (req, res, next) => {
  try {
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
  } catch (err) {
    if (err instanceof jobService.JobServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};
