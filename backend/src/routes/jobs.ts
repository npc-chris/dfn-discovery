// API Routes for Jobs
// Public endpoints for job submission and retrieval

import express from 'express';

const router = express.Router();

// Create a new job (draft)
router.post('/', async (req, res) => {
  try {
    // TODO: validate input, call job-intake.createJob
    res.status(201).json({ message: 'Job created' });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

// Get a job by ID
router.get('/:jobId', async (req, res) => {
  try {
    // TODO: call job-intake.getJob
    res.json({ message: 'Job retrieved' });
  } catch (error) {
    res.status(404).json({ error: 'Job not found' });
  }
});

// Submit a job for intake and analysis
router.post('/:jobId/submit', async (req, res) => {
  try {
    // TODO: call job-intake.submitJob, enqueue extraction and scoring
    res.json({ message: 'Job submitted' });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

// Get recommendation for a job
router.get('/:jobId/recommendation', async (req, res) => {
  try {
    // TODO: fetch the latest recommendation
    res.json({ message: 'Recommendation retrieved' });
  } catch (error) {
    res.status(404).json({ error: 'Recommendation not found' });
  }
});

export default router;
