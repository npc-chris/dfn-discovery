/**
 * Hub Granite Plate Dial Test Indicator (DTI) Runout Audit Service
 * Standards: ISO 1101 (Geometrical Product Specifications - Tolerances of form, orientation, location and run-out)
 * Subsystem: SUB-09 (Quality, Inspection & Metrology)
 * Jira: KAN-42 [US-D-01]
 */

import crypto from 'crypto';
import {
  DtiRunoutAuditRequest,
  RunoutAuditRecord,
  RunoutAuditStatus,
} from '@dfn/shared';

export class DtiRunoutAuditService {
  /**
   * Verify calibration currency of metrology instruments per KAN-61 calibration registry.
   */
  public verifyCalibrationCurrency(
    calibrationDateStr: string,
    auditDateStr: string,
    validityDays = 365
  ): { isCurrent: boolean; daysElapsed: number } {
    const calDate = new Date(calibrationDateStr).getTime();
    const auditDate = new Date(auditDateStr).getTime();
    const diffMs = auditDate - calDate;
    const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const isCurrent = daysElapsed >= 0 && daysElapsed <= validityDays;
    return { isCurrent, daysElapsed };
  }

  /**
   * Execute ISO 1101 total indicated runout (TIR) audit on granite inspection table with V-blocks.
   */
  public auditRunout(request: DtiRunoutAuditRequest): RunoutAuditRecord {
    const validityDays = request.calibrationValidityDays ?? 365;
    const calCheck = this.verifyCalibrationCurrency(
      request.gaugeCalibrationDate,
      request.auditTimestamp,
      validityDays
    );

    const isWithinGdtLimit = request.measuredTirMm <= request.gdtRunoutSpecMm;
    const maxTirDeviationMm = parseFloat((request.measuredTirMm - request.gdtRunoutSpecMm).toFixed(4));

    let status: RunoutAuditStatus;
    let canProgressTraveler = false;

    if (!calCheck.isCurrent) {
      status = 'REJECTED_CALIBRATION_EXPIRED';
      canProgressTraveler = false;
    } else if (isWithinGdtLimit) {
      status = 'PASSED';
      canProgressTraveler = true;
    } else {
      status = 'FAILED';
      canProgressTraveler = false;
    }

    const auditedAt = request.auditTimestamp || new Date().toISOString();
    const rawAuditPayload = JSON.stringify({
      partId: request.partId,
      status,
      measuredTirMm: request.measuredTirMm,
      gdtRunoutSpecMm: request.gdtRunoutSpecMm,
      gaugeId: request.gaugeId,
      gaugeCalibrationDate: request.gaugeCalibrationDate,
      datums: request.datums,
      auditedAt,
    });
    const auditSealSha256 = crypto.createHash('sha256').update(rawAuditPayload).digest('hex');

    return {
      partId: request.partId,
      status,
      gdtRunoutSpecMm: request.gdtRunoutSpecMm,
      measuredTirMm: request.measuredTirMm,
      maxTirDeviationMm,
      isWithinGdtLimit,
      gaugeId: request.gaugeId,
      gaugeCalibrationDate: request.gaugeCalibrationDate,
      isCalibrationCurrent: calCheck.isCurrent,
      canProgressTraveler,
      auditSealSha256,
      auditedAt,
    };
  }
}
