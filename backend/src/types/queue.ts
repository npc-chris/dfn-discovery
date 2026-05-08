/**
 * Queue Job Types and Constants
 *
 * Defines all asynchronous job types processed by queue workers.
 * Each job type corresponds to a service responsibility.
 *
 * Queue processing flow:
 * 1. Job submitted → enqueue 'classify-job'
 * 2. classify-job complete → enqueue 'extract-evidence'
 * 3. extract-evidence complete → enqueue 'score-fit'
 * 4. score-fit complete → enqueue 'enrich-logistics', 'refresh-market-signals', 'refresh-site-brief'
 * 5. All enrichment complete → enqueue 'generate-recommendation-brief'
 * 6. Recommendation generated → mark job as complete
 */

/**
 * Queue job types corresponding to service boundaries
 */
export enum QueueJobType {
  // Job normalization: extract, classify, and normalize job data
  CLASSIFY_JOB = 'classify-job',

  // AI extraction: extract structured data from attachments
  EXTRACT_EVIDENCE = 'extract-evidence',

  // Core intelligence: score job against factories
  SCORE_FIT = 'score-fit',

  // Enrichment services (can run in parallel)
  ENRICH_LOGISTICS = 'enrich-logistics',
  REFRESH_MARKET_SIGNALS = 'refresh-market-signals',
  REFRESH_SITE_BRIEF = 'refresh-site-brief',

  // Presentation: format recommendations for UI
  GENERATE_RECOMMENDATION_BRIEF = 'generate-recommendation-brief',
}

/**
 * Base queue job payload structure
 */
export interface QueueJob {
  id: string; // UUID
  type: QueueJobType;
  jobId: string; // DFN job ID
  payload: Record<string, unknown>; // Type-specific data
  retries: number;
  maxRetries: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  result?: Record<string, unknown>;
  version: number; // For idempotency
}

/**
 * Type-specific payload interfaces
 */

export interface ClassifyJobPayload {
  jobId: string;
}

export interface ExtractEvidencePayload {
  jobId: string;
  attachmentIds?: string[]; // If null, extract from all
  instructions?: string; // Custom extraction instructions
}

export interface ScoreFitPayload {
  jobId: string;
  factoryIds?: string[]; // If null, score against all known factories
}

export interface EnrichLogisticsPayload {
  jobId: string;
  factoryIds: string[];
}

export interface RefreshMarketSignalsPayload {
  jobId: string;
  productType: string;
}

export interface RefreshSiteBriefPayload {
  jobId: string;
  factoryIds: string[];
}

export interface GenerateRecommendationBriefPayload {
  jobId: string;
  topN?: number; // Default: 5, number of recommendations to present
}

/**
 * Queue configuration constants
 */
export const QUEUE_CONFIG = {
  // Default retry policy
  DEFAULT_MAX_RETRIES: 3,
  DEFAULT_RETRY_DELAY_MS: 1000,
  EXPONENTIAL_BACKOFF_MULTIPLIER: 2,

  // Job timeouts (in milliseconds)
  CLASSIFY_JOB_TIMEOUT: 30 * 1000, // 30 seconds
  EXTRACT_EVIDENCE_TIMEOUT: 2 * 60 * 1000, // 2 minutes (AI can be slow)
  SCORE_FIT_TIMEOUT: 60 * 1000, // 1 minute
  ENRICH_LOGISTICS_TIMEOUT: 30 * 1000, // 30 seconds
  REFRESH_MARKET_SIGNALS_TIMEOUT: 30 * 1000, // 30 seconds
  REFRESH_SITE_BRIEF_TIMEOUT: 30 * 1000, // 30 seconds
  GENERATE_RECOMMENDATION_BRIEF_TIMEOUT: 60 * 1000, // 1 minute

  // Concurrency limits (workers per job type)
  CLASSIFY_JOB_CONCURRENCY: 4,
  EXTRACT_EVIDENCE_CONCURRENCY: 2, // Limited due to AI API rate limits
  SCORE_FIT_CONCURRENCY: 4,
  ENRICH_LOGISTICS_CONCURRENCY: 4,
  REFRESH_MARKET_SIGNALS_CONCURRENCY: 4,
  REFRESH_SITE_BRIEF_CONCURRENCY: 4,
  GENERATE_RECOMMENDATION_BRIEF_CONCURRENCY: 4,

  // Queue priorities (higher = process first)
  PRIORITY_CLASSIFY_JOB: 10,
  PRIORITY_EXTRACT_EVIDENCE: 8,
  PRIORITY_SCORE_FIT: 5,
  PRIORITY_ENRICH: 3,
  PRIORITY_GENERATE_BRIEF: 2,

  // Job state TTL (how long to keep completed jobs)
  COMPLETED_JOB_TTL_SECONDS: 7 * 24 * 60 * 60, // 7 days
};

/**
 * Job type to timeout mapping
 */
export function getJobTimeout(jobType: QueueJobType): number {
  switch (jobType) {
    case QueueJobType.CLASSIFY_JOB:
      return QUEUE_CONFIG.CLASSIFY_JOB_TIMEOUT;
    case QueueJobType.EXTRACT_EVIDENCE:
      return QUEUE_CONFIG.EXTRACT_EVIDENCE_TIMEOUT;
    case QueueJobType.SCORE_FIT:
      return QUEUE_CONFIG.SCORE_FIT_TIMEOUT;
    case QueueJobType.ENRICH_LOGISTICS:
      return QUEUE_CONFIG.ENRICH_LOGISTICS_TIMEOUT;
    case QueueJobType.REFRESH_MARKET_SIGNALS:
      return QUEUE_CONFIG.REFRESH_MARKET_SIGNALS_TIMEOUT;
    case QueueJobType.REFRESH_SITE_BRIEF:
      return QUEUE_CONFIG.REFRESH_SITE_BRIEF_TIMEOUT;
    case QueueJobType.GENERATE_RECOMMENDATION_BRIEF:
      return QUEUE_CONFIG.GENERATE_RECOMMENDATION_BRIEF_TIMEOUT;
    default:
      return 60 * 1000; // Default 1 minute
  }
}

/**
 * Job type to concurrency mapping
 */
export function getJobConcurrency(jobType: QueueJobType): number {
  switch (jobType) {
    case QueueJobType.CLASSIFY_JOB:
      return QUEUE_CONFIG.CLASSIFY_JOB_CONCURRENCY;
    case QueueJobType.EXTRACT_EVIDENCE:
      return QUEUE_CONFIG.EXTRACT_EVIDENCE_CONCURRENCY;
    case QueueJobType.SCORE_FIT:
      return QUEUE_CONFIG.SCORE_FIT_CONCURRENCY;
    case QueueJobType.ENRICH_LOGISTICS:
      return QUEUE_CONFIG.ENRICH_LOGISTICS_CONCURRENCY;
    case QueueJobType.REFRESH_MARKET_SIGNALS:
      return QUEUE_CONFIG.REFRESH_MARKET_SIGNALS_CONCURRENCY;
    case QueueJobType.REFRESH_SITE_BRIEF:
      return QUEUE_CONFIG.REFRESH_SITE_BRIEF_CONCURRENCY;
    case QueueJobType.GENERATE_RECOMMENDATION_BRIEF:
      return QUEUE_CONFIG.GENERATE_RECOMMENDATION_BRIEF_CONCURRENCY;
    default:
      return 4;
  }
}

/**
 * Job type to priority mapping
 */
export function getJobPriority(jobType: QueueJobType): number {
  switch (jobType) {
    case QueueJobType.CLASSIFY_JOB:
      return QUEUE_CONFIG.PRIORITY_CLASSIFY_JOB;
    case QueueJobType.EXTRACT_EVIDENCE:
      return QUEUE_CONFIG.PRIORITY_EXTRACT_EVIDENCE;
    case QueueJobType.SCORE_FIT:
      return QUEUE_CONFIG.PRIORITY_SCORE_FIT;
    case QueueJobType.ENRICH_LOGISTICS:
    case QueueJobType.REFRESH_MARKET_SIGNALS:
    case QueueJobType.REFRESH_SITE_BRIEF:
      return QUEUE_CONFIG.PRIORITY_ENRICH;
    case QueueJobType.GENERATE_RECOMMENDATION_BRIEF:
      return QUEUE_CONFIG.PRIORITY_GENERATE_BRIEF;
    default:
      return 1;
  }
}
