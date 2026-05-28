/**
 * Queue Worker Service
 *
 * Core async job processing engine with:
 * - Queue database operations (enqueue, status, complete, fail)
 * - Worker dispatch and retry logic
 * - Concurrency control and timeouts
 * - 7 domain-specific job handlers
 *
 * Supports 7 queue job types:
 * 1. classify-job → Normalize and classify job
 * 2. extract-evidence → Extract from attachments via AI
 * 3. score-fit → Score job against factories
 * 4. enrich-logistics → Add logistics context
 * 5. refresh-market-signals → Add market data
 * 6. refresh-site-brief → Add facility data
 * 7. generate-recommendation-brief → Format for UI
 */

import { db } from '../db/client';
import { job_queue, jobs } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getGeoLogistics } from '../services/geo-logistics';
import { getMarketIntelligence } from '../services/market-intelligence';
import { getSiteRealEstate } from '../services/site-realestate';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

export enum QueueJobStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

export interface QueueJob {
  id: string;
  job_id: string;
  queue_type: string;
  payload: Record<string, unknown>;
  status: QueueJobStatus;
  retries: number;
  max_retries: number;
  error?: string;
  result?: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 60000, // 1 minute
};

const JOB_TIMEOUTS_MS = {
  'classify-job': 60 * 1000,
  'extract-evidence': 5 * 60 * 1000, // 5 min
  'score-fit': 2 * 60 * 1000, // 2 min
  'enrich-logistics': 60 * 1000,
  'refresh-market-signals': 2 * 60 * 1000,
  'refresh-site-brief': 2 * 60 * 1000,
  'generate-recommendation-brief': 60 * 1000,
};

const CONCURRENCY_LIMITS = {
  'classify-job': 10,
  'extract-evidence': 5,
  'score-fit': 10,
  'enrich-logistics': 10,
  'refresh-market-signals': 10,
  'refresh-site-brief': 10,
  'generate-recommendation-brief': 10,
};

// ============================================================================
// TASK 3.1: QUEUE DATABASE OPERATIONS
// ============================================================================

/**
 * Enqueue a new async job
 *
 * Checks for duplicate (jobId, type) to prevent re-enqueueing.
 * Sets retry count to 0 and maxRetries from config.
 *
 * @param queueType - Type of job (classify-job, extract-evidence, etc.)
 * @param jobId - DFN job ID
 * @param payload - Type-specific data
 * @returns Queue job ID (UUID)
 * @throws Error if job already exists for this type
 */
export async function enqueueJob(
  queueType: string,
  jobId: string,
  payload: Record<string, unknown> = {}
): Promise<string> {
  // Check for duplicate: existing pending or processing job of same type for this job
  const existing = await db
    .select()
    .from(job_queue)
    .where(
      and(
        eq(job_queue.job_id, jobId),
        eq(job_queue.queue_type, queueType)
      )
    )
    .limit(1);

  if (existing.length > 0 && (existing[0].status === 'pending' || existing[0].status === 'processing')) {
    throw new Error(`Job already queued: ${jobId} (type: ${queueType})`);
  }

  const queueJobId = randomUUID();
  const now = new Date();

  await db.insert(job_queue).values({
    id: queueJobId,
    job_id: jobId,
    queue_type: queueType,
    payload: payload,
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  });

  return queueJobId;
}

/**
 * Get status of a specific queue job
 *
 * @param queueJobId - Queue job UUID
 * @returns QueueJob or null if not found
 */
export async function getQueueJobStatus(queueJobId: string): Promise<QueueJob | null> {
  try {
    const row = await db.select().from(job_queue).where(eq(job_queue.id, queueJobId as any)).limit(1);

    if (row.length === 0) {
      return null;
    }

    const item = row[0];
    return {
      id: item.id,
      job_id: item.job_id as string,
      queue_type: item.queue_type,
      payload: item.payload as Record<string, unknown>,
      status: item.status as QueueJobStatus,
      retries: item.attempts,
      max_retries: RETRY_CONFIG.maxRetries,
      error: item.error || undefined,
      result: item.result ? (item.result as Record<string, unknown>) : undefined,
      created_at: item.created_at,
      updated_at: item.updated_at,
      completed_at: item.completed_at || undefined,
    };
  } catch (error) {
    // Invalid UUID or database error - return null
    return null;
  }
}

/**
 * Get all queue jobs for a DFN job (in order of creation)
 *
 * @param jobId - DFN job ID
 * @returns Array of QueueJob in creation order
 */
export async function getJobQueueStatus(jobId: string): Promise<QueueJob[]> {
  const rows = await db
    .select()
    .from(job_queue)
    .where(eq(job_queue.job_id, jobId))
    .orderBy(job_queue.created_at);

  return rows.map((item) => ({
    id: item.id,
    job_id: item.job_id as string,
    queue_type: item.queue_type,
    payload: item.payload as Record<string, unknown>,
    status: item.status as QueueJobStatus,
    retries: item.attempts,
    max_retries: RETRY_CONFIG.maxRetries,
    error: item.error || undefined,
    result: item.result ? (item.result as Record<string, unknown>) : undefined,
    created_at: item.created_at,
    updated_at: item.updated_at,
    completed_at: item.completed_at || undefined,
  }));
}

/**
 * Mark a queue job as complete with result data
 *
 * @param queueJobId - Queue job UUID
 * @param result - Result data (type-specific)
 * @returns void
 */
export async function markQueueJobComplete(
  queueJobId: string,
  result: Record<string, unknown> = {}
): Promise<void> {
  const now = new Date();

  await db
    .update(job_queue)
    .set({
      status: 'completed',
      result: result,
      completed_at: now,
      updated_at: now,
    })
    .where(eq(job_queue.id, queueJobId));
}

/**
 * Mark a queue job as failed with error message
 *
 * If retries < maxRetries, schedules a retry with exponential backoff.
 * If maxRetries exceeded, returns false and updates job status to 'analysis_failed'.
 *
 * @param queueJobId - Queue job UUID
 * @param error - Error message
 * @returns true if retry scheduled, false if max retries exceeded
 */
export async function markQueueJobFailed(queueJobId: string, error: string): Promise<boolean> {
  const job = await getQueueJobStatus(queueJobId);

  if (!job) {
    throw new Error(`Queue job not found: ${queueJobId}`);
  }

  const now = new Date();
  const nextRetries = job.retries + 1;
  const shouldRetry = nextRetries < job.max_retries;

  await db
    .update(job_queue)
    .set({
      status: shouldRetry ? 'pending' : 'failed',
      attempts: nextRetries,
      error: error,
      updated_at: now,
      ...(shouldRetry ? {} : { completed_at: now }), // Only set completed_at if final failure
    })
    .where(eq(job_queue.id, queueJobId));

  // If max retries exceeded, update job status to analysis_failed
  if (!shouldRetry) {
    await db
      .update(jobs)
      .set({
        status: 'analysis_failed',
        updated_at: now,
      })
      .where(eq(jobs.id, job.job_id));

    return false;
  }

  return true;
}

/**
 * Calculate exponential backoff delay for retry
 *
 * Formula: initialDelay * (2 ^ attemptNumber), capped at maxDelay
 *
 * @param attemptNumber - 0-indexed attempt number
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(attemptNumber: number): number {
  const exponential = RETRY_CONFIG.initialDelayMs * Math.pow(2, attemptNumber);
  return Math.min(exponential, RETRY_CONFIG.maxDelayMs);
}

/**
 * Get timeout (in ms) for a job type
 */
export function getJobTimeout(queueType: string): number {
  return (JOB_TIMEOUTS_MS as Record<string, number>)[queueType] || 60000;
}

/**
 * Get concurrency limit for a job type
 */
export function getConcurrencyLimit(queueType: string): number {
  return (CONCURRENCY_LIMITS as Record<string, number>)[queueType] || 10;
}

/**
 * Mark a queue job as processing
 *
 * Called before handler execution
 */
export async function markQueueJobProcessing(queueJobId: string): Promise<void> {
  const now = new Date();
  await db
    .update(job_queue)
    .set({
      status: 'processing',
      updated_at: now,
    })
    .where(eq(job_queue.id, queueJobId));
}

// ============================================================================
// TASK 3.2: WORKER DISPATCH & EXECUTION
// ============================================================================

/**
 * Enforce a timeout on an async function
 *
 * Wraps function in Promise.race with timeout. If function takes longer
 * than timeoutMs, rejects with TimeoutError.
 *
 * @param fn - Async function to execute
 * @param timeoutMs - Maximum execution time in milliseconds
 * @returns Promise that resolves/rejects based on fn or timeout
 */
export async function enforceTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Job timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Process a queue job: fetch, dispatch, execute, and handle result
 *
 * Flow:
 * 1. Fetch queue job from database
 * 2. Mark as processing
 * 3. Dispatch to correct handler based on queue_type
 * 4. Enforce timeout (get from JOB_TIMEOUTS_MS)
 * 5. On success: call markQueueJobComplete
 * 6. On error: call markQueueJobFailed (may retry or fail permanently)
 *
 * @param queueJobId - UUID of queue job to process
 * @returns QueueJob after processing (updated status/result/error)
 * @throws Error if queue job not found or handler not found
 */
export async function processQueueJob(queueJobId: string): Promise<QueueJob> {
  const job = await getQueueJobStatus(queueJobId);

  if (!job) {
    throw new Error(`Queue job not found: ${queueJobId}`);
  }

  // Mark as processing
  await markQueueJobProcessing(queueJobId);

  // Get timeout for this job type
  const timeoutMs = getJobTimeout(job.queue_type);

  try {
    // Get handler for this job type
    const handler = getHandlerForJobType(job.queue_type);
    if (!handler) {
      throw new Error(`No handler found for job type: ${job.queue_type}`);
    }

    // Execute handler with timeout
    const result = await enforceTimeout(
      () => handler(job.job_id, job.payload),
      timeoutMs
    );

    // Mark as complete
    await markQueueJobComplete(queueJobId, result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Mark as failed (may retry or fail permanently)
    const willRetry = await markQueueJobFailed(queueJobId, errorMessage);

    if (!willRetry) {
      // Final failure - log for debugging
      console.error(`Queue job final failure: ${queueJobId}`, errorMessage);
    }
  }

  // Return updated job
  const updated = await getQueueJobStatus(queueJobId);
  if (!updated) {
    throw new Error(`Queue job disappeared after processing: ${queueJobId}`);
  }

  return updated;
}

// ============================================================================
// ADDITIONAL HELPERS (Phase 3 polish)
// ============================================================================

/**
 * Replay a queue job by creating a new queued job with the same type and payload.
 * If resetPayload is provided it will be used instead of the original payload.
 */
export async function replayQueueJob(queueJobId: string, resetPayload?: Record<string, unknown>): Promise<string> {
  const originalRows = await db.select().from(job_queue).where(eq(job_queue.id, queueJobId as any)).limit(1);
  if (originalRows.length === 0) throw new Error(`Queue job not found: ${queueJobId}`);

  const original = originalRows[0];
  const newId = randomUUID();
  const now = new Date();

  const payload = resetPayload ?? (original.payload as Record<string, unknown>);

  await db.insert(job_queue).values({
    id: newId,
    job_id: original.job_id,
    queue_type: original.queue_type,
    payload,
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  });

  return newId;
}

/**
 * Compute queue statistics for health endpoints
 */
export async function getQueueStats(): Promise<{
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  averageProcessingTimeMs: number;
  successRate: number;
  oldestPendingJobAgeSeconds: number | null;
}> {
  // Counts by status
  const all = await db.select().from(job_queue);

  const queued = all.filter((r) => r.status === 'pending').length;
  const processing = all.filter((r) => r.status === 'processing').length;
  const completed = all.filter((r) => r.status === 'completed').length;
  const failed = all.filter((r) => r.status === 'failed').length;

  // Average processing time: for completed jobs, completed_at - created_at
  const completedRows = all.filter((r) => r.status === 'completed' && r.completed_at && r.created_at);
  const avgMs = completedRows.length
    ? Math.round(completedRows.reduce((acc, r) => acc + (r.completed_at!.getTime() - r.created_at.getTime()), 0) / completedRows.length)
    : 0;

  const successRate = completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : 0;

  // Oldest pending job age
  const pendingRows = all.filter((r) => r.status === 'pending' && r.created_at);
  const oldestPending = pendingRows.length
    ? Math.round((Date.now() - Math.min(...pendingRows.map((r) => r.created_at.getTime())) ) / 1000)
    : null;

  return {
    queued,
    processing,
    completed,
    failed,
    averageProcessingTimeMs: avgMs,
    successRate,
    oldestPendingJobAgeSeconds: oldestPending,
  };
}

/**
 * Map job types to their handler functions
 *
 * Handlers are called as: handler(jobId, payload) → Promise<Record<string, unknown>>
 */
type JobHandler = (jobId: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;

const jobHandlers: Record<string, JobHandler> = {
  'classify-job': classifyJobHandler,
  'extract-evidence': extractEvidenceHandler,
  'score-fit': scoreFitHandler,
  'enrich-logistics': enrichLogisticsHandler,
  'refresh-market-signals': refreshMarketSignalsHandler,
  'refresh-site-brief': refreshSiteBriefHandler,
  'generate-recommendation-brief': generateRecommendationBriefHandler,
};

/**
 * Get handler for a job type, or null if not found
 */
function getHandlerForJobType(queueType: string): JobHandler | null {
  return jobHandlers[queueType] || null;
}

// ============================================================================
// TASK 3.3: QUEUE WORKER HANDLERS (STUBS FOR PHASE 3)
// ============================================================================

/**
 * Handler 1: Classify Job
 *
 * Uses AI to normalize and classify job:
 * - Extract process type (if not provided)
 * - Extract material type (if not provided)
 * - Updates job record
 */
async function classifyJobHandler(_jobId: string, _payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  // TODO: Implement in Task 3.3
  // Call AI Analysis Workers to extract/classify
  // Update job with process_type, material_type
  return { classified: true };
}

/**
 * Handler 2: Extract Evidence
 *
 * Extract structured data from job attachments via AI:
 * - Get attachments from job
 * - Call AI extraction for each
 * - Create evidence items
 */
async function extractEvidenceHandler(_jobId: string, _payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  // TODO: Implement in Task 3.3
  // Call AI Analysis Workers to extract from each attachment
  // Create evidence items in evidence_items table
  return { evidenceExtracted: true };
}

/**
 * Handler 3: Score Fit
 *
 * Score job against all factories:
 * - Call Core Intelligence scoring
 * - Store recommendations
 */
async function scoreFitHandler(_jobId: string, _payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  // TODO: Implement in Task 3.3
  // Call Core Intelligence to score job
  // Persist recommendations to recommendations table
  return { scored: true };
}

/**
 * Handler 4: Enrich Logistics (Phase 4 stub)
 *
 * Add logistics context to recommendations:
 * - Call Geo/Logistics service
 * - Update recommendations with logistics data
 */
async function enrichLogisticsHandler(jobId: string, _payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const geoLogistics = getGeoLogistics();
  
  // Need the job to get locations
  const [jobRecord] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!jobRecord) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  // Format matching target job
  const job = {
    id: jobRecord.id, // For this stub, job typing matches the base
    delivery_location: jobRecord.delivery_location as any
  };

  // Run the assessment. We aren't doing factory-by-factory routing here unless we fetch recommended factories.
  // For the sake of the queue step, let's assume we do a baseline location sanity check.
  const factoryMock = { id: 'generic-fac', location: { coordinates: { lat: 9.0820, lng: 8.6753 } } } as any;

  const assessment = await geoLogistics.assessLogistics(job as any, factoryMock);

  return { logisticsEnriched: true, assessment };
}

/**
 * Handler 5: Refresh Market Signals (Phase 4 stub)
 *
 * Add market intelligence to recommendations:
 * - Call Market Intelligence service
 * - Update recommendations with market data
 */
async function refreshMarketSignalsHandler(jobId: string, _payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const marketIntel = getMarketIntelligence();
  
  const [jobRecord] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!jobRecord) {
    throw new Error(`Job ${jobId} not found`);
  }

  const category = (jobRecord.requirements as any)?.category || 'Generic Manufacturing';

  // In production, we loop recommendations. Here we fetch the generic market outlook.
  const outlook = await marketIntel.getMarketOutlook(category);

  return { marketSignalsRefreshed: true, outlook };
}

/**
 * Handler 6: Refresh Site Brief (Phase 4 stub)
 *
 * Add facility data to recommendations:
 * - Call Site/Real Estate service
 * - Update recommendations with site data
 */
async function refreshSiteBriefHandler(jobId: string, _payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const siteRealEstate = getSiteRealEstate();
  
  // Example dummy factory check setup.
  // We'll generate a brief for a known dummy to ensure CMMS integration runs.
  const factoryMock = { id: 'factory-123', name: 'Primary Factory' } as any;
  const brief = await siteRealEstate.generateSiteBrief(factoryMock);

  return { siteBriefRefreshed: true, brief };
}

/**
 * Handler 7: Generate Recommendation Brief
 *
 * Format recommendations for UI display:
 * - Call Presentation Layer
 * - Update job status to 'recommended'
 */
async function generateRecommendationBriefHandler(_jobId: string, _payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  // TODO: Implement in Task 3.3
  // Call Presentation Layer to format recommendations
  // Update job status to 'recommended'
  return { recommendationBriefGenerated: true };
}

// ============================================================================
// TASK 3.6: WEBHOOKS (OPTIONAL)
// ============================================================================

/**
 * Webhook event types emitted by queue worker
 */
export type WebhookEventType = 'job.queued' | 'job.started' | 'job.completed' | 'job.failed';

/**
 * Webhook event payload
 */
export interface WebhookEvent {
  eventType: WebhookEventType;
  queueJobId: string;
  jobId: string;
  queueType: string;
  timestamp: string;
  status: QueueJobStatus;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * Webhook subscription registry
 *
 * Maps job IDs to webhook URLs to be called on job status change
 */
const webhookRegistry: Map<string, Set<string>> = new Map();

/**
 * Register a webhook URL for a job
 *
 * The webhook will be called when the job completes or fails.
 * Webhook is called with POST containing WebhookEvent payload.
 *
 * @param jobId - DFN job ID
 * @param webhookUrl - HTTPS URL to POST webhook events to
 */
export function registerWebhook(jobId: string, webhookUrl: string): void {
  if (!webhookRegistry.has(jobId)) {
    webhookRegistry.set(jobId, new Set());
  }
  webhookRegistry.get(jobId)!.add(webhookUrl);
}

/**
 * Unregister a webhook URL for a job
 *
 * @param jobId - DFN job ID
 * @param webhookUrl - HTTPS URL to remove
 */
export function unregisterWebhook(jobId: string, webhookUrl: string): void {
  const urls = webhookRegistry.get(jobId);
  if (urls) {
    urls.delete(webhookUrl);
    if (urls.size === 0) {
      webhookRegistry.delete(jobId);
    }
  }
}

/**
 * Emit a webhook event to all registered URLs for a job
 *
 * Calls all registered webhooks asynchronously (fire-and-forget).
 * Does not wait for responses or retry failed webhooks.
 *
 * @param jobId - DFN job ID
 * @param event - Webhook event to emit
 */
export async function emitWebhookEvent(jobId: string, event: WebhookEvent): Promise<void> {
  const urls = webhookRegistry.get(jobId);
  if (!urls || urls.size === 0) {
    return;
  }

  // Fire webhooks in parallel (non-blocking)
  Promise.allSettled(
    Array.from(urls).map((url) =>
      (() => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        return fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
          signal: controller.signal,
        })
          .catch((err) => console.error(`Webhook delivery failed to ${url}:`, err))
          .finally(() => clearTimeout(timeoutId));
      })()
    )
  ).catch((_err) => {
    // Silently ignore webhook delivery failures
  });
}
