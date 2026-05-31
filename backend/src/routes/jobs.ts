// API Routes for Jobs
// Public endpoints for job submission and retrieval

import express from 'express';
import * as jobIntake from '../services/job-intake';
import { enqueueJob } from '../workers/queue';
import { QueueJobType } from '../types/queue';
import { AppError } from '../middleware/error';

const router = express.Router();

// Create a new job (draft)
router.post('/', async (req, res, next) => {
  try {
    const job = await jobIntake.createJob(req.body);
    res.status(201).json(job);
  } catch (error) {
    next(error);
  }
});

// Get a job by ID
router.get('/:jobId', async (req, res, next) => {
  try {
    const job = await jobIntake.getJob(req.params.jobId);
    if (!job) {
      throw new AppError(404, 'Job not found');
    }
    res.json(job);
  } catch (error) {
    next(error);
  }
});

// Submit a job for intake and analysis
router.post('/:jobId/submit', async (req, res, next) => {
  try {
    const job = await jobIntake.submitJob(req.params.jobId);
    const queueJobId = await enqueueJob(QueueJobType.CLASSIFY_JOB, job.id, { jobId: job.id });

    res.json({
      ...job,
      queueJobId,
      queueStage: QueueJobType.CLASSIFY_JOB,
    });
  } catch (error) {
    next(error);
  }
});

// Get recommendation for a job
router.get('/:jobId/recommendation', async (_req, res, next) => {
  try {
    // TODO: Fetch the latest recommendation
    return res.json({ message: 'Recommendation retrieved' });
  } catch (error) {
    return next(error);
  }
});

export default router;
