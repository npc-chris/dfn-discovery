/**
 * API Routes for Multi-Stage Manufacturing Process Routing (DAG)
 * Endpoints for graph resolution, cluster chain recommendations, and what-if simulation
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { getJobById, getAllActiveFactories } from '../db/queries';
import {
  routeManufacturingDAG,
  extractOrBuildDAG,
  computeCompositeChainScore,
  calculateTotalLandedCost,
} from '../services/dag-routing-service';
import { AppError } from '../middleware/error';

const router: Router = express.Router();

// Get the resolved Manufacturing DAG & Multi-Factory Cluster Recommendation for a job
router.get('/:jobId/routing-dag', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const job = await getJobById(req.params.jobId, orgId);

    if (!job) {
      throw new AppError(404, 'Job not found');
    }

    // Retrieve active candidate factories
    const candidateFactories = await getAllActiveFactories(orgId);

    // Compute DAG and multi-stage cluster chains
    const routingResult = await routeManufacturingDAG(job, candidateFactories);

    res.json({
      success: true,
      jobId: job.id,
      productName: job.product_name,
      dag: routingResult.dag,
      recommendations: routingResult.recommendations,
    });
  } catch (error) {
    next(error);
  }
});

// Run interactive simulation on custom factory assignments or logistics constraints
router.post('/:jobId/routing-dag/simulate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';
    const job = await getJobById(req.params.jobId, orgId);

    if (!job) {
      throw new AppError(404, 'Job not found');
    }

    const { customStages, customEdges, quantity } = req.body;

    const baseDag = extractOrBuildDAG(job);
    const stages = customStages || baseDag.stages;
    const edges = customEdges || baseDag.edges;

    const stageScores = stages.map((s: any) => s.stageFitScore || s.fitScore || 85);
    const stageWeights = stages.map((s: any) => s.criticalityWeight || s.criticality_weight || 1.0);
    const edgeFrictions = edges.map((e: any) => e.totalEdgeFriction || e.total_edge_friction || 0.02);

    const scoreResult = computeCompositeChainScore(stageScores, stageWeights, edgeFrictions);
    const tlcResult = calculateTotalLandedCost(stages, edges, quantity || 100);

    res.json({
      success: true,
      simulation: {
        compositeChainScore: scoreResult.compositeChainScore,
        stageGeometricMeanScore: scoreResult.stageGeometricMeanScore,
        totalLogisticsFriction: scoreResult.totalLogisticsFriction,
        totalLandedCostNgn: tlcResult.totalLandedCostNgn,
        totalLeadDays: tlcResult.totalLeadDays,
        totalDistanceKm: tlcResult.totalDistanceKm,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
