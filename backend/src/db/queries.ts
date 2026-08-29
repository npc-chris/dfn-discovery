import { and, desc, eq, inArray, sql, count, ne } from 'drizzle-orm';
import type { Factory } from '@dfn/shared';
import type { ScoringResult } from '../services/core-intelligence';
import { db } from './client';
import { factories, jobs, recommendations, projects, quotes, project_activities } from './schema';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProject(data: {
  org_id: string;
  title: string;
  description?: string | null;
  status?: string;
  budget_ceiling_ngn?: number | null;
  target_delivery_date?: Date | null;
  delivery_location?: any;
  created_by: string;
}) {
  const [project] = await db
    .insert(projects)
    .values({
      org_id: data.org_id,
      title: data.title,
      description: data.description ?? null,
      status: data.status ?? 'active',
      budget_ceiling_ngn: data.budget_ceiling_ngn ?? null,
      target_delivery_date: data.target_delivery_date ?? null,
      delivery_location: data.delivery_location ?? null,
      created_by: data.created_by,
    })
    .returning();
  return project;
}

export async function getProjectById(projectId: string, orgId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId as any), eq(projects.org_id, orgId)))
    .limit(1);
  return project ?? null;
}

export async function listProjectsByOrg(orgId: string, limit = 50) {
  return db
    .select()
    .from(projects)
    .where(eq(projects.org_id, orgId))
    .orderBy(desc(projects.created_at))
    .limit(limit);
}

export async function updateProject(
  projectId: string,
  orgId: string,
  patch: Partial<typeof projects.$inferInsert>,
) {
  const [updated] = await db
    .update(projects)
    .set({ ...patch, updated_at: new Date() })
    .where(and(eq(projects.id, projectId as any), eq(projects.org_id, orgId)))
    .returning();
  return updated ?? null;
}

// ---------------------------------------------------------------------------
// Jobs / RFQs
// ---------------------------------------------------------------------------

export async function getJobById(jobId: string, orgId: string) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId as any), eq(jobs.org_id, orgId)))
    .limit(1);
  return job ?? null;
}

export async function listJobsByOrg(
  orgId: string,
  options?: {
    projectId?: string;
    stage?: string;
    status?: string;
    page?: number;
    limit?: number;
  },
) {
  const conditions = [eq(jobs.org_id, orgId)];

  if (options?.projectId) {
    conditions.push(eq(jobs.project_id, options.projectId as any));
  }

  if (options?.stage && options.stage.toLowerCase() !== 'all') {
    conditions.push(eq(sql`LOWER(${jobs.procurement_stage})`, options.stage.toLowerCase()));
  }

  if (options?.status && options.status.toLowerCase() !== 'all') {
    conditions.push(eq(jobs.status, options.status));
  }

  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
  const offset = (page - 1) * limit;

  const whereClause = and(...conditions);

  const [totalResult] = await db
    .select({ count: count() })
    .from(jobs)
    .where(whereClause);

  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(jobs)
    .where(whereClause)
    .orderBy(desc(jobs.created_at))
    .limit(limit)
    .offset(offset);

  return {
    data: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function updateJobProcurementStage(
  jobId: string,
  orgId: string,
  stage: string,
) {
  const [updated] = await db
    .update(jobs)
    .set({ procurement_stage: stage, updated_at: new Date() })
    .where(and(eq(jobs.id, jobId as any), eq(jobs.org_id, orgId)))
    .returning();
  return updated ?? null;
}

export async function updateJob(
  jobId: string,
  orgId: string,
  patch: Partial<typeof jobs.$inferInsert>,
) {
  const [updated] = await db
    .update(jobs)
    .set({ ...patch, updated_at: new Date() })
    .where(and(eq(jobs.id, jobId as any), eq(jobs.org_id, orgId)))
    .returning();
  return updated ?? null;
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

// ---------------------------------------------------------------------------
// Quotes / Supplier Bids
// ---------------------------------------------------------------------------

export async function createQuote(data: {
  job_id: string;
  factory_id: string;
  org_id: string;
  unit_price_ngn: number;
  total_price_ngn: number;
  lead_time_days: number;
  status?: string;
  terms?: string | null;
  notes?: string | null;
  valid_until?: Date | null;
}) {
  const [quote] = await db
    .insert(quotes)
    .values({
      job_id: data.job_id as any,
      factory_id: data.factory_id as any,
      org_id: data.org_id,
      unit_price_ngn: data.unit_price_ngn,
      total_price_ngn: data.total_price_ngn,
      lead_time_days: data.lead_time_days,
      status: data.status ?? 'submitted',
      terms: data.terms ?? null,
      notes: data.notes ?? null,
      valid_until: data.valid_until ?? null,
    })
    .returning();
  return quote;
}

export async function getQuoteById(quoteId: string, orgId: string) {
  const [quote] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, quoteId as any), eq(quotes.org_id, orgId)))
    .limit(1);
  return quote ?? null;
}

export async function getQuotesForJob(jobId: string, orgId: string) {
  return db
    .select()
    .from(quotes)
    .where(and(eq(quotes.job_id, jobId as any), eq(quotes.org_id, orgId)))
    .orderBy(quotes.unit_price_ngn);
}

export async function getQuotesForJobs(jobIds: string[], orgId: string) {
  if (jobIds.length === 0) return [];
  return db
    .select()
    .from(quotes)
    .where(and(inArray(quotes.job_id, jobIds as any), eq(quotes.org_id, orgId)))
    .orderBy(quotes.unit_price_ngn);
}

export async function awardQuoteTransaction(
  quoteId: string,
  jobId: string,
  orgId: string,
) {
  // 1. Mark awarded quote as 'awarded'
  const [awardedQuote] = await db
    .update(quotes)
    .set({ status: 'awarded', updated_at: new Date() })
    .where(and(eq(quotes.id, quoteId as any), eq(quotes.org_id, orgId)))
    .returning();

  if (!awardedQuote) {
    throw new Error('Quote not found or unauthorized');
  }

  // 2. Reject other active quotes for this job
  await db
    .update(quotes)
    .set({ status: 'rejected', updated_at: new Date() })
    .where(
      and(
        eq(quotes.job_id, jobId as any),
        eq(quotes.org_id, orgId),
        ne(quotes.id, quoteId as any),
        eq(quotes.status, 'submitted'),
      ),
    );

  // 3. Transition the job procurement stage to 'commit'
  await db
    .update(jobs)
    .set({ procurement_stage: 'commit', updated_at: new Date() })
    .where(and(eq(jobs.id, jobId as any), eq(jobs.org_id, orgId)));

  return awardedQuote;
}

// ---------------------------------------------------------------------------
// Project Activities / Audit Stream
// ---------------------------------------------------------------------------

export async function insertActivity(data: {
  project_id?: string | null;
  job_id?: string | null;
  org_id: string;
  event_type: string;
  title: string;
  description: string;
  severity?: 'info' | 'success' | 'warning' | 'danger';
  metadata?: any;
  actor?: string | null;
}) {
  const [activity] = await db
    .insert(project_activities)
    .values({
      project_id: data.project_id as any ?? null,
      job_id: data.job_id as any ?? null,
      org_id: data.org_id,
      event_type: data.event_type,
      title: data.title,
      description: data.description,
      severity: data.severity ?? 'info',
      metadata: data.metadata ?? null,
      actor: data.actor ?? null,
    })
    .returning();
  return activity;
}

export async function listActivities(
  orgId: string,
  options?: {
    projectId?: string;
    jobId?: string;
    limit?: number;
  },
) {
  const conditions = [eq(project_activities.org_id, orgId)];

  if (options?.projectId) {
    conditions.push(eq(project_activities.project_id, options.projectId as any));
  }

  if (options?.jobId) {
    conditions.push(eq(project_activities.job_id, options.jobId as any));
  }

  const limit = Math.min(100, Math.max(1, options?.limit ?? 20));

  return db
    .select()
    .from(project_activities)
    .where(and(...conditions))
    .orderBy(desc(project_activities.created_at))
    .limit(limit);
}

