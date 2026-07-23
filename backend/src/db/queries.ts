import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Factory } from '@dfn/shared';
import type { ScoringResult } from '../services/core-intelligence';
import { db } from './client';
import { factories, jobs, recommendations } from './schema';

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export async function getJobById(jobId: string, orgId: string) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId as any), eq(jobs.org_id, orgId)))
    .limit(1);
  return job ?? null;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export async function getFactoriesByIds(factoryIds: string[] | undefined, orgId: string): Promise<Factory[]> {
  const conditions: any[] = [eq(factories.org_id, orgId)];
  if (Array.isArray(factoryIds) && factoryIds.length > 0) {
    conditions.push(inArray(factories.id, factoryIds));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
  const rows = await db.select().from(factories).where(whereClause);
  return rows as Factory[];
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

export async function getRecommendationsForJob(jobId: string, orgId: string) {
  return db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.job_id, jobId as any), eq(recommendations.org_id, orgId)))
    .orderBy(desc(recommendations.rank), desc(recommendations.fit_score));
}

export async function replaceRecommendationsForJob(
  jobId: string,
  scoringResults: ScoringResult[],
  orgId: string,
): Promise<void> {
  await db.delete(recommendations).where(and(eq(recommendations.job_id, jobId as any), eq(recommendations.org_id, orgId)));

  if (scoringResults.length === 0) return;

  await db.insert(recommendations).values(
    scoringResults.map((result) => ({
      job_id:            jobId as any,
      org_id:            orgId,
      factory_id:        result.factoryId as any,
      fit_score:         result.fitScore,
      feasibility_score: result.feasibilityScore,
      confidence_score:  result.confidenceScore,
      component_scores:  result.componentScores,
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
  orgId: string,
  patch: Record<string, unknown>,
) {
  return db
    .update(recommendations)
    .set(patch)
    .where(and(eq(recommendations.job_id, jobId as any), eq(recommendations.factory_id, factoryId as any), eq(recommendations.org_id, orgId)))
    .returning();
}
