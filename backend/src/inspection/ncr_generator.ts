/**
 * Non-Conformance Report (NCR) & Corrective Action Rework Generator
 * Standards: ISO 9001 Section 8.7 (Control of nonconforming outputs)
 * Subsystem: SUB-09 (Quality, Inspection & Metrology)
 * Jira: KAN-43 [US-D-02]
 */

import crypto from 'crypto';
import {
  NcrInput,
  NCRDocument,
  ReworkPackageOption,
  StakeholderNotification,
} from '@dfn/shared';

export class NcrGenerator {
  /**
   * Determine engineering rework option for out-of-spec dimensions.
   * For hole pitch discrepancies, derives offset slotted bushing rework at ₦12,500 standard cost.
   */
  public computeReworkOption(measuredDeviationMm: number): ReworkPackageOption {
    const absDeviation = Math.abs(measuredDeviationMm);

    if (absDeviation <= 3.0) {
      return {
        optionCode: 'RWK-OFFSET-BUSHING-01',
        description: 'Offset slotted bushing rework',
        technicalDetails: `Precision ream hole to accept custom eccentric bushing compensating ${measuredDeviationMm.toFixed(2)} mm pitch deviation.`,
        costNgn: 12500,
        currency: 'NGN',
        leadTimeHours: 4,
      };
    }

    return {
      optionCode: 'RWK-WELD-REMACHINE-02',
      description: 'Weld buildup and CNC remachining',
      technicalDetails: 'TIG weld buildup on hole feature followed by CNC re-drilling to true nominal center.',
      costNgn: 28000,
      currency: 'NGN',
      leadTimeHours: 12,
    };
  }

  /**
   * Generate notifications for supervisor, customer, and manufacturing stakeholders.
   */
  public generateStakeholderNotifications(input: NcrInput, ncrUuid: string, deviationMm: number): StakeholderNotification[] {
    const now = new Date().toISOString();
    return [
      {
        recipientId: input.supervisorId,
        role: 'SUPERVISOR',
        subject: `[TECHNICAL HOLD] Non-Conformance Report ${ncrUuid} on ${input.jobTravelerId}`,
        message: `Hub inspector ${input.inspectorId} placed ${input.partDescription} (${input.partId}) on HOLD_NCR. Measured deviation: ${deviationMm.toFixed(3)} mm against spec ${input.nominalDimension} ±${input.toleranceUpper} mm. Caliper proof attached.`,
        dispatchedAt: now,
      },
      {
        recipientId: input.customerId,
        role: 'CLIENT',
        subject: `[DFN Quality Alert] Engineering Hold Notice for Traveler ${input.jobTravelerId}`,
        message: `Your part ${input.partDescription} deviated by ${deviationMm.toFixed(3)} mm during inspection. Recommended corrective rework: offset slotted bushings at ₦12,500.`,
        dispatchedAt: now,
      },
    ];
  }

  /**
   * Generate an immutable Non-Conformance Report and place component traveler on HOLD_NCR.
   */
  public generateNcr(input: NcrInput): NCRDocument {
    const deviationMm = parseFloat((input.measuredDimension - input.nominalDimension).toFixed(4));
    const now = new Date().toISOString();

    const ncrUuid = `NCR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const reworkPackage = this.computeReworkOption(deviationMm);
    const notifications = this.generateStakeholderNotifications(input, ncrUuid, deviationMm);

    const rawPayload = JSON.stringify({
      ncrUuid,
      jobTravelerId: input.jobTravelerId,
      partId: input.partId,
      status: 'HOLD_NCR',
      measuredDeviationMm: deviationMm,
      caliperPhotoUrl: input.caliperPhotoUrl,
      reworkPackage,
      createdAt: now,
    });
    const auditSealSha256 = crypto.createHash('sha256').update(rawPayload).digest('hex');

    return {
      ncrUuid,
      jobTravelerId: input.jobTravelerId,
      partId: input.partId,
      status: 'HOLD_NCR',
      disposition: 'TECHNICAL_HOLD_PENDING_REWORK',
      measuredDeviationMm: deviationMm,
      caliperPhotoUrl: input.caliperPhotoUrl,
      reworkPackage,
      notifications,
      auditSealSha256,
      createdAt: now,
    };
  }
}
