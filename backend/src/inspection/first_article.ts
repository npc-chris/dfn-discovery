/**
 * First-Article Out-Of-Tolerance Lockout Handler & Tool Offset Recalibration
 * Standards: ISO 9001 / DFN Workshop First-Article Inspection Gate
 * Subsystem: SUB-09 (Quality, Inspection & Metrology)
 * Jira: KAN-39 [US-C-02]
 */

import crypto from 'crypto';
import {
  FirstArticleInput,
  FirstArticleEvaluation,
  FirstArticleStatus,
  ToolOffsetGuide,
  SacrificialPieceSubmission,
} from '@dfn/shared';

// Registry of locked batches and their active inspection states
const batchStateRegistry = new Map<string, FirstArticleEvaluation>();

/**
 * Calculate CNC tool wear offset based on measured workpiece deviation and drawing tolerances.
 * For lathe turning OD where measured exceeds upper spec limit, derives negative tool wear offset.
 */
export function calculateToolWearOffset(
  measuredValue: number,
  nominalValue: number,
  toleranceUpper: number,
  toleranceLower: number
): { targetDimension: number; recommendedWearOffsetMm: number } {
  const toleranceBand = toleranceUpper - toleranceLower;
  const isOversized = measuredValue > nominalValue + toleranceUpper;
  const setpointOffset = isOversized ? toleranceUpper * 0.92 : toleranceLower + toleranceBand * 0.5;
  const targetDimension = parseFloat((nominalValue + setpointOffset).toFixed(3));
  const rawOffset = targetDimension - measuredValue;
  const recommendedWearOffsetMm = parseFloat(rawOffset.toFixed(3));

  return {
    targetDimension,
    recommendedWearOffsetMm,
  };
}

/**
 * Evaluate initial first-article inspection telemetry.
 * If dimension is out-of-tolerance, locks batch progress and computes tool wear offset guidance.
 */
export function evaluateFirstArticle(input: FirstArticleInput): FirstArticleEvaluation {
  const specMin = parseFloat((input.nominalValue + input.toleranceLower).toFixed(4));
  const specMax = parseFloat((input.nominalValue + input.toleranceUpper).toFixed(4));
  const measured = input.measuredValue;
  const deviationMm = parseFloat((measured - input.nominalValue).toFixed(4));

  const isWithinTolerance = measured >= specMin && measured <= specMax;
  const evaluatedAt = new Date().toISOString();

  let status: FirstArticleStatus;
  let batchLocked: boolean;
  let batchProgressDisabled: boolean;
  let lockoutReason: string | undefined;
  let offsetGuide: ToolOffsetGuide | undefined;

  if (isWithinTolerance) {
    status = 'FIRST_ARTICLE_ACCEPTED';
    batchLocked = false;
    batchProgressDisabled = false;
  } else {
    status = 'FIRST_ARTICLE_REJECTED';
    batchLocked = true;
    batchProgressDisabled = true;
    lockoutReason = 'FIRST ARTICLE REJECTED: BATCH LOCKED';

    const { targetDimension, recommendedWearOffsetMm } = calculateToolWearOffset(
      measured,
      input.nominalValue,
      input.toleranceUpper,
      input.toleranceLower
    );

    offsetGuide = {
      dimensionName: input.dimensionName,
      measuredValue: measured,
      nominalValue: input.nominalValue,
      targetDimension,
      recommendedWearOffsetMm,
      guidanceText: `Apply tool wear offset ${recommendedWearOffsetMm} mm on ${input.machineId} to achieve target ${targetDimension} mm. Run sacrificial piece prior to production run.`,
    };
  }

  const rawAudit = JSON.stringify({
    batchId: input.batchId,
    partId: input.partId,
    status,
    batchLocked,
    measured,
    specMin,
    specMax,
    evaluatedAt,
  });
  const auditSealSha256 = crypto.createHash('sha256').update(rawAudit).digest('hex');

  const record: FirstArticleEvaluation = {
    batchId: input.batchId,
    partId: input.partId,
    status,
    batchLocked,
    batchProgressDisabled,
    measuredValue: measured,
    specMin,
    specMax,
    deviationMm,
    lockoutReason,
    offsetGuide,
    auditSealSha256,
    evaluatedAt,
  };

  batchStateRegistry.set(input.batchId, record);
  return record;
}

/**
 * Submit sacrificial test piece measurement following machine offset recalibration.
 * Production remains locked until sacrificial piece demonstrates conformance within spec.
 */
export function verifySacrificialPiece(submission: SacrificialPieceSubmission): FirstArticleEvaluation {
  const existing = batchStateRegistry.get(submission.batchId);
  const specMin = parseFloat((submission.nominalValue + submission.toleranceLower).toFixed(4));
  const specMax = parseFloat((submission.nominalValue + submission.toleranceUpper).toFixed(4));
  const measured = submission.measuredValue;
  const deviationMm = parseFloat((measured - submission.nominalValue).toFixed(4));
  const isWithinSpec = measured >= specMin && measured <= specMax;
  const evaluatedAt = new Date().toISOString();

  let status: FirstArticleStatus;
  let batchLocked: boolean;
  let batchProgressDisabled: boolean;
  let lockoutReason: string | undefined;

  if (isWithinSpec) {
    status = 'UNLOCKED_SACRIFICIAL_PASSED';
    batchLocked = false;
    batchProgressDisabled = false;
  } else {
    status = 'FIRST_ARTICLE_REJECTED';
    batchLocked = true;
    batchProgressDisabled = true;
    lockoutReason = 'SACRIFICIAL PIECE OUT OF TOLERANCE: BATCH LOCKED';
  }

  const rawAudit = JSON.stringify({
    batchId: submission.batchId,
    status,
    batchLocked,
    measured,
    specMin,
    specMax,
    evaluatedAt,
  });
  const auditSealSha256 = crypto.createHash('sha256').update(rawAudit).digest('hex');

  const updated: FirstArticleEvaluation = {
    batchId: submission.batchId,
    partId: existing?.partId || 'sacrificial-piece',
    status,
    batchLocked,
    batchProgressDisabled,
    measuredValue: measured,
    specMin,
    specMax,
    deviationMm,
    lockoutReason,
    auditSealSha256,
    evaluatedAt,
  };

  batchStateRegistry.set(submission.batchId, updated);
  return updated;
}

/**
 * Check whether a batch run is currently locked out by first-article rejection.
 */
export function isBatchLocked(batchId: string): boolean {
  const record = batchStateRegistry.get(batchId);
  return record ? record.batchLocked : false;
}

/**
 * Clear batch state for test resets.
 */
export function resetBatchRegistry(): void {
  batchStateRegistry.clear();
}
