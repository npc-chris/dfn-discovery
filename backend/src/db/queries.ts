import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Factory } from '@dfn/shared';
import type { ScoringResult } from '../services/core-intelligence.ts';
import { db } from './client.ts';
import { factories, recommendations } from './schema.ts';

export async function getFactoriesByIds(factoryIds?: string[]): Promise<Factory[]> {
  let query = db.select().from(factories);

  if (Array.isArray(factoryIds) && factoryIds.length > 0) {
    query = query.where(inArray(factories.id, factoryIds));
  }

  return (await query) as Factory[];
}

export async function getRecommendationsForJob(jobId: string) {
  return db
    .select()
    .from(recommendations)
    .where(eq(recommendations.job_id, jobId as any))
    .orderBy(desc(recommendations.rank), desc(recommendations.fit_score));
}

export async function replaceRecommendationsForJob(jobId: string, scoringResults: ScoringResult[]): Promise<void> {
  await db.delete(recommendations).where(eq(recommendations.job_id, jobId as any));

  if (scoringResults.length === 0) return;

  await db.insert(recommendations).values(
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

export async function updateRecommendation(jobId: string, factoryId: string, patch: Record<string, unknown>) {
  return db
    .update(recommendations)
    .set(patch)
    .where(and(eq(recommendations.job_id, jobId as any), eq(recommendations.factory_id, factoryId as any)))
    .returning();
}
