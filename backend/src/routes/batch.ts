import { Router } from 'express';
import { createBatch, getBatchStatus, getBatchProgress, replayBatch } from '../services/batch-coordination';

const router: Router = Router();

/**
 * POST /batch
 * Submit a bulk request of jobs.
 */
router.post('/', async (req, res, next) => {
  try {
    const { idempotencyKey, jobs, metadata } = req.body;
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const createdBy = auth?.userId || 'unknown';
    const manifest = await createBatch({ idempotencyKey, orgId, createdBy, jobs, metadata });
    res.status(201).json(manifest);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /batch/:batchId
 * Get batch status and rollup counts.
 */
router.get('/:batchId', async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const status = await getBatchStatus(batchId);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /batch/:batchId/progress
 * Get batch progress percentage and stage metrics.
 */
router.get('/:batchId/progress', async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const progress = await getBatchProgress(batchId);
    res.json(progress);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /batch/:batchId/replay
 * Replay failed child jobs only.
 */
router.post('/:batchId/replay', async (req, res, next) => {
  try {
    const { batchId } = req.params;
    await replayBatch(batchId);
    res.json({ message: 'Batch replay initiated successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
