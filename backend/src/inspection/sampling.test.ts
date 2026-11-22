/**
 * Double-Blind Hub Inspection Sampling Test Suite
 * Standard: ISO 2859-1 Level II / DFN Metrology Gate
 * Jira: KAN-60 [US-X-02]
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSampleSize,
  selectSampleIndices,
  generateBlindInspectionManifest,
  evaluateDoubleBlindAudit,
} from './sampling.js';
import { DeliveryBatchManifest, HubMeasurementSubmission } from '@dfn/shared';

describe('ISO 2859-1 Double-Blind Hub Inspection Sampling [KAN-60]', () => {
  describe('Sample Size & Pseudo-random Selection Invariants', () => {
    it('selects exactly 5 random sample brackets for a pilot batch of 200 mounting brackets', () => {
      const sampleSize = calculateSampleSize(200, true);
      expect(sampleSize).toBe(5);

      const indices = selectSampleIndices(200, sampleSize, 'pilot-seed-alpha');
      expect(indices).toHaveLength(5);
      expect(new Set(indices).size).toBe(5);
      indices.forEach((idx) => {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(200);
      });
    });

    it('enforces statutory 15% minimum sample rate across varying production lot sizes', () => {
      expect(calculateSampleSize(50)).toBe(8); // ceil(50 * 0.15) = 8
      expect(calculateSampleSize(100)).toBe(15); // ceil(100 * 0.15) = 15
      expect(calculateSampleSize(20)).toBe(5); // min sample floor of 5
      expect(calculateSampleSize(1000)).toBe(150);
      expect(calculateSampleSize(0)).toBe(0);
    });

    it('produces deterministic reproducible sample sets with identical seed', () => {
      const run1 = selectSampleIndices(500, 75, 'deterministic-lot-44');
      const run2 = selectSampleIndices(500, 75, 'deterministic-lot-44');
      expect(run1).toEqual(run2);

      const runDifferent = selectSampleIndices(500, 75, 'different-lot-99');
      expect(run1).not.toEqual(runDifferent);
    });
  });

  describe('Blind Data Masking Enforcement', () => {
    it('masks self-reported workshop measurement values from the inspector manifest', () => {
      const manifest: DeliveryBatchManifest = {
        batchId: 'BATCH-BRACKET-2026-001',
        jobId: 'JOB-MFG-9021',
        shopId: 'SHOP-BENIN-04',
        totalQuantity: 200,
        isPilot: true,
        seed: 'test-seed-mask',
        shopReportedMeasurements: Array.from({ length: 200 }, (_, i) => ({
          partIndex: i,
          dimensionName: 'bend_angle_degrees',
          nominalValue: 90.0,
          toleranceUpper: 0.1,
          toleranceLower: -0.1,
          measuredValue: 90.0,
          unit: 'deg',
        })),
      };

      const blindManifest = generateBlindInspectionManifest(manifest);

      expect(blindManifest.samplePartIndices).toHaveLength(5);
      expect(blindManifest.sampleItems).toHaveLength(5);

      blindManifest.sampleItems.forEach((item) => {
        expect(item).toHaveProperty('nominalValue', 90.0);
        expect(item).toHaveProperty('toleranceUpper', 0.1);
        expect(item).toHaveProperty('toleranceLower', -0.1);
        expect(item).not.toHaveProperty('measuredValue');
      });
    });
  });

  describe('Verification Audit & Escrow Authorization', () => {
    it('authorizes final escrow disbursement when hub measurement verifies 90.1° against 90.0° nominal', () => {
      const manifest: DeliveryBatchManifest = {
        batchId: 'BATCH-BRACKET-2026-002',
        jobId: 'JOB-MFG-9022',
        shopId: 'SHOP-BENIN-04',
        totalQuantity: 200,
        isPilot: true,
        seed: 'test-seed-pass',
        shopReportedMeasurements: [
          {
            partIndex: 12,
            dimensionName: 'bend_angle_degrees',
            nominalValue: 90.0,
            toleranceUpper: 0.1,
            toleranceLower: -0.1,
            measuredValue: 90.0,
            unit: 'deg',
          },
        ],
      };

      const hubSubmissions: HubMeasurementSubmission[] = [
        {
          partIndex: 12,
          dimensionName: 'bend_angle_degrees',
          hubMeasuredValue: 90.1, // Within 90.0 ± 0.1°
        },
      ];

      const report = evaluateDoubleBlindAudit(manifest, hubSubmissions);

      expect(report.verificationStatus).toBe('PASSED');
      expect(report.authorizeEscrowDisbursement).toBe(true);
      expect(report.trustScoreImpact).toBeGreaterThan(0);
      expect(report.auditSealSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(report.telemetry[0].varianceDelta).toBe(0.1);
      expect(report.telemetry[0].isWithinSpec).toBe(true);
    });

    it('rejects batch and freezes escrow disbursement when hub measurement is out of spec', () => {
      const manifest: DeliveryBatchManifest = {
        batchId: 'BATCH-BRACKET-2026-003',
        jobId: 'JOB-MFG-9023',
        shopId: 'SHOP-BENIN-04',
        totalQuantity: 200,
        isPilot: true,
        shopReportedMeasurements: [
          {
            partIndex: 44,
            dimensionName: 'bend_angle_degrees',
            nominalValue: 90.0,
            toleranceUpper: 0.1,
            toleranceLower: -0.1,
            measuredValue: 90.0,
            unit: 'deg',
          },
        ],
      };

      const hubSubmissions: HubMeasurementSubmission[] = [
        {
          partIndex: 44,
          dimensionName: 'bend_angle_degrees',
          hubMeasuredValue: 90.45, // Exceeds upper limit 90.1°
        },
      ];

      const report = evaluateDoubleBlindAudit(manifest, hubSubmissions);

      expect(report.verificationStatus).toBe('REJECTED');
      expect(report.authorizeEscrowDisbursement).toBe(false);
      expect(report.trustScoreImpact).toBe(-15.0);
      expect(report.telemetry[0].isWithinSpec).toBe(false);
    });

    it('detects variance exceeded when hub reading differs from shop claim beyond tolerance envelope', () => {
      const manifest: DeliveryBatchManifest = {
        batchId: 'BATCH-BRACKET-2026-004',
        jobId: 'JOB-MFG-9024',
        shopId: 'SHOP-WARRI-02',
        totalQuantity: 50,
        shopReportedMeasurements: [
          {
            partIndex: 5,
            dimensionName: 'slot_width_mm',
            nominalValue: 15.0,
            toleranceUpper: 0.2,
            toleranceLower: -0.2,
            measuredValue: 14.85,
            unit: 'mm',
          },
        ],
      };

      const hubSubmissions: HubMeasurementSubmission[] = [
        {
          partIndex: 5,
          dimensionName: 'slot_width_mm',
          hubMeasuredValue: 15.3, // Delta is |15.3 - 14.85| = 0.45 > tolerance band 0.4
        },
      ];

      const report = evaluateDoubleBlindAudit(manifest, hubSubmissions);

      expect(report.verificationStatus).toBe('REJECTED');
      expect(report.authorizeEscrowDisbursement).toBe(false);
    });
  });
});
