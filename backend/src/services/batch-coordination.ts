/**
 * Batch Coordination Service
 *
 * Orchestrates bulk requests, grouped calculations, and fan-out/fan-in batch processing.
 */

import { db } from '../db/client';
import { batch_manifests, jobs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { JobInput, JobStatus } from '@dfn/shared';
import { enqueueJob, getJobQueueStatus, replayQueueJob } from '../workers/queue';
import { validateJobInput } from './job-intake';

export interface BatchRequestPayload {
  idempotencyKey?: string;
  orgId: string;
  createdBy: string;
  jobs: JobInput[];
  metadata?: Record<string, unknown>;
}

export interface BatchManifest {
  id: string;
  status: string;
  idempotency_key: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface BatchStatusRollup {
  id: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  metadata: Record<string, unknown> | null;
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  processing_jobs: number;
  pending_jobs: number;
  jobs: Array<{
    id: string;
    product_name: string;
    status: string;
  }>;
}

export interface BatchProgressResponse {
  progress: number;
  stage: string;
  stages: Record<string, number>;
}

/**
 * Submit a bulk request of jobs.
 * Uses idempotencyKey to prevent duplicate batch submission.
 */
export async function createBatch(payload: BatchRequestPayload): Promise<BatchManifest> {
  const { idempotencyKey, orgId, createdBy, jobs: childJobInputs, metadata = {} } = payload;

  if (idempotencyKey) {
    const existing = await db
      .select()
      .from(batch_manifests)
      .where(eq(batch_manifests.idempotency_key, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      return existing[0] as BatchManifest;
    }
  }

  // Validate all child job definitions before processing any
  if (!Array.isArray(childJobInputs) || childJobInputs.length === 0) {
    const error = new Error('Jobs array must be provided and not empty');
    (error as any).statusCode = 400;
    throw error;
  }

  for (const [index, jobInput] of childJobInputs.entries()) {
    const validation = validateJobInput(jobInput);
    if (!validation.valid) {
      const error = new Error(`Job at index ${index} is invalid: ${validation.errors.join(', ')}`);
      (error as any).statusCode = 400;
      throw error;
    }
  }

  const batchId = randomUUID();
  const now = new Date();

  // Create batch manifest record
  const [manifest] = await db
    .insert(batch_manifests)
    .values({
      id: batchId,
      org_id: orgId,
      idempotency_key: idempotencyKey || null,
      status: 'processing',
      metadata,
      created_at: now,
      updated_at: now,
    })
    .returning();

  // Create child jobs and enqueue their first queue stage
  for (const jobInput of childJobInputs) {
    const jobId = randomUUID();
    await db.insert(jobs).values({
      id: jobId,
      org_id: orgId,
      created_by: createdBy,
      batch_id: batchId,
      company_name: jobInput.company_name.trim(),
      product_name: jobInput.product_name.trim(),
      process_type: jobInput.process_type?.trim() ?? null,
      material_type: jobInput.material_type?.trim() ?? null,
      volume_band: jobInput.volume_band?.trim() ?? null,
      location: jobInput.location,
      status: 'submitted' as JobStatus,
      version: 1,
      metadata: jobInput.metadata ?? {},
      created_at: now,
      updated_at: now,
    });

    // Enqueue the first queue stage
    await enqueueJob('classify-job', jobId, {});
  }

  return manifest as BatchManifest;
}

/**
 * Return batch manifest, child job statuses, and rollup counts.
 */
export async function getBatchStatus(batchId: string): Promise<BatchStatusRollup> {
  const [manifest] = await db
    .select()
    .from(batch_manifests)
    .where(eq(batch_manifests.id, batchId as any))
    .limit(1);

  if (!manifest) {
    const error = new Error(`Batch not found: ${batchId}`);
    (error as any).statusCode = 404;
    throw error;
  }

  const childJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.batch_id, batchId as any));

  let completed = 0;
  let failed = 0;
  let processing = 0;
  let pending = 0;

  const jobsList = childJobs.map((j) => {
    const status = j.status;
    if (status === 'recommended' || status === 'published') {
      completed++;
    } else if (
      status === 'analysis_failed' ||
      status === 'scoring_failed' ||
      status === 'validation_failed'
    ) {
      failed++;
    } else if (status === 'submitted' || status === 'normalized') {
      pending++;
    } else {
      processing++;
    }

    return {
      id: j.id,
      product_name: j.product_name,
      status: j.status,
    };
  });

  // Roll up overall manifest status
  let overallStatus = 'processing';
  if (completed === childJobs.length && childJobs.length > 0) {
    overallStatus = 'completed';
  } else if (failed === childJobs.length && childJobs.length > 0) {
    overallStatus = 'failed';
  } else if (completed + failed === childJobs.length && childJobs.length > 0) {
    overallStatus = 'completed';
  }

  // Update manifest status in DB if changed
  if (manifest.status !== overallStatus) {
    await db
      .update(batch_manifests)
      .set({ status: overallStatus, updated_at: new Date() })
      .where(eq(batch_manifests.id, batchId as any));
  }

  return {
    id: manifest.id,
    status: overallStatus,
    created_at: manifest.created_at,
    updated_at: manifest.updated_at,
    metadata: manifest.metadata as Record<string, unknown> | null,
    total_jobs: childJobs.length,
    completed_jobs: completed,
    failed_jobs: failed,
    processing_jobs: processing,
    pending_jobs: pending,
    jobs: jobsList,
  };
}

/**
 * Return progress percentage and current stage.
 */
export async function getBatchProgress(batchId: string): Promise<BatchProgressResponse> {
  const [manifest] = await db
    .select()
    .from(batch_manifests)
    .where(eq(batch_manifests.id, batchId as any))
    .limit(1);

  if (!manifest) {
    const error = new Error(`Batch not found: ${batchId}`);
    (error as any).statusCode = 404;
    throw error;
  }

  const childJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.batch_id, batchId as any));

  if (childJobs.length === 0) {
    return {
      progress: 0,
      stage: 'pending',
      stages: {},
    };
  }

  let totalQueueJobs = 0;
  let completedQueueJobs = 0;
  const stageCounts: Record<string, number> = {};

  for (const job of childJobs) {
    const queueJobs = await getJobQueueStatus(job.id);
    totalQueueJobs += queueJobs.length;
    completedQueueJobs += queueJobs.filter((q) => q.status === 'completed').length;

    let currentStage = 'pending';
    for (const qJob of [...queueJobs].reverse()) {
      if (qJob.status !== 'pending') {
        currentStage = qJob.queue_type;
        break;
      }
    }
    stageCounts[currentStage] = (stageCounts[currentStage] || 0) + 1;
  }

  const progress = totalQueueJobs > 0 ? Math.round((completedQueueJobs / totalQueueJobs) * 100) : 0;

  let dominantStage = 'pending';
  let maxCount = -1;
  for (const [stage, count] of Object.entries(stageCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantStage = stage;
    }
  }

  return {
    progress,
    stage: dominantStage,
    stages: stageCounts,
  };
}

/**
 * Replay failed child jobs only.
 */
export async function replayBatch(batchId: string): Promise<void> {
  const [manifest] = await db
    .select()
    .from(batch_manifests)
    .where(eq(batch_manifests.id, batchId as any))
    .limit(1);

  if (!manifest) {
    const error = new Error(`Batch not found: ${batchId}`);
    (error as any).statusCode = 404;
    throw error;
  }

  const childJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.batch_id, batchId as any));

  for (const job of childJobs) {
    const queueJobs = await getJobQueueStatus(job.id);
    const failedQueueJobs = queueJobs.filter((q) => q.status === 'failed');

    if (failedQueueJobs.length > 0) {
      for (const failedQJob of failedQueueJobs) {
        await replayQueueJob(failedQJob.id);
      }

      // Transition the job back to submitted so it compiles and processes again
      await db
        .update(jobs)
        .set({ status: 'submitted', updated_at: new Date() })
        .where(eq(jobs.id, job.id));
    }
  }

  // Reset batch status to processing
  await db
    .update(batch_manifests)
    .set({ status: 'processing', updated_at: new Date() })
    .where(eq(batch_manifests.id, batchId as any));
}
