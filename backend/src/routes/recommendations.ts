/**
 * Recommendations Routes
 * Endpoints for formatted recommendation presentation and reports
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getPresentationLayer } from '../services/presentation-layer';
import { getRecommendationsForJob, getFactoriesByIds, getJobById } from '../db/queries';

const router = Router();

// ---------------------------------------------------------------------------
// Route Handler Implementations (Exported for testability)
// ---------------------------------------------------------------------------

export async function getRecommendationsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId } = req.params;
    const topN = Math.min(Number(req.query.topN ?? 5), 10);

    // Load raw DB records
    const dbRecs = await getRecommendationsForJob(jobId);
    if (!dbRecs || dbRecs.length === 0) {
      return res.status(404).json({ error: 'No recommendations found for this job' });
    }

    // Load the associated factories
    const factoryIds = [...new Set(dbRecs.map((r: any) => r.factory_id as string))];
    const factories = await getFactoriesByIds(factoryIds);
    const factoryMap = Object.fromEntries(factories.map((f: any) => [f.id, f]));

    // Reconstruct ScoringResult shapes for the presentation layer
    const jobRecord = await getJobById(jobId);
    if (!jobRecord) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const layer = getPresentationLayer();

    // Format each recommendation (capped at topN)
    const scoringResults = dbRecs.slice(0, topN).map(dbRecToScoringResult);
    const formatted = await Promise.all(
      scoringResults.map((sr) =>
        layer.formatRecommendation(sr, jobRecord as any, factoryMap[sr.factoryId]),
      ),
    );

    const summary = layer.formatRecommendationSummary(jobRecord as any, formatted);
    return res.json(summary);
  } catch (error) {
    return next(error);
  }
}

export async function getTopRecommendationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId } = req.params;

    const dbRecs = await getRecommendationsForJob(jobId);
    if (!dbRecs || dbRecs.length === 0) {
      return res.status(404).json({ error: 'No recommendations found for this job' });
    }

    const top = dbRecs[0] as any;
    const factories = await getFactoriesByIds([top.factory_id]);
    const factory = factories[0];

    const jobRecord = await getJobById(jobId);
    if (!jobRecord) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const layer = getPresentationLayer();
    const formatted = await layer.formatRecommendation(
      dbRecToScoringResult(top),
      jobRecord as any,
      factory,
    );

    return res.json(formatted);
  } catch (error) {
    return next(error);
  }
}

export async function getDetailedReportHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId } = req.params;
    const format = (req.query.format as 'html' | 'json') ?? 'html';

    const dbRecs = await getRecommendationsForJob(jobId);
    if (!dbRecs || dbRecs.length === 0) {
      return res.status(404).json({ error: 'No recommendations found for this job' });
    }

    const factoryIds = [...new Set(dbRecs.map((r: any) => r.factory_id as string))];
    const factories = await getFactoriesByIds(factoryIds);
    const factoryMap = Object.fromEntries(factories.map((f: any) => [f.id, f]));

    const jobRecord = await getJobById(jobId);
    if (!jobRecord) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const layer = getPresentationLayer();
    const scoringResults = dbRecs.map(dbRecToScoringResult);
    const formatted = await Promise.all(
      scoringResults.map((sr) =>
        layer.formatRecommendation(sr, jobRecord as any, factoryMap[sr.factoryId]),
      ),
    );

    const summary = layer.formatRecommendationSummary(jobRecord as any, formatted);
    const report = await layer.generateDetailedReport(summary, formatted, format);

    if (format === 'html') {
      res.setHeader('Content-Type', 'text/html');
      return res.send(report);
    }

    return res.json(JSON.parse(report));
  } catch (error) {
    return next(error);
  }
}

export async function getComparisonTableHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId } = req.params;
    const topN = Math.min(Number(req.query.topN ?? 3), 5);

    const dbRecs = await getRecommendationsForJob(jobId);
    if (!dbRecs || dbRecs.length === 0) {
      return res.status(404).json({ error: 'No recommendations found for this job' });
    }

    const factoryIds = [...new Set(dbRecs.map((r: any) => r.factory_id as string))];
    const factories = await getFactoriesByIds(factoryIds);
    const factoryMap = Object.fromEntries(factories.map((f: any) => [f.id, f]));

    const jobRecord = await getJobById(jobId);
    if (!jobRecord) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const layer = getPresentationLayer();
    const scoringResults = dbRecs.slice(0, topN).map(dbRecToScoringResult);
    const formatted = await Promise.all(
      scoringResults.map((sr) =>
        layer.formatRecommendation(sr, jobRecord as any, factoryMap[sr.factoryId]),
      ),
    );

    const table = layer.buildComparisonTable(formatted, topN);
    return res.json(table);
  } catch (error) {
    return next(error);
  }
}

export async function getExplanationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId, factoryId } = req.params;
    const style = (req.query.style as 'executive' | 'technical' | 'detailed') ?? 'technical';

    const dbRecs = await getRecommendationsForJob(jobId);
    const dbRec = dbRecs?.find((r: any) => r.factory_id === factoryId);
    if (!dbRec) {
      return res
        .status(404)
        .json({ error: 'No recommendation found for this job / factory combination' });
    }

    const factories = await getFactoriesByIds([factoryId]);
    const factory = factories[0];

    const jobRecord = await getJobById(jobId);
    if (!jobRecord) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const layer = getPresentationLayer();
    const scoringResult = dbRecToScoringResult(dbRec as any);
    const explanation = await layer.generateExplanation(
      scoringResult,
      jobRecord as any,
      factory,
      style,
    );

    // Extract key points from the explanation text
    const keyPoints = explanation
      .split('\n')
      .filter((line) => line.trim().startsWith('•') || line.trim().startsWith('-'))
      .map((line) => line.replace(/^[•\-]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 5);

    return res.json({ explanation, keyPoints });
  } catch (error) {
    return next(error);
  }
}

// ---------------------------------------------------------------------------
// Route Mapping
// ---------------------------------------------------------------------------

router.get('/:jobId', getRecommendationsHandler);
router.get('/:jobId/top', getTopRecommendationHandler);
router.get('/:jobId/report', getDetailedReportHandler);
router.get('/:jobId/comparison', getComparisonTableHandler);
router.get('/:jobId/:factoryId/explanation', getExplanationHandler);

// ---------------------------------------------------------------------------
// Internal helper — map DB row to ScoringResult shape
// ---------------------------------------------------------------------------

export function dbRecToScoringResult(row: Record<string, any>): import('../services/core-intelligence').ScoringResult {
  const componentScores = typeof row.component_scores === 'object' && row.component_scores !== null
    ? row.component_scores
    : {
        processMatch:          0,
        materialMatch:         0,
        capacityMatch:         0,
        geographyAndLogistics: 0,
        marketAccess:          0,
        evidenceConfidence:    0,
      };

  const caveats: string[] = Array.isArray(row.caveats) ? row.caveats : [];
  const gatePassed = caveats.length === 0;

  return {
    recommendationId:  row.id ?? `${row.job_id}-${row.factory_id}`,
    jobId:             row.job_id,
    factoryId:         row.factory_id,
    fitScore:          row.fit_score ?? 0,
    feasibilityScore:  row.feasibility_score ?? 0,
    confidenceScore:   row.confidence_score ?? 0,
    componentScores,
    evidenceCount:     Array.isArray(row.evidence) ? row.evidence.length : 0,
    confidencePenalty: 0,
    gatePassed,
    gateFaiureReason:  !gatePassed ? caveats[0] : undefined,
    rank:              row.rank ?? 0,
  };
}

export default router;
