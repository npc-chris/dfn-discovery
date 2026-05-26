// Job Intake Service
// Validates, normalizes, and versions job submissions

import { db } from '../db/client.ts';
import { jobs } from '../db/schema.ts';
import type { Job, JobInput, JobStatus } from '@dfn/shared';
import { eq } from 'drizzle-orm';

// Validate job input fields
function validateJobInput(input: JobInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.company_name || input.company_name.trim().length === 0) {
    errors.push('company_name is required');
  }

  if (!input.product_name || input.product_name.trim().length === 0) {
    errors.push('product_name is required');
  }

  if (input.location && typeof input.location === 'object') {
    if (!('country' in input.location)) {
      errors.push('location must include country');
    }
  } else {
    errors.push('location is required and must be an object');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Normalize job input data
function normalizeJobInput(input: JobInput): Record<string, unknown> {
  return {
    company_name: input.company_name?.trim() || '',
    product_name: input.product_name?.trim() || '',
    process_type: input.process_type?.trim() || null,
    material_type: input.material_type?.trim() || null,
    volume_band: input.volume_band?.trim() || null,
    location: input.location || {},
    metadata: input.metadata || {},
  };
}

export async function createJob(input: JobInput): Promise<Job> {
  // Validate input
  const validation = validateJobInput(input);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(', '));
    (error as any).statusCode = 400;
    throw error;
  }

  // Normalize data
  const normalized = normalizeJobInput(input);

  // Insert into database
  const [createdJob] = await db
    .insert(jobs)
    .values({
      company_name: normalized.company_name as string,
      product_name: normalized.product_name as string,
      process_type: normalized.process_type as string | null,
      material_type: normalized.material_type as string | null,
      volume_band: normalized.volume_band as string | null,
      location: normalized.location,
      status: 'draft' as JobStatus,
      version: 1,
      metadata: normalized.metadata,
    })
    .returning();

  return createdJob as Job;
}

export async function submitJob(jobId: string): Promise<Job> {
  // Fetch the current job
  const [currentJob] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

  if (!currentJob) {
    const error = new Error('Job not found');
    (error as any).statusCode = 404;
    throw error;
  }

  if (currentJob.status !== 'draft') {
    const error = new Error(`Cannot submit job with status ${currentJob.status}`);
    (error as any).statusCode = 400;
    throw error;
  }

  // Validate the job before submission
  const validation = validateJobInput(currentJob as JobInput);
  if (!validation.valid) {
    const failedJob = await transitionJobStatus(jobId, 'validation_failed', 'system');

    const error = new Error(`Validation failed: ${validation.errors.join(', ')}`);
    (error as any).statusCode = 400;
    (error as any).job = failedJob;
    throw error;
  }

  // Transition to submitted and record history in metadata
  return transitionJobStatus(jobId, 'submitted', 'user');
}

export async function getJob(jobId: string): Promise<Job | null> {
  try {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId as any)).limit(1);
    return (job as Job) || null;
  } catch {
    return null;
  }
}

export async function updateJobStatus(jobId: string, status: JobStatus): Promise<Job> {
  const [currentJob] = await db.select().from(jobs).where(eq(jobs.id, jobId as any)).limit(1);

  if (!currentJob) {
    const error = new Error('Job not found');
    (error as any).statusCode = 404;
    throw error;
  }

  // TODO: Add validation for valid state transitions based on state machine

  const [updatedJob] = await db
    .update(jobs)
    .set({
      status,
      version: currentJob.version + 1,
      updated_at: new Date(),
    })
    .where(eq(jobs.id, jobId))
    .returning();

  return updatedJob as Job;
}

// ============================================================================
// TASK 3.4: JOB STATE TRANSITIONS
// ============================================================================

/**
 * Define the job state machine: allowed transitions per status
 *
 * State machine from DFN_LLD.md:
 * - draft → submitted (via submitJob)
 * - submitted → normalized (via queue worker: classify-job)
 * - normalized → analyzing (via queue start)
 * - analyzing → scored (via queue worker: score-fit)
 * - scored → recommended (via queue worker: generate-recommendation-brief)
 * - recommended → published (via user action)
 *
 * Failure states (reachable from any state):
 * - validation_failed (from draft → submitted)
 * - analysis_failed (from queue worker on max retries)
 * - scoring_failed (from queue worker on max retries)
 * - stale_data (from external trigger)
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted', 'validation_failed'],
  submitted: ['normalized', 'validation_failed', 'analysis_failed'],
  normalized: ['analyzing', 'analysis_failed'],
  analyzing: ['scored', 'analysis_failed'],
  scored: ['recommended', 'scoring_failed'],
  recommended: ['published', 'stale_data'],
  published: ['archived'],
  archived: [],
  validation_failed: ['archived'],
  analysis_failed: ['archived'],
  scoring_failed: ['archived'],
  stale_data: ['analyzing', 'archived'],
};

/**
 * Validate a state transition
 *
 * @param currentStatus - Current job status
 * @param nextStatus - Target status
 * @returns true if transition is valid, false otherwise
 */
export function isValidStateTransition(currentStatus: string, nextStatus: string): boolean {
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

/**
 * Transition a job to a new status with state machine validation
 *
 * Updates job status, increments version, records timestamp.
 * Throws error if transition is invalid.
 *
 * @param jobId - Job UUID
 * @param nextStatus - Target status
 * @param source - What triggered the transition (for audit: 'user', 'queue-worker', 'system')
 * @returns Updated Job
 * @throws Error if transition invalid or job not found
 */
export async function transitionJobStatus(
  jobId: string,
  nextStatus: string,
  source: 'user' | 'queue-worker' | 'system' = 'system'
): Promise<Job> {
  // Fetch current job
  let currentJob;
  try {
    [currentJob] = await db.select().from(jobs).where(eq(jobs.id, jobId as any)).limit(1);
  } catch {
    currentJob = null;
  }

  if (!currentJob) {
    const error = new Error(`Job not found: ${jobId}`);
    (error as any).statusCode = 404;
    throw error;
  }

  const currentStatus = currentJob.status;

  // Validate transition
  if (!isValidStateTransition(currentStatus, nextStatus)) {
    const error = new Error(
      `Invalid state transition: ${currentStatus} → ${nextStatus} (source: ${source})`
    );
    (error as any).statusCode = 400;
    throw error;
  }

  // Update job
  const now = new Date();
  const metadata = (currentJob.metadata as Record<string, unknown>) || {};
  const transitions = (metadata.state_transitions as Array<Record<string, unknown>>) || [];

  transitions.push({
    from: currentStatus,
    to: nextStatus,
    source,
    timestamp: now.toISOString(),
  });

  const [updatedJob] = await db
    .update(jobs)
    .set({
      status: nextStatus as JobStatus,
      version: currentJob.version + 1,
      updated_at: now,
      metadata: {
        ...metadata,
        state_transitions: transitions,
      },
    })
    .where(eq(jobs.id, jobId))
    .returning();

  return updatedJob as Job;
}

/**
 * Get state transition history for a job
 *
 * Returns all recorded state transitions from job.metadata.state_transitions
 *
 * @param jobId - Job UUID
 * @returns Array of transitions with from, to, source, timestamp
 */
export async function getJobStateTransitionHistory(
  jobId: string
): Promise<Array<{ from: string; to: string; source: string; timestamp: string }>> {
  const job = await getJob(jobId);
  if (!job) {
    return [];
  }

  const metadata = (job.metadata as Record<string, unknown>) || {};
  const transitions = (metadata.state_transitions as Array<Record<string, unknown>>) || [];

  return transitions.map((t) => ({
    from: (t.from as string) || 'unknown',
    to: (t.to as string) || 'unknown',
    source: (t.source as string) || 'unknown',
    timestamp: (t.timestamp as string) || new Date().toISOString(),
  }));
}
