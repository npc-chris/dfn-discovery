/**
 * First-Article Out-Of-Tolerance Lockout & Sacrificial Re-verification Test Suite
 * Standard: ISO 9001 / DFN Workshop First-Article Gate
 * Jira: KAN-39 [US-C-02]
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateFirstArticle,
  verifySacrificialPiece,
  calculateToolWearOffset,
  isBatchLocked,
  resetBatchRegistry,
} from './first_article.js';
import { FirstArticleInput, SacrificialPieceSubmission } from '@dfn/shared';

describe('First-Article Rejection & Batch Run Lockout [KAN-39]', () => {
  beforeEach(() => {
    resetBatchRegistry();
  });

  describe('CNC Lathe First-Article Rejection & Tool Offset Guidance', () => {
    it('trips lockout and computes -0.022 mm tool wear offset when Sunday logs 48.045 mm on 48.000 +0.025/-0.000 mm spec', () => {
      const input: FirstArticleInput = {
        batchId: 'BATCH-BUSHING-2026-X1',
        operatorId: 'operator-sunday',
        machineId: 'CNC-LATHE-02',
        partId: 'turned-bronze-bushing-01',
        dimensionName: 'outer_diameter_mm',
        measuredValue: 48.045, // Out of spec: upper limit is 48.025 mm
        nominalValue: 48.000,
        toleranceUpper: 0.025,
        toleranceLower: 0.0,
        unit: 'mm',
      };

      const evalResult = evaluateFirstArticle(input);

      // Verify lockout trip
      expect(evalResult.status).toBe('FIRST_ARTICLE_REJECTED');
      expect(evalResult.batchLocked).toBe(true);
      expect(evalResult.batchProgressDisabled).toBe(true);
      expect(evalResult.lockoutReason).toBe('FIRST ARTICLE REJECTED: BATCH LOCKED');
      expect(isBatchLocked('BATCH-BUSHING-2026-X1')).toBe(true);

      // Verify tool wear offset guidance
      expect(evalResult.offsetGuide).toBeDefined();
      expect(evalResult.offsetGuide?.recommendedWearOffsetMm).toBe(-0.022);
      expect(evalResult.offsetGuide?.targetDimension).toBe(48.023);
      expect(evalResult.offsetGuide?.guidanceText).toContain('-0.022 mm');
      expect(evalResult.offsetGuide?.guidanceText).toContain('CNC-LATHE-02');

      // Verify cryptographic audit seal
      expect(evalResult.auditSealSha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it('calculates mathematical wear offset accurately across various tolerance ranges', () => {
      const { targetDimension, recommendedWearOffsetMm } = calculateToolWearOffset(50.08, 50.0, 0.05, 0.0);
      expect(targetDimension).toBe(50.046);
      expect(recommendedWearOffsetMm).toBe(-0.034);
    });
  });

  describe('Sacrificial Piece Re-Verification State Machine', () => {
    it('unlocks batch production only when sacrificial piece measurement passes', () => {
      // Step 1: Reject first article
      const firstArticle: FirstArticleInput = {
        batchId: 'BATCH-BUSHING-2026-X2',
        operatorId: 'operator-sunday',
        machineId: 'CNC-LATHE-02',
        partId: 'bushing-x2-01',
        dimensionName: 'outer_diameter_mm',
        measuredValue: 48.045,
        nominalValue: 48.000,
        toleranceUpper: 0.025,
        toleranceLower: 0.0,
        unit: 'mm',
      };
      evaluateFirstArticle(firstArticle);
      expect(isBatchLocked('BATCH-BUSHING-2026-X2')).toBe(true);

      // Step 2: Sunday machines a sacrificial piece after applying -0.022 mm offset
      const sacrificialPass: SacrificialPieceSubmission = {
        batchId: 'BATCH-BUSHING-2026-X2',
        operatorId: 'operator-sunday',
        measuredValue: 48.018, // Within 48.000 - 48.025 mm spec
        nominalValue: 48.000,
        toleranceUpper: 0.025,
        toleranceLower: 0.0,
      };

      const passResult = verifySacrificialPiece(sacrificialPass);
      expect(passResult.status).toBe('UNLOCKED_SACRIFICIAL_PASSED');
      expect(passResult.batchLocked).toBe(false);
      expect(passResult.batchProgressDisabled).toBe(false);
      expect(isBatchLocked('BATCH-BUSHING-2026-X2')).toBe(false);
    });

    it('maintains lockout if sacrificial piece is still out of tolerance', () => {
      const firstArticle: FirstArticleInput = {
        batchId: 'BATCH-BUSHING-2026-X3',
        operatorId: 'operator-sunday',
        machineId: 'CNC-LATHE-02',
        partId: 'bushing-x3-01',
        dimensionName: 'outer_diameter_mm',
        measuredValue: 48.045,
        nominalValue: 48.000,
        toleranceUpper: 0.025,
        toleranceLower: 0.0,
        unit: 'mm',
      };
      evaluateFirstArticle(firstArticle);

      const sacrificialFail: SacrificialPieceSubmission = {
        batchId: 'BATCH-BUSHING-2026-X3',
        operatorId: 'operator-sunday',
        measuredValue: 48.032, // Still out of tolerance (> 48.025)
        nominalValue: 48.000,
        toleranceUpper: 0.025,
        toleranceLower: 0.0,
      };

      const failResult = verifySacrificialPiece(sacrificialFail);
      expect(failResult.status).toBe('FIRST_ARTICLE_REJECTED');
      expect(failResult.batchLocked).toBe(true);
      expect(failResult.batchProgressDisabled).toBe(true);
      expect(isBatchLocked('BATCH-BUSHING-2026-X3')).toBe(true);
    });
  });

  describe('Conforming First-Article Direct Acceptance', () => {
    it('accepts first article without lockout when measured dimension is within tolerance', () => {
      const input: FirstArticleInput = {
        batchId: 'BATCH-BUSHING-2026-X4',
        operatorId: 'operator-sunday',
        machineId: 'CNC-LATHE-02',
        partId: 'turned-bronze-bushing-04',
        dimensionName: 'outer_diameter_mm',
        measuredValue: 48.012, // Within 48.000 - 48.025 mm spec
        nominalValue: 48.000,
        toleranceUpper: 0.025,
        toleranceLower: 0.0,
        unit: 'mm',
      };

      const evalResult = evaluateFirstArticle(input);

      expect(evalResult.status).toBe('FIRST_ARTICLE_ACCEPTED');
      expect(evalResult.batchLocked).toBe(false);
      expect(evalResult.batchProgressDisabled).toBe(false);
      expect(evalResult.lockoutReason).toBeUndefined();
      expect(isBatchLocked('BATCH-BUSHING-2026-X4')).toBe(false);
    });
  });
});
