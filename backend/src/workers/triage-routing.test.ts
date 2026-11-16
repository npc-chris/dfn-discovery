import assert from 'assert';
import { db } from '../db/client';
import { jobs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { createJob } from '../services/job-intake';
import { processQueueJob, enqueueJob } from './queue';

async function runTriageRoutingTests() {
  console.log('Running Applications Engineering Triage Routing Tests...');
  const startTime = Date.now();

  const orgId = 'test-org-triage-001';
  const userId = 'test-user-triage-001';

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

  assert.ok(job.id, 'Job should be created');

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

  assert.ok(queueJobId, 'Queue job must be generated');

  const queueJob = await processQueueJob(queueJobId);
  const elapsedMs = Date.now() - startTime;
  const handlerResult = (queueJob.result || {}) as Record<string, any>;

  // 4. Assert SLA and handler outcome
  assert.ok(elapsedMs < 10000, `Execution time must be under 10 seconds (took ${elapsedMs}ms)`);
  assert.strictEqual(handlerResult.requiresAeTriage, true, 'Multi-body 1100mm assembly must trigger AE triage');
  assert.strictEqual(handlerResult.triageQueue, 'applications_engineering');
  assert.strictEqual(handlerResult.discreteBodies, 4, 'Must identify exactly 4 discrete bodies');
  assert.deepStrictEqual(handlerResult.envelope, { x: 1100.0, y: 650.0, z: 500.0 });

  // 5. Verify database job metadata updates
  const [updatedJob] = await db.select().from(jobs).where(eq(jobs.id, job.id as any)).limit(1);
  const meta = updatedJob.metadata as Record<string, any>;

  assert.strictEqual(meta.triage_queue, 'applications_engineering');
  assert.strictEqual(meta.cad_telemetry.discrete_bodies, 4);
  assert.deepStrictEqual(meta.cad_telemetry.envelope_mm, { x: 1100.0, y: 650.0, z: 500.0 });
  assert.ok(meta.triage_routed_at, 'Triage timestamp must be recorded');

  console.log(`All Triage Routing Tests passed in ${elapsedMs}ms (< 10s budget)!`);
  process.exit(0);
}

runTriageRoutingTests().catch((err) => {
  console.error('Triage Routing Test Failed:', err);
  process.exit(1);
});
