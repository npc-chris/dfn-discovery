/**
 * Queue Routes
 * Endpoints for monitoring and managing async job queue
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  getJobQueueStatus,
  getQueueJobStatus,
  QueueJobStatus,
  replayQueueJob,
  getQueueStats,
} from '../workers/queue';

const router: Router = Router();

/**
 * GET /queue/job/:jobId
 * Get all queue job statuses for a DFN job (in order)
 *
 * Response:
 * [
 *   {
 *     id: string,
 *     queue_type: string,
 *     status: 'pending' | 'processing' | 'completed' | 'failed',
 *     retries: number,
 *     error?: string,
 *     result?: {...},
 *     created_at: ISO date,
 *     completed_at?: ISO date
 *   }
 * ]
 */
router.get('/job/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;

    const queueJobs = await getJobQueueStatus(jobId);

    return res.json(queueJobs);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /queue/job/:jobId/progress
 * Get overall job progress through all queue stages
 *
 * Optional query params:
 * - wait (milliseconds): Long-polling timeout. If provided, will wait up to this
 *   many ms for the job status to change before returning. Useful for real-time
 *   progress updates in the UI.
 *
 * Response:
 * {
 *   jobId: string,
 *   status: 'pending' | 'processing' | 'completed' | 'failed',
 *   percentComplete: number (0-100),
 *   currentStage: string,
 *   completedStages: string[],
 *   remainingStages: string[],
 *   estimatedRemainingSeconds: number | null
 * }
 */
router.get('/job/:jobId/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    const waitMs = parseInt(req.query.wait as string) || 0;

    const getProgress = async () => {
      const queueJobs = await getJobQueueStatus(jobId);
      if (queueJobs.length === 0) {
        return res.status(404).json({ error: 'No queue jobs found for this job' });
      }

      // Calculate progress
      const completed = queueJobs.filter((j) => j.status === QueueJobStatus.Completed).length;
      const failed = queueJobs.filter((j) => j.status === QueueJobStatus.Failed).length;
      const percentComplete = Math.round((completed / queueJobs.length) * 100);

      // Current stage is the last job started
      let currentStage = 'pending';
      for (const job of [...queueJobs].reverse()) {
        if (job.status !== 'pending') {
          currentStage = job.queue_type;
          break;
        }
      }

      // Completed and remaining stages
      const completedStages = queueJobs
        .filter((j) => j.status === QueueJobStatus.Completed)
        .map((j) => j.queue_type);
      const remainingStages = queueJobs
        .filter((j) => j.status === QueueJobStatus.Pending)
        .map((j) => j.queue_type);

      // Estimate remaining time (rough: 2 seconds per stage average)
      const estimatedRemainingSeconds = remainingStages.length > 0 ? remainingStages.length * 2 : null;

      // Determine overall status
      let overallStatus = 'pending';
      if (failed > 0) {
        overallStatus = 'failed';
      } else if (completed === queueJobs.length) {
        overallStatus = 'completed';
      } else if (completed > 0) {
        overallStatus = 'processing';
      }

      return {
        jobId,
        status: overallStatus,
        percentComplete,
        currentStage,
        completedStages,
        remainingStages,
        estimatedRemainingSeconds,
      };
    };

    // If no wait requested, return immediately
    if (waitMs <= 0) {
      return res.json(await getProgress());
    }

    // Long-polling: check progress, wait for change, or timeout
    const startStatus = await getProgress();
    const startTime = Date.now();

    // Poll for changes every 500ms until wait timeout
    const pollInterval = setInterval(async () => {
      try {
        const currentStatus = await getProgress();

        // Check if status changed
        if (JSON.stringify(startStatus) !== JSON.stringify(currentStatus)) {
          clearInterval(pollInterval);
          return res.json(currentStatus);
        }

        // Check if we've exceeded wait timeout
        if (Date.now() - startTime > waitMs) {
          clearInterval(pollInterval);
          return res.json(currentStatus);
        }
      } catch (err) {
        clearInterval(pollInterval);
        return next(err);
      }
    }, 500);

    return;
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /queue/:queueJobId
 * Get status and details of a specific queue job
 *
 * Response:
 * {
 *   id: string,
 *   job_id: string,
 *   queue_type: string,
 *   status: string,
 *   payload: {...},
 *   result?: {...},
 *   error?: string,
 *   retries: number,
 *   created_at: ISO date,
 *   completed_at?: ISO date
 * }
 */
router.get('/:queueJobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { queueJobId } = req.params;

    const queueJob = await getQueueJobStatus(queueJobId);

    if (!queueJob) {
      return res.status(404).json({ error: `Queue job not found: ${queueJobId}` });
    }

    return res.json(queueJob);
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /queue/:queueJobId/replay
 * Replay a failed or completed queue job with optional payload override
 *
 * Request:
 * {
 *   payload?: {...}  // Optional: override payload, or use original if omitted
 * }
 *
 * Response:
 * {
 *   newQueueJobId: string,
 *   originalQueueJobId: string,
 *   message: 'Queue job replayed'
 * }
 */
router.post('/:queueJobId/replay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { queueJobId } = req.params;
    const { payload: overridePayload } = req.body;

    const original = await getQueueJobStatus(queueJobId);
    if (!original) {
      return res.status(404).json({ error: `Queue job not found: ${queueJobId}` });
    }

    // Call worker to create a replayed queued job
    try {
      const newQueueJobId = await replayQueueJob(queueJobId, overridePayload);
      return res.json({
        newQueueJobId,
        originalQueueJobId: queueJobId,
        message: 'Queue job replayed',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || String(err) });
    }
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /queue/stats
 * Get queue health metrics and statistics
 *
 * Response:
 * {
 *   queued: number,
 *   processing: number,
 *   completed: number,
 *   failed: number,
 *   averageProcessingTimeMs: number,
 *   successRate: number (0-100),
 *   oldestPendingJobAgeSeconds: number | null
 * }
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Use worker helper to compute stats
    const stats = await getQueueStats();
    return res.json(stats);
  } catch (error) {
    return next(error);
  }
});

export default router;
