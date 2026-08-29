/**
 * API Routes for Projects
 * Endpoints for multi-part engineering project grouping, sourcing metrics, and activities
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { createProject, getProjectById, listProjectsByOrg, listJobsByOrg, getRecommendationsForJob, getQuotesForJob } from '../db/queries';
import { getProjectSourcingMetrics } from '../services/sourcing-service';
import { getFormattedActivities, recordActivity } from '../services/activity-service';
import { AppError } from '../middleware/error';

const router: Router = express.Router();

// Create a new project
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const createdBy = auth?.userId || 'unknown';

    const project = await createProject({
      org_id: orgId,
      title: req.body.title,
      description: req.body.description,
      status: req.body.status || 'active',
      budget_ceiling_ngn: req.body.budget_ceiling_ngn,
      target_delivery_date: req.body.target_delivery_date ? new Date(req.body.target_delivery_date) : null,
      delivery_location: req.body.delivery_location,
      created_by: createdBy,
    });

    await recordActivity({
      project_id: project.id,
      orgId,
      eventType: 'milestone_updated',
      title: 'Project Created',
      description: `Project "${project.title}" created with budget ceiling ₦${(project.budget_ceiling_ngn || 0).toLocaleString()}`,
      severity: 'info',
      actor: createdBy,
    });

    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

// List projects for the organization
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const projectsList = await listProjectsByOrg(orgId);
    res.json({ data: projectsList, total: projectsList.length });
  } catch (error) {
    next(error);
  }
});

// Get a project by ID
router.get('/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const project = await getProjectById(req.params.projectId, orgId);

    if (!project) {
      throw new AppError(404, 'Project not found');
    }

    res.json(project);
  } catch (error) {
    next(error);
  }
});

// Get project-level sourcing metrics (powers the 5 KPI cards in the dashboard)
router.get('/:projectId/metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const metrics = await getProjectSourcingMetrics(req.params.projectId, orgId);
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

// Get all RFQs belonging to this project (left collapsible pipeline panel)
router.get('/:projectId/rfqs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const stage = req.query.stage as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await listJobsByOrg(orgId, {
      projectId: req.params.projectId,
      stage,
      page,
      limit,
    });

    // Enrich RFQ cards
    const enrichedData = await Promise.all(
      result.data.map(async (job) => {
        const [recs, quotesList] = await Promise.all([
          getRecommendationsForJob(job.id, orgId),
          getQuotesForJob(job.id, orgId),
        ]);

        const topFitScore = recs[0]?.fit_score ?? 88;
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
          procurementStage: stageCapitalized,
          fitScore: topFitScore,
          quotesSummary,
          statusColor,
        };
      }),
    );

    res.json({
      data: enrichedData,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
});

// Get project activity feed (right collapsible telemetry stream)
router.get('/:projectId/activities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const activities = await getFormattedActivities(orgId, {
      projectId: req.params.projectId,
      limit,
    });

    res.json({ activities });
  } catch (error) {
    next(error);
  }
});

export default router;
