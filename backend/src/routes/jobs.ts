// API Routes for Jobs / RFQs
// Public endpoints for job submission, pipeline queries, quotes, and telemetry

import express, { Router, Request, Response, NextFunction } from 'express';
import * as jobIntake from '../services/job-intake';
import { enqueueJob } from '../workers/queue';
import { QueueJobType } from '../types/queue';
import { AppError } from '../middleware/error';
import { listJobsByOrg, getRecommendationsForJob, getQuotesForJob } from '../db/queries';
import { getJobQuotes, getProjectSourcingMetrics } from '../services/sourcing-service';
import { getFormattedActivities, recordActivity } from '../services/activity-service';

const router: Router = express.Router();

// List all jobs / RFQ pipeline with stage filters and pagination
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';

    const stage = req.query.stage as string | undefined;
    const projectId = req.query.projectId as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await listJobsByOrg(orgId, {
      stage,
      projectId,
      page,
      limit,
    });

    // Enrich jobs with fit score and quotes summary for RFQ cards
    const enrichedData = await Promise.all(
      result.data.map(async (job) => {
        const [recs, quotesList] = await Promise.all([
          getRecommendationsForJob(job.id, orgId),
          getQuotesForJob(job.id, orgId),
        ]);

        const topFitScore = recs[0]?.fit_score ?? 85;
        const stageCapitalized =
          job.procurement_stage.charAt(0).toUpperCase() + job.procurement_stage.slice(1);

        let quotesSummary = `${quotesList.length}/5 received`;
        if (job.procurement_stage === 'commit' || job.procurement_stage === 'build') {
          quotesSummary = 'Awarded';
        } else if (quotesList.length === 0) {
          quotesSummary = 'Awaiting quotes';
        }

        let statusColor: 'info' | 'success' | 'warning' | 'danger' = 'info';
        if (job.procurement_stage === 'build' || job.procurement_stage === 'accept') {
          statusColor = 'success';
        } else if (job.procurement_stage === 'source' && quotesList.length === 0) {
          statusColor = 'warning';
        }

        return {
          id: job.id,
          code: job.rfq_code || `RFQ-${job.id.slice(0, 8).toUpperCase()}`,
          title: job.product_name ? `${job.product_name} (${job.company_name})` : job.company_name,
          companyName: job.company_name,
          productName: job.product_name,
          processType: job.process_type,
          materialType: job.material_type,
          volumeBand: job.volume_band,
          location: job.location,
          status: job.status,
          procurementStage: stageCapitalized,
          fitScore: topFitScore,
          quotesSummary,
          statusColor,
          targetCeilingNgn: job.target_ceiling_ngn,
          projectId: job.project_id,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
        };
      }),
    );

    return res.json({
      data: enrichedData,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
});

// Create a new job (draft)
router.post('/', async (req, res, next) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const createdBy = auth?.userId || 'unknown';
    const job = await jobIntake.createJob(req.body, orgId, createdBy);

    // Record activity
    await recordActivity({
      project_id: job.project_id,
      job_id: job.id,
      orgId,
      eventType: 'rfq_dispatched',
      title: 'RFQ Created',
      description: `New RFQ created for ${job.product_name} (${job.company_name})`,
      severity: 'info',
      actor: createdBy,
    });

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

    // Record activity
    const auth = res.locals.auth;
    const orgId = auth?.orgId || job.org_id || 'unknown';
    await recordActivity({
      project_id: job.project_id,
      job_id: job.id,
      orgId,
      eventType: 'rfq_dispatched',
      title: 'RFQ Submitted for Matching',
      description: `Analysis queued for ${job.product_name}`,
      severity: 'info',
    });

    res.json({
      ...job,
      queueJobId,
      queueStage: QueueJobType.CLASSIFY_JOB,
    });
  } catch (error) {
    next(error);
  }
});

// Get received quotes for a specific job/RFQ
router.get('/:jobId/quotes', async (req, res, next) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const quotesData = await getJobQuotes(req.params.jobId, orgId);
    res.json(quotesData);
  } catch (error) {
    next(error);
  }
});

// Get activity telemetry stream for a specific job/RFQ
router.get('/:jobId/activities', async (req, res, next) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const activities = await getFormattedActivities(orgId, {
      jobId: req.params.jobId,
      limit,
    });
    res.json({ activities });
  } catch (error) {
    next(error);
  }
});

// Get sourcing metrics for a specific job
router.get('/:jobId/sourcing-metrics', async (req, res, next) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const job = await jobIntake.getJob(req.params.jobId);
    if (!job) {
      throw new AppError(404, 'Job not found');
    }
    const metrics = await getProjectSourcingMetrics(job.project_id || job.id, orgId);
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

export default router;

