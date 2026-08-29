/**
 * Sourcing & Procurement Service
 *
 * Implements project-level sourcing KPIs, RFQ pipeline aggregation,
 * supplier quote ranking, and contract award transactions.
 */

import {
  getJobById,
  getProjectById,
  getQuotesForJob,
  getQuotesForJobs,
  getRecommendationsForJob,
  getFactoriesByIds,
  awardQuoteTransaction,
  listJobsByOrg,
} from '../db/queries';
import { recordActivity } from './activity-service';

export interface ProjectSourcingMetrics {
  projectStatus: string;
  currentStageIndex: number;
  totalStages: number;
  quoteCoverage: {
    percentage: number;
    received: number;
    invited: number;
  };
  bestLandedCost: {
    amountNgn: number;
    leadSupplier: string;
    targetCeilingNgn: number;
    varianceNgn: number;
  };
  targetDelivery: {
    leadDays: number;
    targetDate: string;
    status: 'on_schedule' | 'at_risk' | 'delayed';
  };
  actionNeededCount: number;
  actionItems: {
    id: string;
    type: string;
    description: string;
  }[];
}

export interface EnrichedQuote {
  id: string;
  supplierId: string;
  supplierName: string;
  unitBidNgn: number;
  totalBidNgn: number;
  leadTimeDays: number;
  fitScore: number;
  rankBadge?: 'Cheapest' | 'Fastest' | 'Best Match' | '';
  status: string;
  terms?: string | null;
  notes?: string | null;
  submittedAt: string;
}

export interface JobQuotesResponse {
  targetCeilingNgn: number;
  quotes: EnrichedQuote[];
}

const STAGE_ORDER = ['draft', 'source', 'commit', 'build', 'accept'];

/**
 * Compute Project-Level Sourcing Metrics for the 5-card KPI strip
 */
export async function getProjectSourcingMetrics(
  projectId: string,
  orgId: string,
): Promise<ProjectSourcingMetrics> {
  const project = await getProjectById(projectId, orgId);
  const jobsList = await listJobsByOrg(orgId, { projectId, limit: 100 });
  const projectJobs = jobsList.data;

  // Derive highest/dominant procurement stage
  let maxStageIdx = 1; // Default to 'source' (stage 2 of 5, index 1)
  for (const job of projectJobs) {
    const stageStr = (job.procurement_stage || 'draft').toLowerCase();
    const idx = STAGE_ORDER.indexOf(stageStr);
    if (idx !== -1 && idx > maxStageIdx) {
      maxStageIdx = idx;
    }
  }

  const stageName = STAGE_ORDER[maxStageIdx] || 'source';
  const displayStatus = stageName.charAt(0).toUpperCase() + stageName.slice(1);

  // Fetch all quotes for jobs in this project
  const jobIds = projectJobs.map((j) => j.id);
  const allQuotes = await getQuotesForJobs(jobIds, orgId);

  // Quote coverage computation
  const targetInvitedCount = Math.max(projectJobs.length * 5, 5); // Target 5 quotes per RFQ
  const receivedQuotesCount = allQuotes.length;
  const coveragePct = Math.min(
    100,
    Math.round((receivedQuotesCount / Math.max(1, targetInvitedCount)) * 100),
  );

  // Best landed cost computation
  const targetCeilingNgn = project?.budget_ceiling_ngn || 15000000;
  let bestLandedCostNgn = 0;
  let leadSupplierName = 'Awaiting Bids';

  if (allQuotes.length > 0) {
    // Find quote with lowest total price
    const sortedByPrice = [...allQuotes].sort((a, b) => a.total_price_ngn - b.total_price_ngn);
    const bestQuote = sortedByPrice[0];
    bestLandedCostNgn = bestQuote.total_price_ngn;

    // Fetch factory name
    const factories = await getFactoriesByIds([bestQuote.factory_id], orgId);
    if (factories[0]?.factory_name) {
      leadSupplierName = factories[0].factory_name;
    }
  }

  const varianceNgn = bestLandedCostNgn > 0 ? bestLandedCostNgn - targetCeilingNgn : 0;

  // Target delivery calculation
  const minLeadDays = allQuotes.length > 0
    ? Math.min(...allQuotes.map((q) => q.lead_time_days))
    : 7;

  const targetDate = project?.target_delivery_date
    ? new Date(project.target_delivery_date).toISOString()
    : new Date(Date.now() + minLeadDays * 24 * 60 * 60 * 1000).toISOString();

  // Action needed items
  const submittedQuotes = allQuotes.filter((q) => q.status === 'submitted');
  const actionItems: { id: string; type: string; description: string }[] = [];

  if (submittedQuotes.length > 0) {
    actionItems.push({
      id: 'act-quotes-review',
      type: 'quote_review',
      description: `${submittedQuotes.length} supplier quote${submittedQuotes.length > 1 ? 's' : ''} awaiting review`,
    });
  }

  return {
    projectStatus: displayStatus,
    currentStageIndex: maxStageIdx + 1, // 1-indexed (e.g. 2 of 5 for Source)
    totalStages: 5,
    quoteCoverage: {
      percentage: coveragePct,
      received: receivedQuotesCount,
      invited: targetInvitedCount,
    },
    bestLandedCost: {
      amountNgn: bestLandedCostNgn,
      leadSupplier: leadSupplierName,
      targetCeilingNgn,
      varianceNgn,
    },
    targetDelivery: {
      leadDays: minLeadDays,
      targetDate,
      status: 'on_schedule',
    },
    actionNeededCount: actionItems.length,
    actionItems,
  };
}

/**
 * Get all received quotes for an RFQ/job enriched with factory names and rankings
 */
export async function getJobQuotes(jobId: string, orgId: string): Promise<JobQuotesResponse> {
  const job = await getJobById(jobId, orgId);
  const targetCeilingNgn = job?.target_ceiling_ngn || 15000000;

  const rawQuotes = await getQuotesForJob(jobId, orgId);
  const recommendations = await getRecommendationsForJob(jobId, orgId);

  // Build recommendation score map (factory_id -> fit_score)
  const fitScoreMap = new Map<string, number>();
  for (const rec of recommendations) {
    fitScoreMap.set(rec.factory_id, rec.fit_score);
  }

  // Load factories
  const factoryIds = [...new Set(rawQuotes.map((q) => q.factory_id))];
  const factories = await getFactoriesByIds(factoryIds, orgId);
  const factoryMap = new Map<string, string>();
  for (const f of factories) {
    factoryMap.set(f.id, f.factory_name || 'Factory ' + f.id.slice(0, 6));
  }

  // Determine rankings (Cheapest, Fastest)
  const minPrice = rawQuotes.length > 0 ? Math.min(...rawQuotes.map((q) => q.total_price_ngn)) : null;
  const minLeadTime = rawQuotes.length > 0 ? Math.min(...rawQuotes.map((q) => q.lead_time_days)) : null;

  const enrichedQuotes: EnrichedQuote[] = rawQuotes.map((q) => {
    let rankBadge: 'Cheapest' | 'Fastest' | 'Best Match' | '' = '';
    if (minPrice !== null && q.total_price_ngn === minPrice) {
      rankBadge = 'Cheapest';
    } else if (minLeadTime !== null && q.lead_time_days === minLeadTime) {
      rankBadge = 'Fastest';
    }

    const fitScore = fitScoreMap.get(q.factory_id) || 85;

    return {
      id: q.id,
      supplierId: q.factory_id,
      supplierName: factoryMap.get(q.factory_id) || 'Precision Works Lagos',
      unitBidNgn: q.unit_price_ngn,
      totalBidNgn: q.total_price_ngn,
      leadTimeDays: q.lead_time_days,
      fitScore,
      rankBadge,
      status: q.status,
      terms: q.terms,
      notes: q.notes,
      submittedAt: q.submitted_at ? new Date(q.submitted_at).toISOString() : new Date().toISOString(),
    };
  });

  return {
    targetCeilingNgn,
    quotes: enrichedQuotes,
  };
}

/**
 * Award a quote to a supplier, transitioning RFQ stage to Commit and recording audit log
 */
export async function awardQuote(
  quoteId: string,
  jobId: string,
  orgId: string,
  actor = 'Procurement Lead',
) {
  const awardedQuote = await awardQuoteTransaction(quoteId, jobId, orgId);
  const job = await getJobById(jobId, orgId);

  // Fetch supplier name
  const factories = await getFactoriesByIds([awardedQuote.factory_id], orgId);
  const supplierName = factories[0]?.factory_name || 'Supplier';

  // Log activity
  await recordActivity({
    project_id: job?.project_id,
    job_id: jobId,
    orgId,
    eventType: 'quote_awarded',
    title: 'Quote Awarded',
    description: `Contract awarded to ${supplierName} for ₦${awardedQuote.total_price_ngn.toLocaleString()} (RFQ: ${job?.rfq_code || job?.product_name || jobId})`,
    severity: 'success',
    actor,
    metadata: {
      quoteId,
      supplierId: awardedQuote.factory_id,
      supplierName,
      totalPriceNgn: awardedQuote.total_price_ngn,
      leadTimeDays: awardedQuote.lead_time_days,
    },
  });

  return awardedQuote;
}
