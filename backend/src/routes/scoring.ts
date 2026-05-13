/**
 * Scoring Routes
 * Endpoints for Core Intelligence job scoring and factory ranking
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getCoreIntelligence } from '../services/core-intelligence.ts';
import { getJob } from '../services/job-intake.ts';
import { db } from '../db/client.ts';
import { factories, recommendations } from '../db/schema.ts';
import { desc, eq, inArray } from 'drizzle-orm';
import type { EvidenceItem } from '@dfn/shared';
import type { ScoringResult } from '../services/core-intelligence.ts';

type DbClient = typeof db;

export async function loadFactories(factoryIds?: string[], database: DbClient = db) {
  let query = database.select().from(factories);

  if (Array.isArray(factoryIds) && factoryIds.length > 0) {
    query = query.where(inArray(factories.id, factoryIds));
  }

  return (await query) as any[];
}

export async function buildEvidenceMap(factoryRows: { id: string }[]): Promise<Record<string, EvidenceItem[]>> {
  const evidenceMap: Record<string, EvidenceItem[]> = {};

  for (const factory of factoryRows) {
    evidenceMap[factory.id] = [];
  }

  return evidenceMap;
}

export async function scoreJobAgainstFactories(
  jobId: string,
  factoryIds?: string[],
  jobLoader: typeof getJob = getJob,
  database: DbClient = db,
  scorer = getCoreIntelligence(),
): Promise<ScoringResult[]> {
  const job = await jobLoader(jobId);
  if (!job) {
    const error = new Error('Job not found');
    (error as any).statusCode = 404;
    throw error;
  }

  const factoryRows = await loadFactories(factoryIds, database);
  const evidenceMap = await buildEvidenceMap(factoryRows);

  return scorer.scoreJob({ jobId, job, factories: factoryRows as any, evidence: evidenceMap });
}

export async function persistRecommendations(
  jobId: string,
  scoringResults: ScoringResult[],
  database: DbClient = db,
): Promise<void> {
  await database.delete(recommendations).where(eq(recommendations.job_id, jobId as any));

  if (scoringResults.length === 0) return;

  await database.insert(recommendations).values(
    scoringResults.map((result) => ({
      job_id: jobId as any,
      factory_id: result.factoryId as any,
      fit_score: result.fitScore,
      feasibility_score: result.feasibilityScore,
      confidence_score: result.confidenceScore,
      rank: result.rank > 0 ? result.rank : null,
      evidence: [],
      caveats: result.gatePassed ? [] : [result.gateFaiureReason || 'Recommendation did not pass gate rules'],
      version: 1,
    })),
  );
}

export async function getStoredRecommendations(jobId: string, database: DbClient = db) {
  return database
    .select()
    .from(recommendations)
    .where(eq(recommendations.job_id, jobId as any))
    .orderBy(desc(recommendations.rank), desc(recommendations.fit_score));
}

export async function getComponentAnalysis(
  jobId: string,
  factoryId: string,
  jobLoader: typeof getJob = getJob,
  database: DbClient = db,
  scorer = getCoreIntelligence(),
) {
  const job = await jobLoader(jobId);
  if (!job) {
    const error = new Error('Job not found');
    (error as any).statusCode = 404;
    throw error;
  }

  const [factory] = (await database.select().from(factories).where(eq(factories.id, factoryId as any)).limit(1)) as any[];
  if (!factory) {
    const error = new Error('Factory not found');
    (error as any).statusCode = 404;
    throw error;
  }

  const evidenceMap = await buildEvidenceMap([factory]);
  const [result] = await scorer.scoreJob({ jobId, job, factories: [factory], evidence: evidenceMap });

  if (!result) {
    const error = new Error('Recommendation analysis unavailable');
    (error as any).statusCode = 404;
    throw error;
  }

  return {
    jobId,
    factoryId,
    recommendationId: result.recommendationId,
    fitScore: result.fitScore,
    feasibilityScore: result.feasibilityScore,
    confidenceScore: result.confidenceScore,
    confidencePenalty: result.confidencePenalty,
    gatePassed: result.gatePassed,
    gateFailureReason: result.gateFaiureReason,
    evidenceCount: result.evidenceCount,
    componentScores: result.componentScores,
  };
}

const router = Router();

/**
 * POST /scoring/score-job
 * Score a job against available factories
 *
 * Request:
 * {
 *   jobId: string;
 *   factoryIds?: string[];  // If not provided, score against all
 * }
 *
 * Response: Array of ScoringResult with fit/feasibility scores
 *
 * TODO: Parse request body and validate
 * TODO: Fetch job and factories from database
 * TODO: Call core intelligence scoring
 * TODO: Return scored results
 */
router.post('/score-job', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId, factoryIds } = req.body || {};
    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    const results = await scoreJobAgainstFactories(jobId, factoryIds);

    return res.json(results);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /scoring/rank-recommendations
 * Rank scored factories by fit and apply gate rules
 *
 * Request:
 * {
 *   jobId: string;
 *   topN?: number;  // Default: 5
 * }
 *
 * Response: Array of ranked ScoringResult, filtered by gate rules
 *
 * TODO: Fetch all scores for job
 * TODO: Call core intelligence ranking
 * TODO: Apply recommendation gate rules
 * TODO: Return top N recommendations
 */
router.post('/rank-recommendations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId, factoryIds, topN = 5 } = req.body || {};
    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    const scorer = getCoreIntelligence();
    const scored = await scoreJobAgainstFactories(jobId, factoryIds, getJob, db, scorer);
    const ranked = (await scorer.rankRecommendations(scored)).slice(0, Number(topN) || 5);

    await persistRecommendations(jobId, ranked);

    return res.json(ranked);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /scoring/job-score/:jobId
 * Get current scoring results for a job
 *
 * Response: Array of ScoringResult or empty if not scored yet
 *
 * TODO: Query recommendations table for jobId
 * TODO: Return scoring details
 * TODO: Return 404 if no scores found
 */
router.get('/job-score/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    const rows = await getStoredRecommendations(jobId);

    if (!rows.length) {
      return res.status(404).json({ error: 'No recommendations found for job' });
    }

    return res.json(rows);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /scoring/component-analysis/:jobId/:factoryId
 * Get detailed component score breakdown for debugging
 *
 * Response: Component scores with explanation for each component
 *
 * TODO: Fetch recommendation from database
 * TODO: Return component breakdown
 * TODO: Include confidence penalties applied
 */
router.get('/component-analysis/:jobId/:factoryId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId, factoryId } = req.params;
    const analysis = await getComponentAnalysis(jobId, factoryId);
    return res.json(analysis);
  } catch (error) {
    next(error);
  }
});

export default router;
