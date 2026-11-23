/**
 * ISO 2859-1 Double-Blind Hub Inspection Sampling
 * Standard: ISO 2859-1 Level II Normal Single Sampling / Statutory 15% Verification Gate
 * Subsystem: SUB-09 (Quality, Inspection & Metrology)
 * Jira: KAN-60 [US-X-02]
 */

import crypto from 'crypto';
import {
  DeliveryBatchManifest,
  BlindInspectionManifest,
  BlindSampleItem,
  HubMeasurementSubmission,
  MeasurementVarianceTelemetry,
  DoubleBlindAuditReport,
  DoubleBlindVerificationStatus,
} from '@dfn/shared';

/**
 * Seeded pseudo-random number generator (Mulberry32) for deterministic sampling.
 */
function createPrng(seedStr: string | number): () => number {
  let h = 0;
  if (typeof seedStr === 'number') {
    h = seedStr >>> 0;
  } else {
    for (let i = 0; i < seedStr.length; i++) {
      h = (Math.imul(31, h) + seedStr.charCodeAt(i)) >>> 0;
    }
  }
  return function (): number {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Calculate ISO 2859-1 / 15% sample size based on lot quantity.
 * For pilot verification runs, applies the statutory pilot gate (minimum 5 units).
 */
export function calculateSampleSize(totalQuantity: number, isPilot = false): number {
  if (totalQuantity <= 0) return 0;
  if (isPilot) {
    return Math.min(totalQuantity, 5);
  }
  const calculated = Math.ceil(totalQuantity * 0.15);
  return Math.min(totalQuantity, Math.max(5, calculated));
}

/**
 * Generate cryptographically verifiable or seeded sample indices without replacement.
 */
export function selectSampleIndices(totalQuantity: number, sampleSize: number, seed?: string | number): number[] {
  const prng = seed !== undefined ? createPrng(seed) : null;
  const indices: number[] = [];
  const pool = Array.from({ length: totalQuantity }, (_, i) => i);

  const targetSize = Math.min(totalQuantity, sampleSize);
  for (let i = 0; i < targetSize; i++) {
    const r = prng ? prng() : crypto.randomBytes(4).readUInt32BE(0) / 0xffffffff;
    const selectedIdx = Math.floor(r * pool.length);
    indices.push(pool[selectedIdx]);
    pool.splice(selectedIdx, 1);
  }

  return indices.sort((a, b) => a - b);
}

/**
 * Generate a blind inspection manifest for hub metrology inspectors.
 * Masks self-reported workshop readings so inspectors cannot be biased by shop telemetry.
 */
export function generateBlindInspectionManifest(manifest: DeliveryBatchManifest): BlindInspectionManifest {
  const sampleSize = calculateSampleSize(manifest.totalQuantity, manifest.isPilot);
  const sampleIndices = selectSampleIndices(manifest.totalQuantity, sampleSize, manifest.seed);

  const sampleItems: BlindSampleItem[] = [];

  for (const idx of sampleIndices) {
    const shopRecords = manifest.shopReportedMeasurements.filter((m) => m.partIndex === idx);
    if (shopRecords.length > 0) {
      for (const rec of shopRecords) {
        sampleItems.push({
          partIndex: rec.partIndex,
          dimensionName: rec.dimensionName,
          nominalValue: rec.nominalValue,
          toleranceUpper: rec.toleranceUpper,
          toleranceLower: rec.toleranceLower,
          unit: rec.unit,
        });
      }
    } else {
      sampleItems.push({
        partIndex: idx,
        dimensionName: 'general_inspection',
        nominalValue: 0,
        toleranceUpper: 0.1,
        toleranceLower: -0.1,
        unit: 'mm',
      });
    }
  }

  return {
    batchId: manifest.batchId,
    jobId: manifest.jobId,
    samplePartIndices: sampleIndices,
    sampleItems,
    generatedAt: new Date().toISOString(),
    samplingStandard: manifest.isPilot ? 'STATUTORY_15_PERCENT' : 'ISO_2859_1_LEVEL_II',
  };
}

/**
 * Evaluate blind hub measurements against workshop claims and tolerance specs.
 */
export function evaluateDoubleBlindAudit(
  manifest: DeliveryBatchManifest,
  hubSubmissions: HubMeasurementSubmission[]
): DoubleBlindAuditReport {
  const telemetry: MeasurementVarianceTelemetry[] = [];
  let allWithinSpec = true;
  let varianceExceeded = false;

  for (const sub of hubSubmissions) {
    const shopRecord = manifest.shopReportedMeasurements.find(
      (m) => m.partIndex === sub.partIndex && m.dimensionName === sub.dimensionName
    );

    const nominal = shopRecord ? shopRecord.nominalValue : 0;
    const specUpper = shopRecord ? nominal + shopRecord.toleranceUpper : 0.1;
    const specLower = shopRecord ? nominal + shopRecord.toleranceLower : -0.1;
    const shopVal = shopRecord ? shopRecord.measuredValue : 0;
    const hubVal = sub.hubMeasuredValue;

    const delta = Math.abs(hubVal - shopVal);
    const isWithinSpec = hubVal >= specLower && hubVal <= specUpper;

    const toleranceBand = specUpper - specLower;
    const itemVarianceExceeded = delta > toleranceBand;

    if (!isWithinSpec) {
      allWithinSpec = false;
    }
    if (itemVarianceExceeded) {
      varianceExceeded = true;
    }

    telemetry.push({
      partIndex: sub.partIndex,
      dimensionName: sub.dimensionName,
      nominalValue: nominal,
      specUpper,
      specLower,
      shopReportedValue: shopVal,
      hubMeasuredValue: hubVal,
      varianceDelta: parseFloat(delta.toFixed(4)),
      isWithinSpec,
      varianceExceeded: itemVarianceExceeded,
    });
  }

  let status: DoubleBlindVerificationStatus = 'PASSED';
  let authorizeDisbursement = false;
  let trustImpact = 0;

  if (!allWithinSpec) {
    status = 'REJECTED';
    authorizeDisbursement = false;
    trustImpact = -15.0;
  } else if (varianceExceeded) {
    status = 'VARIANCE_EXCEEDED';
    authorizeDisbursement = false;
    trustImpact = -5.0;
  } else {
    status = 'PASSED';
    authorizeDisbursement = true;
    trustImpact = 2.5;
  }

  const inspectedAt = new Date().toISOString();
  const rawPayload = JSON.stringify({
    batchId: manifest.batchId,
    status,
    authorizeDisbursement,
    telemetry,
    inspectedAt,
  });
  const auditSealSha256 = crypto.createHash('sha256').update(rawPayload).digest('hex');

  return {
    batchId: manifest.batchId,
    verificationStatus: status,
    sampleSize: hubSubmissions.length,
    telemetry,
    authorizeEscrowDisbursement: authorizeDisbursement,
    trustScoreImpact: trustImpact,
    auditSealSha256,
    inspectedAt,
  };
}
