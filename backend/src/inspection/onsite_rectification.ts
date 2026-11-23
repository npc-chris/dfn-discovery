/**
 * Emergency On-Site Metrology Rectification Dispatcher & Field Milling Service
 * Standards: ISO 10012 (Measurement management systems) / Hot-Shot Field Rectification Protocol
 * Subsystem: SUB-10 (Emergency Breakdown & Hot-Shot Dispatch)
 * Jira: KAN-53 [US-G-02]
 */

import crypto from 'crypto';
import {
  EmergencyFitmentRejectionInput,
  MobileRectificationMission,
  MissionStatus,
} from '@dfn/shared';

// Registry tracking active emergency rectification missions
const missionRegistry = new Map<string, MobileRectificationMission>();

export class OnSiteRectificationDispatcher {
  /**
   * Calculate required skim cut and target dimensions to restore fitment within tolerance limits.
   * Targets process midpoint of tolerance band per ISO 10012 measurement management.
   */
  public calculateSkimOffset(
    measuredMm: number,
    nominalMm: number,
    toleranceUpperMm: number,
    toleranceLowerMm: number = 0.0
  ): { targetDimensionMm: number; requiredSkimCutMm: number } {
    const toleranceBand = toleranceUpperMm - toleranceLowerMm;
    const midToleranceOffset = toleranceLowerMm + toleranceBand * 0.5;
    const targetDimensionMm = parseFloat((nominalMm + midToleranceOffset).toFixed(3));
    // Stock removal required to enlarge undersized internal feature up to target dimension
    const requiredSkimCutMm = parseFloat(Math.abs(targetDimensionMm - measuredMm).toFixed(3));

    return {
      targetDimensionMm,
      requiredSkimCutMm,
    };
  }

  /**
   * Compute urgent technician dispatch schedule and transit arrival window.
   * Uses realistic logistics transit duration (minutes) from central hub to manufacturing cluster.
   */
  public computeDispatchEta(assemblyLocation: string, departureTimeStr?: string): string {
    const transitEstimatesMinutes: Record<string, number> = {
      agbara: 75,
      ikeja: 30,
      mushin: 45,
      apapa: 60,
      lekki: 90,
      sagamu: 105,
    };

    const loc = assemblyLocation.toLowerCase();
    let transitMinutes = 60; // Default 1 hour transit
    for (const [cluster, mins] of Object.entries(transitEstimatesMinutes)) {
      if (loc.includes(cluster)) {
        transitMinutes = mins;
        break;
      }
    }

    const baseDate = departureTimeStr ? new Date(departureTimeStr) : new Date();
    // WAT is UTC+1 (60 min offset from UTC)
    const arrivalEpochMs = baseDate.getTime() + (transitMinutes * 60 * 1000);
    const arrivalDate = new Date(arrivalEpochMs);

    const watHours = (arrivalDate.getUTCHours() + 1) % 24;
    const watMinutes = arrivalDate.getUTCMinutes();
    const period = watHours >= 12 ? 'PM' : 'AM';
    const displayHours = watHours % 12 || 12;

    return `${displayHours.toString().padStart(2, '0')}:${watMinutes.toString().padStart(2, '0')} ${period} WAT`;
  }

  /**
   * Dispatch mobile metrology technician, lock shop disbursement, and schedule portable rig.
   */
  public dispatchEmergencyMission(input: EmergencyFitmentRejectionInput): MobileRectificationMission {
    const { targetDimensionMm, requiredSkimCutMm } = this.calculateSkimOffset(
      input.measuredKeywayMm,
      input.nominalKeywayMm,
      input.toleranceUpperMm,
      input.toleranceLowerMm
    );

    const missionId = `HOTSHOT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const technicianDispatchEta = this.computeDispatchEta(input.assemblyLocation, input.rejectionTimestamp);
    const now = new Date().toISOString();

    const rawPayload = JSON.stringify({
      missionId,
      jobId: input.jobId,
      status: 'DISPATCHED_TO_SITE',
      assemblyLocation: input.assemblyLocation,
      preSkimDimensionMm: input.measuredKeywayMm,
      targetDimensionMm,
      requiredSkimCutMm,
      createdAt: now,
    });
    const auditSealSha256 = crypto.createHash('sha256').update(rawPayload).digest('hex');

    const mission: MobileRectificationMission = {
      missionId,
      jobId: input.jobId,
      status: 'DISPATCHED_TO_SITE',
      haltSupplierDisbursement: true,
      assemblyLocation: input.assemblyLocation,
      technicianDispatchEta,
      targetKeywayDimensionMm: targetDimensionMm,
      requiredSkimCutMm,
      equipmentAssigned: [
        'Portable magnetic milling rig',
        'Grade 0 tungsten carbide gauge block set',
        'Digital micrometer caliper 0-50mm (calibrated)',
      ],
      preSkimDimensionMm: input.measuredKeywayMm,
      travelerStatus: 'LOCKED_FITMENT_ERROR',
      auditSealSha256,
      createdAt: now,
    };

    missionRegistry.set(missionId, mission);
    return mission;
  }

  /**
   * Record on-site metrology verification measurement and digital traveler sign-off.
   */
  public verifyRestorationSignOff(
    missionId: string,
    postSkimDimensionMm: number,
    technicianId: string,
    plantManagerSignOff: string
  ): MobileRectificationMission {
    const mission = missionRegistry.get(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} not found in registry.`);
    }

    const isWithinSpec =
      postSkimDimensionMm >= mission.targetKeywayDimensionMm - 0.015 &&
      postSkimDimensionMm <= mission.targetKeywayDimensionMm + 0.015;

    const now = new Date().toISOString();
    let status: MissionStatus;
    let travelerStatus: 'LOCKED_FITMENT_ERROR' | 'UNLOCKED_RECTIFIED';

    if (isWithinSpec) {
      status = 'RECTIFIED_VERIFIED';
      travelerStatus = 'UNLOCKED_RECTIFIED';
    } else {
      status = 'REJECTED_UNRECOVERABLE';
      travelerStatus = 'LOCKED_FITMENT_ERROR';
    }

    const signOffRaw = `${missionId}|${technicianId}|${plantManagerSignOff}|${postSkimDimensionMm}|${now}`;
    const signatureHash = crypto.createHash('sha256').update(signOffRaw).digest('hex');

    mission.status = status;
    mission.postSkimDimensionMm = postSkimDimensionMm;
    mission.travelerStatus = travelerStatus;
    mission.digitalSignOff = {
      technicianId,
      plantManagerSignOff,
      verifiedAt: now,
      signatureHash,
    };

    missionRegistry.set(missionId, mission);
    return mission;
  }

  /**
   * Retrieve active mission from registry.
   */
  public getMission(missionId: string): MobileRectificationMission | undefined {
    return missionRegistry.get(missionId);
  }

  /**
   * Clear mission registry for test isolation.
   */
  public resetRegistry(): void {
    missionRegistry.clear();
  }
}
