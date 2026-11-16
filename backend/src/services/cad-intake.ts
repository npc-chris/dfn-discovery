import { db } from '../db/client';
import { jobs, attachments } from '../db/schema';
import { eq } from 'drizzle-orm';
import { enqueueJob } from '../workers/queue';
import { AppError } from '../middleware/error';

export interface CadIntakeInput {
  jobId: string;
  orgId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  hashSha256?: string;
  storageUrl?: string;
  declaredBudgetCeilingNgn?: number;
}

export interface CadIntakeResult {
  jobId: string;
  attachmentId: string;
  filename: string;
  budgetCeilingNgn?: number;
  dispatchedToPrism: boolean;
  queueJobId?: string;
}

/**
 * Ingests CAD file metadata for an active job and dispatches asynchronous geometry analysis.
 * Enforces budget ceiling updates and creates an immutable attachment reference.
 */
export async function intakeCadAsset(input: CadIntakeInput): Promise<CadIntakeResult> {
  const [jobRow] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, input.jobId as any))
    .limit(1);

  if (!jobRow) {
    throw new AppError(404, `Job ${input.jobId} not found`);
  }

  // Update budget ceiling if declared on intake
  const existingMetadata = (jobRow.metadata || {}) as Record<string, unknown>;
  const updatedMetadata: Record<string, unknown> = {
    ...existingMetadata,
    cad_asset: {
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      hash_sha256: input.hashSha256 || null,
      storage_url: input.storageUrl || null,
      ingested_at: new Date().toISOString(),
    },
  };

  if (input.declaredBudgetCeilingNgn !== undefined) {
    updatedMetadata.target_ceiling_ngn = input.declaredBudgetCeilingNgn;
  }

  await db
    .update(jobs)
    .set({
      target_ceiling_ngn: input.declaredBudgetCeilingNgn ?? jobRow.target_ceiling_ngn,
      metadata: updatedMetadata,
      updated_at: new Date(),
    })
    .where(eq(jobs.id, input.jobId as any));

  // Persist attachment record
  const [attachmentRow] = await db
    .insert(attachments)
    .values({
      job_id: input.jobId as any,
      org_id: input.orgId,
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      source_type: 'file',
    })
    .returning();

  // Enqueue async intake job for CAD processing pipeline
  let queueJobId: string | undefined;
  let dispatchedToPrism = false;

  try {
    queueJobId = await enqueueJob('classify-job', input.jobId, {
      job_id: input.jobId,
      filename: input.filename,
      attachment_id: attachmentRow?.id,
      declared_budget_ceiling_ngn: input.declaredBudgetCeilingNgn,
    });
    dispatchedToPrism = true;
  } catch (err) {
    // If queue is in dev/offline mode, still complete the intake record
    console.warn('[cad-intake] Queue dispatch deferred:', err instanceof Error ? err.message : String(err));
  }

  return {
    jobId: input.jobId,
    attachmentId: attachmentRow?.id || 'mock-attachment-id',
    filename: input.filename,
    budgetCeilingNgn: input.declaredBudgetCeilingNgn,
    dispatchedToPrism,
    queueJobId,
  };
}
