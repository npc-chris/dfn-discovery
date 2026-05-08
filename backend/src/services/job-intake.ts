// Job Intake Service
// Validates, normalizes, and versions job submissions

import { db } from '../db/client';
import { jobs } from '../db/schema';
import { Job, JobInput, JobStatus } from '@dfn/shared';

export async function createJob(input: JobInput): Promise<Job> {
  // TODO: implement
  throw new Error('Not implemented');
}

export async function submitJob(jobId: string): Promise<Job> {
  // TODO: validate and transition from draft to submitted
  throw new Error('Not implemented');
}

export async function getJob(jobId: string): Promise<Job | null> {
  // TODO: implement
  throw new Error('Not implemented');
}

export async function updateJobStatus(jobId: string, status: JobStatus): Promise<Job> {
  // TODO: implement
  throw new Error('Not implemented');
}
