import { describe, it, expect } from 'vitest';
import { db } from '../db/client';
import { jobs, job_queue } from '../db/schema';
import { eq } from 'drizzle-orm';
import { createBatch, getBatchStatus, getBatchProgress, replayBatch } from './batch-coordination';
import type { JobInput, JobStatus } from '@dfn/shared';

const mockValidJobs: JobInput[] = [
  {
    company_name: 'Acme Corp',
    product_name: 'Widget A',
    location: { country: 'US', state: 'CA' },
  },
  {
    company_name: 'Beta LLC',
    product_name: 'Gizmo B',
    location: { country: 'NG', state: 'Lagos' },
  },
];

describe('Batch Coordination Service - Phase 5', () => {
  it('should create a batch successfully with correct child jobs', async () => {
    const manifest = await createBatch({
      idempotencyKey: 'idemp-1',
      jobs: mockValidJobs,
      metadata: { source: 'unit-test' },
    });

    expect(manifest.id).toBeDefined();
    expect(manifest.status).toBe('processing');
    expect(manifest.idempotency_key).toBe('idemp-1');

    // Retrieve child jobs
    const childJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.batch_id, manifest.id as any));

    expect(childJobs).toHaveLength(2);
    expect(childJobs[0].company_name).toBe('Acme Corp');
    expect(childJobs[0].status).toBe('submitted');
    expect(childJobs[1].company_name).toBe('Beta LLC');

    // Test idempotency
    const manifest2 = await createBatch({
      idempotencyKey: 'idemp-1',
      jobs: mockValidJobs,
    });
    expect(manifest2.id).toBe(manifest.id);
  });

  it('should reject batch creation if any job is invalid', async () => {
    const invalidJobs: JobInput[] = [
      {
        company_name: 'Acme Corp',
        product_name: 'Widget A',
        location: { country: 'US' },
      },
      {
        company_name: '', // Invalid!
        product_name: 'Gizmo B',
        location: { country: 'NG' },
      },
    ];

    await expect(
      createBatch({
        idempotencyKey: 'idemp-invalid',
        jobs: invalidJobs,
      })
    ).rejects.toThrow('company_name is required');
  });

  it('should roll up status rollup counts correctly', async () => {
    const manifest = await createBatch({
      idempotencyKey: 'idemp-status',
      jobs: mockValidJobs,
    });

    const childJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.batch_id, manifest.id as any));

    // Initially they are both submitted -> rolling up to pending
    const statusRollup = await getBatchStatus(manifest.id);
    expect(statusRollup.total_jobs).toBe(2);
    expect(statusRollup.pending_jobs).toBe(2);
    expect(statusRollup.completed_jobs).toBe(0);
    expect(statusRollup.status).toBe('processing');

    // Make one job complete and one job failed
    await db
      .update(jobs)
      .set({ status: 'recommended' as JobStatus })
      .where(eq(jobs.id, childJobs[0].id));

    await db
      .update(jobs)
      .set({ status: 'analysis_failed' as JobStatus })
      .where(eq(jobs.id, childJobs[1].id));

    const statusRollup2 = await getBatchStatus(manifest.id);
    expect(statusRollup2.completed_jobs).toBe(1);
    expect(statusRollup2.failed_jobs).toBe(1);
    expect(statusRollup2.pending_jobs).toBe(0);
    expect(statusRollup2.status).toBe('completed'); // rolled up
  });

  it('should roll up progress and stages correctly', async () => {
    const manifest = await createBatch({
      idempotencyKey: 'idemp-progress',
      jobs: mockValidJobs,
    });

    const childJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.batch_id, manifest.id as any));

    // Manually fetch queue jobs created for classify-job
    const qJobs = await db.select().from(job_queue);
    const relatedQJobs = qJobs.filter(
      (q) => q.job_id === childJobs[0].id || q.job_id === childJobs[1].id
    );

    // Assert that we enqueued classify-job for both child jobs
    expect(relatedQJobs).toHaveLength(2);

    // Initial progress (0 completed queue jobs)
    const progress = await getBatchProgress(manifest.id);
    expect(progress.progress).toBe(0);
    expect(progress.stage).toBe('pending');

    // Complete one queue job
    await db
      .update(job_queue)
      .set({ status: 'completed' })
      .where(eq(job_queue.id, relatedQJobs[0].id));

    const progress2 = await getBatchProgress(manifest.id);
    expect(progress2.progress).toBe(50);
  });

  it('should replay failed child jobs in a batch correctly', async () => {
    const manifest = await createBatch({
      idempotencyKey: 'idemp-replay',
      jobs: mockValidJobs,
    });

    const childJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.batch_id, manifest.id as any));

    // Fail one of the queue jobs
    const qJobs = await db.select().from(job_queue);
    const relatedQJobs = qJobs.filter(
      (q) => q.job_id === childJobs[0].id || q.job_id === childJobs[1].id
    );

    await db
      .update(job_queue)
      .set({ status: 'failed' })
      .where(eq(job_queue.id, relatedQJobs[0].id));

    await db
      .update(jobs)
      .set({ status: 'analysis_failed' as JobStatus })
      .where(eq(jobs.id, childJobs[0].id));

    // Replay the batch
    await replayBatch(manifest.id);

    // The failed job should go back to submitted status
    const replayedJob = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, childJobs[0].id))
      .limit(1);

    expect(replayedJob[0].status).toBe('submitted');

    // A new queue job should have been created (total of 3 queue jobs now)
    const newQJobs = await db.select().from(job_queue);
    const relatedNewQJobs = newQJobs.filter(
      (q) => q.job_id === childJobs[0].id || q.job_id === childJobs[1].id
    );
    expect(relatedNewQJobs).toHaveLength(3); // 2 original + 1 replayed
  });
});
