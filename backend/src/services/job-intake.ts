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
    // Move job to validation_failed state
    const [failedJob] = await db
      .update(jobs)
      .set({
        status: 'validation_failed' as JobStatus,
        version: currentJob.version + 1,
        updated_at: new Date(),
      })
      .where(eq(jobs.id, jobId))
      .returning();

    const error = new Error(`Validation failed: ${validation.errors.join(', ')}`);
    (error as any).statusCode = 400;
    (error as any).job = failedJob;
    throw error;
  }

  // Transition to submitted
  const [submittedJob] = await db
    .update(jobs)
    .set({
      status: 'submitted' as JobStatus,
      version: currentJob.version + 1,
      updated_at: new Date(),
    })
    .where(eq(jobs.id, jobId))
    .returning();

  return submittedJob as Job;
}

export async function getJob(jobId: string): Promise<Job | null> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return (job as Job) || null;
}

export async function updateJobStatus(jobId: string, status: JobStatus): Promise<Job> {
  const [currentJob] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

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
