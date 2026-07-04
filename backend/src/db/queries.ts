import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Factory } from '@dfn/shared';
import type { ScoringResult } from '../services/core-intelligence';
import { db } from './client';
import { factories, jobs, recommendations } from './schema';

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export async function getJobById(jobId: string, orgId?: string) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(
      orgId
        ? and(eq(jobs.id, jobId as any), eq(jobs.org_id, orgId))
        : eq(jobs.id, jobId as any),
    )
    .limit(1);
  return job ?? null;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export async function getFactoriesByIds(factoryIds?: string[], orgId?: string): Promise<Factory[]> {
  let query = db.select().from(factories);

  const conditions: any[] = [];
  if (Array.isArray(factoryIds) && factoryIds.length > 0) {
    conditions.push(inArray(factories.id, factoryIds));
  }
  if (orgId) {
    conditions.push(eq(factories.org_id, orgId));
  }
  if (conditions.length > 0) {
    query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  }

  return (await query) as Factory[];
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

export async function getRecommendationsForJob(jobId: string, orgId?: string) {
  return db
    .select()
    .from(recommendations)
    .where(
      orgId
        ? and(eq(recommendations.job_id, jobId as any), eq(recommendations.org_id, orgId))
        : eq(recommendations.job_id, jobId as any),
    )
    .orderBy(desc(recommendations.rank), desc(recommendations.fit_score));
}

export async function replaceRecommendationsForJob(
  jobId: string,
  scoringResults: ScoringResult[],
  orgId?: string,
): Promise<void> {
  await db.delete(recommendations).where(eq(recommendations.job_id, jobId as any));

  if (scoringResults.length === 0) return;

  await db.insert(recommendations).values(
    scoringResults.map((result) => ({
      job_id:            jobId as any,
      org_id:            orgId ?? 'unknown',   // populated from auth context in Phase 7
      factory_id:        result.factoryId as any,
      fit_score:         result.fitScore,
      feasibility_score: result.feasibilityScore,
      confidence_score:  result.confidenceScore,
      component_scores:  result.componentScores, // persisted for presentation layer read-back
      rank:              result.rank > 0 ? result.rank : null,
      evidence:          [],
      caveats:           result.gatePassed ? [] : [result.gateFaiureReason ?? 'Gate rules not satisfied'],
      version:           1,
    })),
  );
}

export async function updateRecommendation(
  jobId: string,
  factoryId: string,
  patch: Record<string, unknown>,
) {
  return db
    .update(recommendations)
    .set(patch)
    .where(and(eq(recommendations.job_id, jobId as any), eq(recommendations.factory_id, factoryId as any)))
    .returning();
}
