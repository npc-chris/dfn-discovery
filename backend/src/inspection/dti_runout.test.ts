/**
 * Hub Granite Plate Dial Test Indicator (DTI) Runout Audit Test Suite
 * Standards: ISO 1101 GD&T / KAN-61 Calibration Currency Gate
 * Jira: KAN-42 [US-D-01]
 */

import { describe, it, expect } from 'vitest';
import { DtiRunoutAuditService } from './dti_runout.js';
import { DtiRunoutAuditRequest } from '@dfn/shared';

describe('Hub Granite Plate Dial Indicator Runout Audit [KAN-42]', () => {
  const auditService = new DtiRunoutAuditService();

  describe('Conveyor Drum Roller TIR Verification Acceptance Criteria', () => {
    it('marks runout test as PASSED when turned conveyor drum roller logs 0.03 mm TIR against <= 0.05 mm spec', () => {
      const request: DtiRunoutAuditRequest = {
        partId: 'conveyor-drum-roller-01',
        partName: 'Turned Conveyor Drum Roller',
        profile: 'cylindrical_roller',
        gdtRunoutSpecMm: 0.05,
        measuredTirMm: 0.03, // Conforming runout on V-blocks
        datums: ['A', 'B'],
        gaugeId: 'DTI-402',
        gaugeCalibrationDate: '2026-06-15T08:00:00Z',
        auditTimestamp: '2026-11-22T14:30:00Z',
        inspectorId: 'inspector-uche',
      };

      const record = auditService.auditRunout(request);

      expect(record.status).toBe('PASSED');
      expect(record.canProgressTraveler).toBe(true);
      expect(record.isWithinGdtLimit).toBe(true);
      expect(record.measuredTirMm).toBe(0.03);
      expect(record.gdtRunoutSpecMm).toBe(0.05);
      expect(record.gaugeId).toBe('DTI-402');
      expect(record.gaugeCalibrationDate).toBe('2026-06-15T08:00:00Z');
      expect(record.isCalibrationCurrent).toBe(true);
      expect(record.auditSealSha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('KAN-61 Calibration Currency Enforcement', () => {
    it('rejects inspection and halts traveler progression when dial gauge calibration has expired', () => {
      const request: DtiRunoutAuditRequest = {
        partId: 'conveyor-drum-roller-02',
        partName: 'Turned Conveyor Drum Roller',
        profile: 'cylindrical_roller',
        gdtRunoutSpecMm: 0.05,
        measuredTirMm: 0.02, // Conforming runout reading
        datums: ['A', 'B'],
        gaugeId: 'DTI-EXPIRED-99',
        gaugeCalibrationDate: '2024-01-10T08:00:00Z', // 2+ years old, expired
        auditTimestamp: '2026-11-22T14:30:00Z',
        inspectorId: 'inspector-uche',
        calibrationValidityDays: 365,
      };

      const record = auditService.auditRunout(request);

      expect(record.status).toBe('REJECTED_CALIBRATION_EXPIRED');
      expect(record.canProgressTraveler).toBe(false);
      expect(record.isCalibrationCurrent).toBe(false);
    });
  });

  describe('GD&T Out-Of-Tolerance Runout Failure', () => {
    it('fails audit and halts traveler when measured TIR exceeds GD&T drawing specification', () => {
      const request: DtiRunoutAuditRequest = {
        partId: 'conveyor-drum-roller-03',
        partName: 'Eccentric Drive Roller',
        profile: 'cylindrical_roller',
        gdtRunoutSpecMm: 0.05,
        measuredTirMm: 0.078, // Out of spec (> 0.05 mm)
        datums: ['A', 'B'],
        gaugeId: 'DTI-402',
        gaugeCalibrationDate: '2026-06-15T08:00:00Z',
        auditTimestamp: '2026-11-22T14:30:00Z',
        inspectorId: 'inspector-uche',
      };

      const record = auditService.auditRunout(request);

      expect(record.status).toBe('FAILED');
      expect(record.canProgressTraveler).toBe(false);
      expect(record.isWithinGdtLimit).toBe(false);
      expect(record.maxTirDeviationMm).toBe(0.028);
    });
  });
});
