import { describe, it, expect } from 'vitest';
import { db } from '../db/client';
import { jobs, attachments } from '../db/schema';
import { eq } from 'drizzle-orm';
import { intakeCadAsset } from './cad-intake';
import { createJob } from './job-intake';

describe('CAD Intake & Dispatch Service [KAN-71]', () => {
  const orgId = 'test-org-cad-001';
  const userId = 'test-user-cad-001';

  it('ingests CAD asset with declared budget ceiling and attaches record', async () => {
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

    expect(job.id).toBeDefined();

    // 2. Ingest CAD asset with declared budget ceiling (₦85,000)
    const intakeResult = await intakeCadAsset({
      jobId: job.id,
      orgId,
      filename: 'cassava-drum-assembly.step',
      mimeType: 'application/step',
      sizeBytes: 4194304,
      declaredBudgetCeilingNgn: 85000,
    });

    expect(intakeResult.jobId).toBe(job.id);
    expect(intakeResult.filename).toBe('cassava-drum-assembly.step');
    expect(intakeResult.budgetCeilingNgn).toBe(85000);
    expect(intakeResult.attachmentId).toBeDefined();

    // 3. Verify database updates
    const [updatedJob] = await db.select().from(jobs).where(eq(jobs.id, job.id as any)).limit(1);
    expect(updatedJob.target_ceiling_ngn).toBe(85000);

    const meta = updatedJob.metadata as Record<string, any>;
    expect(meta.cad_asset).toBeDefined();
    expect(meta.cad_asset.filename).toBe('cassava-drum-assembly.step');

    const [attRecord] = await db.select().from(attachments).where(eq(attachments.id, intakeResult.attachmentId as any)).limit(1);
    expect(attRecord).toBeDefined();
    expect(attRecord.mime_type).toBe('application/step');
  });

  it('throws 404 when target job does not exist', async () => {
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
    expect(notFoundCaught).toBe(true);
  });
});
