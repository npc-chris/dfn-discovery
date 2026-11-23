/**
 * Emergency On-Site Metrology Rectification Test Suite
 * Standards: ISO 10012 / Hot-Shot Field Rectification Protocol
 * Jira: KAN-53 [US-G-02]
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OnSiteRectificationDispatcher } from './onsite_rectification.js';
import { EmergencyFitmentRejectionInput } from '@dfn/shared';

describe('Emergency On-Site Metrology Rectification [KAN-53]', () => {
  let dispatcher: OnSiteRectificationDispatcher;

  beforeEach(() => {
    dispatcher = new OnSiteRectificationDispatcher();
    dispatcher.resetRegistry();
  });

  describe('Emergency Kiln Shaft Keyway Skim Dispatch Acceptance Criteria', () => {
    it('halts supplier release, dispatches magnetic milling rig by 3:45 AM, and sets 25.012 mm target when Danladi logs 24.72 mm keyway', () => {
      const input: EmergencyFitmentRejectionInput = {
        jobId: 'JOB-KILN-SHAFT-909',
        partDescription: 'Emergency Kiln Shaft Keyway',
        measuredKeywayMm: 24.72, // Spec is 25.000 +0.021/-0.000 mm
        nominalKeywayMm: 25.0,
        toleranceUpperMm: 0.021,
        toleranceLowerMm: 0.0,
        gaugeBlockPhotos: [
          'https://storage.fabnetwork.com.ng/qc/photos/agbara-keyway-pre-skim-01.jpg',
        ],
        assemblyLocation: 'Agbara Industrial Estate, Ogun State',
        loggedBy: 'Danladi',
        rejectionTimestamp: '2026-11-22T01:15:00Z',
      };

      const mission = dispatcher.dispatchEmergencyMission(input);

      // Verify Milestone Escrow Withhold
      expect(mission.haltSupplierDisbursement).toBe(true);
      expect(mission.travelerStatus).toBe('LOCKED_FITMENT_ERROR');
      expect(mission.status).toBe('DISPATCHED_TO_SITE');

      // Verify Target Restoration Dimension & Skim Cut Offset (Midpoint of 25.000 +0.021/-0.000 zone)
      expect(mission.targetKeywayDimensionMm).toBe(25.011);
      expect(mission.requiredSkimCutMm).toBe(0.291);

      // Verify Dispatch ETA and Tooling Rig Assignment
      expect(mission.technicianDispatchEta).toBe('03:30 AM WAT'); // Prior to 3:45 AM deadline
      expect(mission.equipmentAssigned).toContain('Portable magnetic milling rig');

      // Verify Cryptographic Seal
      expect(mission.auditSealSha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('On-Site Skim Verification & Digital Traveler Sign-Off', () => {
    it('unlocks restored traveler upon 25.012 mm metrology sign-off', () => {
      const input: EmergencyFitmentRejectionInput = {
        jobId: 'JOB-KILN-SHAFT-910',
        partDescription: 'Emergency Kiln Shaft Keyway',
        measuredKeywayMm: 24.72,
        nominalKeywayMm: 25.0,
        toleranceUpperMm: 0.021,
        toleranceLowerMm: 0.0,
        gaugeBlockPhotos: ['https://storage.fabnetwork.com.ng/qc/photos/keyway.jpg'],
        assemblyLocation: 'Agbara Industrial Estate',
        loggedBy: 'Danladi',
        rejectionTimestamp: '2026-11-22T01:15:00Z',
      };

      const mission = dispatcher.dispatchEmergencyMission(input);

      // Field technician skims keyway on-site to 25.012 mm
      const completedMission = dispatcher.verifyRestorationSignOff(
        mission.missionId,
        25.012,
        'tech-babatunde',
        'Plant Manager Danladi'
      );

      expect(completedMission.status).toBe('RECTIFIED_VERIFIED');
      expect(completedMission.travelerStatus).toBe('UNLOCKED_RECTIFIED');
      expect(completedMission.postSkimDimensionMm).toBe(25.012);
      expect(completedMission.digitalSignOff).toBeDefined();
      expect(completedMission.digitalSignOff?.technicianId).toBe('tech-babatunde');
      expect(completedMission.digitalSignOff?.plantManagerSignOff).toBe('Plant Manager Danladi');
      expect(completedMission.digitalSignOff?.signatureHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('rejects mission when on-site post-skim reading remains outside allowable tolerance', () => {
      const input: EmergencyFitmentRejectionInput = {
        jobId: 'JOB-KILN-SHAFT-911',
        partDescription: 'Emergency Kiln Shaft Keyway',
        measuredKeywayMm: 24.72,
        nominalKeywayMm: 25.0,
        toleranceUpperMm: 0.021,
        toleranceLowerMm: 0.0,
        gaugeBlockPhotos: ['https://storage.fabnetwork.com.ng/qc/photos/keyway.jpg'],
        assemblyLocation: 'Ikeja Industrial Zone',
        loggedBy: 'Danladi',
        rejectionTimestamp: '2026-11-22T01:15:00Z',
      };

      const mission = dispatcher.dispatchEmergencyMission(input);

      // Skimming overcuts to 25.08 mm (far outside tolerance)
      const failedMission = dispatcher.verifyRestorationSignOff(
        mission.missionId,
        25.08,
        'tech-babatunde',
        'Plant Manager Danladi'
      );

      expect(failedMission.status).toBe('REJECTED_UNRECOVERABLE');
      expect(failedMission.travelerStatus).toBe('LOCKED_FITMENT_ERROR');
    });
  });
});
