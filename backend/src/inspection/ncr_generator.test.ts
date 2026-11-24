/**
 * Non-Conformance Report (NCR) & Corrective Action Rework Test Suite
 * Standards: ISO 9001 Section 8.7 / DFN Quality Gate
 * Jira: KAN-43 [US-D-02]
 */

import { describe, it, expect } from 'vitest';
import { NcrGenerator } from './ncr_generator.js';
import { NcrInput } from '@dfn/shared';

describe('Non-Conformance Report (NCR) & Corrective Action Generation [KAN-43]', () => {
  const ncrGenerator = new NcrGenerator();

  describe('Solar Tracker Clevis Hole Pitch Non-Conformance Acceptance Criteria', () => {
    it('places job on HOLD_NCR, alerts Dr. Balogun and student team, and computes ₦12,500 offset bushing rework', () => {
      const input: NcrInput = {
        jobTravelerId: 'TRV-SOLAR-2026-88',
        partId: 'solar-tracker-clevis-01',
        partDescription: 'Solar Tracker Clevis Mount',
        measuredDimension: 121.8, // Spec is 120.00 ± 0.05 mm
        nominalDimension: 120.0,
        toleranceUpper: 0.05,
        toleranceLower: -0.05,
        unit: 'mm',
        caliperPhotoUrl: 'https://storage.fabnetwork.com.ng/qc/photos/clevis-pitch-error-88.jpg',
        inspectorId: 'inspector-chinedu',
        customerId: 'student_founder_team_01',
        supervisorId: 'Dr. Balogun',
      };

      const ncrDoc = ncrGenerator.generateNcr(input);

      // Verify Non-Conformance and Technical Hold
      expect(ncrDoc.status).toBe('HOLD_NCR');
      expect(ncrDoc.disposition).toBe('TECHNICAL_HOLD_PENDING_REWORK');
      expect(ncrDoc.ncrUuid).toMatch(/^NCR-[A-F0-9]{8}$/);
      expect(ncrDoc.measuredDeviationMm).toBe(1.8);
      expect(ncrDoc.caliperPhotoUrl).toBe(input.caliperPhotoUrl);

      // Verify Stakeholder Notifications (Supervisor and Student Team)
      expect(ncrDoc.notifications).toHaveLength(2);
      const supervisorAlert = ncrDoc.notifications.find((n) => n.recipientId === 'Dr. Balogun');
      expect(supervisorAlert).toBeDefined();
      expect(supervisorAlert?.role).toBe('SUPERVISOR');
      expect(supervisorAlert?.subject).toContain('[TECHNICAL HOLD]');
      expect(supervisorAlert?.message).toContain('HOLD_NCR');
      expect(supervisorAlert?.message).toContain('1.800 mm');

      const clientAlert = ncrDoc.notifications.find((n) => n.recipientId === 'student_founder_team_01');
      expect(clientAlert).toBeDefined();
      expect(clientAlert?.role).toBe('CLIENT');
      expect(clientAlert?.message).toContain('₦12,500');

      // Verify Corrective Rework Engineering Package
      expect(ncrDoc.reworkPackage.optionCode).toBe('RWK-OFFSET-BUSHING-01');
      expect(ncrDoc.reworkPackage.description).toBe('Offset slotted bushing rework');
      expect(ncrDoc.reworkPackage.costNgn).toBe(12500);
      expect(ncrDoc.reworkPackage.currency).toBe('NGN');
      expect(ncrDoc.reworkPackage.technicalDetails).toContain('1.80 mm pitch deviation');

      // Verify Cryptographic Seal
      expect(ncrDoc.auditSealSha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Engineering Rework Option Selection Logic', () => {
    it('selects offset slotted bushings for pitch deviations up to 3.0 mm', () => {
      const rework = ncrGenerator.computeReworkOption(2.4);
      expect(rework.optionCode).toBe('RWK-OFFSET-BUSHING-01');
      expect(rework.costNgn).toBe(12500);
    });

    it('selects weld buildup and remachining for severe deviations beyond 3.0 mm', () => {
      const rework = ncrGenerator.computeReworkOption(4.5);
      expect(rework.optionCode).toBe('RWK-WELD-REMACHINE-02');
      expect(rework.costNgn).toBe(28000);
    });
  });
});
