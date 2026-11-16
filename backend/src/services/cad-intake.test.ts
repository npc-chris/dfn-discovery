import assert from 'assert';
import { db } from '../db/client';
import { jobs, attachments, job_queue } from '../db/schema';
import { eq } from 'drizzle-orm';
import { intakeCadAsset } from './cad-intake';
import { createJob } from './job-intake';

async function runCadIntakeTests() {
  console.log('Running CAD Intake & Dispatch Service Tests...');

  const orgId = 'test-org-cad-001';
  const userId = 'test-user-cad-001';

  // 1. Create a baseline job
  const job = await createJob(
    {
      company_name: 'AgroMech Innovations',
      product_name: 'Cassava Processing Drum Assembly',
      location: { country: 'Nigeria', state: 'Ogun' },
    },
    orgId,
    userId
  );

  assert.ok(job.id, 'Job should be created with valid ID');

  // 2. Ingest CAD asset with declared budget ceiling (₦85,000)
  const intakeResult = await intakeCadAsset({
    jobId: job.id,
    orgId,
    filename: 'cassava-drum-assembly.step',
    mimeType: 'application/step',
    sizeBytes: 4194304,
    declaredBudgetCeilingNgn: 85000,
  });

  assert.strictEqual(intakeResult.jobId, job.id);
  assert.strictEqual(intakeResult.filename, 'cassava-drum-assembly.step');
  assert.strictEqual(intakeResult.budgetCeilingNgn, 85000);
  assert.ok(intakeResult.attachmentId, 'Attachment ID should be returned');

  // 3. Verify database updates
  const [updatedJob] = await db.select().from(jobs).where(eq(jobs.id, job.id as any)).limit(1);
  assert.strictEqual(updatedJob.target_ceiling_ngn, 85000, 'target_ceiling_ngn should be set to ₦85,000');

  const meta = updatedJob.metadata as Record<string, any>;
  assert.ok(meta.cad_asset, 'Metadata must contain cad_asset block');
  assert.strictEqual(meta.cad_asset.filename, 'cassava-drum-assembly.step');

  const [attRecord] = await db.select().from(attachments).where(eq(attachments.id, intakeResult.attachmentId as any)).limit(1);
  assert.ok(attRecord, 'Attachment record must be persisted in database');
  assert.strictEqual(attRecord.mime_type, 'application/step');

  // 4. Verify 404 on missing job
  let notFoundCaught = false;
  try {
    await intakeCadAsset({
      jobId: '00000000-0000-0000-0000-000000000000',
      orgId,
      filename: 'orphan.step',
      mimeType: 'application/step',
      sizeBytes: 1024,
    });
  } catch (err: any) {
    if (err.statusCode === 404 || err.message.includes('not found')) {
      notFoundCaught = true;
    }
  }
  assert.ok(notFoundCaught, 'Should throw 404 when job does not exist');

  console.log('All CAD Intake & Dispatch Service Tests passed successfully!');
  process.exit(0);
}

runCadIntakeTests().catch((err) => {
  console.error('CAD Intake Test Failed:', err);
  process.exit(1);
});
