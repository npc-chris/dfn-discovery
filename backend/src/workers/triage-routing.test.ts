import { describe, it, expect } from 'vitest';
import { db } from '../db/client';
import { jobs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { createJob } from '../services/job-intake';
import { processQueueJob, enqueueJob } from './queue';

describe('Applications Engineering Triage Routing [KAN-72]', () => {
  const orgId = 'test-org-triage-001';
  const userId = 'test-user-triage-001';

  it('routes multi-body assembly over dimensional threshold to AE queue under 10s', async () => {
    const startTime = Date.now();

    // 1. Create a draft job with ₦85,000 budget ceiling
    const job = await createJob(
      {
        company_name: 'AgroTech Processing Ltd',
        product_name: 'Cassava Peeling Drum Assembly',
        location: { country: 'Nigeria', state: 'Ogun' },
        target_ceiling_ngn: 85000,
      },
      orgId,
      userId
    );

    expect(job.id).toBeDefined();

    // 2. Simulate PrismReportManifest with 1100 x 650 x 500 mm envelope and 4 discrete bodies
    const manifest = {
      schema_version: '1.1',
      report_id: 'report-drum-001',
      job_id: job.id,
      created_at: new Date().toISOString(),
      is_assembly: true,
      part_count: 4,
      geometry: {
        volume_mm3: 45000000,
        surface_area_mm2: 850000,
        bounding_box: {
          x_mm: 1100.0,
          y_mm: 650.0,
          z_mm: 500.0,
        },
        solid_count: 4,
        is_assembly: true,
        part_count: 4,
      },
      complexity_score: 7.2,
    };

    // 3. Enqueue and execute score-fit job with Prism webhook payload
    const queueJobId = await enqueueJob('score-fit', job.id, {
      job_id: job.id,
      report_id: manifest.report_id,
      trigger: 'prism-webhook',
      manifest,
    });

    expect(queueJobId).toBeDefined();

    const queueJob = await processQueueJob(queueJobId);
    const elapsedMs = Date.now() - startTime;
    const handlerResult = (queueJob.result || {}) as Record<string, any>;

    // 4. Assert SLA and handler outcome
    expect(elapsedMs).toBeLessThan(10000);
    expect(handlerResult.requiresAeTriage).toBe(true);
    expect(handlerResult.triageQueue).toBe('applications_engineering');
    expect(handlerResult.discreteBodies).toBe(4);
    expect(handlerResult.envelope).toEqual({ x: 1100.0, y: 650.0, z: 500.0 });

    // 5. Verify database job metadata updates
    const [updatedJob] = await db.select().from(jobs).where(eq(jobs.id, job.id as any)).limit(1);
    const meta = updatedJob.metadata as Record<string, any>;

    expect(meta.triage_queue).toBe('applications_engineering');
    expect(meta.cad_telemetry.discrete_bodies).toBe(4);
    expect(meta.cad_telemetry.envelope_mm).toEqual({ x: 1100.0, y: 650.0, z: 500.0 });
    expect(meta.triage_routed_at).toBeDefined();
  });
});
