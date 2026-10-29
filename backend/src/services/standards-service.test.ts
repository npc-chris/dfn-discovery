import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/client';
import { factories, jobs } from '../db/schema';
import {
  searchStandards,
  lookupStandardByCode,
  resolveStandardEquivalents,
  importStandardsBulk,
  recordFactoryCertification,
  verifyFactoryCertification,
  evaluateJobStandardsCompliance,
} from './standards-service';
import { seedCanonicalStandards } from '../db/seeds/standards-seed';
import { createStageComplianceSpec } from '../db/queries';


describe('Standards & SDO Compliance Engine', () => {
  const testOrgId = 'test-org-standards';
  let testFactoryId: string;
  let testJobId: string;

  beforeEach(async () => {
    // 1. Seed canonical standards
    await seedCanonicalStandards();

    // 2. Create test factory
    const [factory] = await db
      .insert(factories)
      .values({
        org_id: testOrgId,
        factory_name: 'Apex Precision Metallurgy (Ikeja)',
        capabilities: { processes: ['cnc_milling', 'heat_treat', 'hard_anodize'] },
        materials: ['aluminum_6061', 'carbon_steel'],
        capacity_band: 'high',
        locations: [{ state: 'Lagos', lga: 'ikeja' }],
        verified_sources: ['cac', 'iso_9001'],
        active: true,
      })
      .returning();
    testFactoryId = factory.id;

    // 3. Create test job
    const [job] = await db
      .insert(jobs)
      .values({
        org_id: testOrgId,
        created_by: 'test-user',
        company_name: 'Trans-Sahara Energy Ltd',
        product_name: 'Structural Support Bracket',
        process_type: 'cnc_milling',
        material_type: 'carbon_steel',
        volume_band: 'medium',
        location: { state: 'Lagos' },
        status: 'submitted',
      })
      .returning();
    testJobId = job.id;
  });

  it('should seed and search canonical manufacturing standards across SDOs', async () => {
    // Search by SDO = SON
    const sonStandards = await searchStandards({ sdo: 'SON' });
    expect(sonStandards.total).toBeGreaterThanOrEqual(4);
    expect(sonStandards.data.some((s) => s.standard_code === 'NIS 102:2006')).toBe(true);

    // Search by Category = coatings
    const coatingStandards = await searchStandards({ category: 'coatings' });
    expect(coatingStandards.total).toBeGreaterThanOrEqual(2);
    expect(coatingStandards.data.some((s) => s.standard_code === 'MIL-A-8625')).toBe(true);

    // Search by Keyword = steel
    const keywordResults = await searchStandards({ q: 'steel' });
    expect(keywordResults.total).toBeGreaterThanOrEqual(3);
  });

  it('should lookup a standard by code with case & whitespace tolerance', async () => {
    const nis102 = await lookupStandardByCode('nis 102:2006');
    expect(nis102).toBeDefined();
    expect(nis102?.standard_code).toBe('NIS 102:2006');
    expect(nis102?.sdo).toBe('SON');

    const iso9001 = await lookupStandardByCode(' ISO 9001:2015 ');
    expect(iso9001).toBeDefined();
    expect(iso9001?.title).toContain('Quality Management');
  });

  it('should resolve international and Nigerian standard cross-reference equivalents', async () => {
    // 1. Resolve European standard BS EN 10025-2 -> Nigerian NIS 102
    const enResolution = await resolveStandardEquivalents('BS EN 10025-2');
    expect(enResolution).toBeDefined();
    expect(enResolution?.requested_standard.standard_code).toBe('BS EN 10025-2');
    expect(enResolution?.local_nigerian_equivalents.length).toBeGreaterThan(0);
    expect(enResolution?.local_nigerian_equivalents[0].standard_code).toBe('NIS 102:2006');

    // 2. Resolve NIS ISO 9001:2015 -> identical ISO 9001:2015
    const isoResolution = await resolveStandardEquivalents('NIS ISO 9001:2015');
    expect(isoResolution).toBeDefined();
    expect(isoResolution?.identical_standards.length).toBe(1);
    expect(isoResolution?.identical_standards[0].standard_code).toBe('ISO 9001:2015');

    // 3. Resolve NIS 102 -> ASTM A36 with property mapping
    const nisResolution = await resolveStandardEquivalents('NIS 102:2006');
    expect(nisResolution).toBeDefined();
    const astmEquiv = nisResolution?.equivalent_substitutes.find(
      (e) => e.standard.standard_code === 'ASTM A36/A36M',
    );
    expect(astmEquiv).toBeDefined();
    expect(astmEquiv?.equivalence_level).toBe('equivalent_substitute');
    expect((astmEquiv?.property_mapping as any)?.yield_strength_min_mpa).toBe(250);
  });

  it('should bulk import custom gazetted standards datasets', async () => {
    const customStandards = [
      {
        sdo: 'SON',
        standard_code: 'NIS 999:2026',
        title: 'Industrial Additive Manufacturing Polymer Requirements',
        category: 'materials' as const,
        status: 'active' as const,
        scope_summary: 'Covers filament quality and tensile testing for 3D printed components.',
      },
      {
        sdo: 'ARSO',
        standard_code: 'ARS 1440:2025',
        title: 'African Harmonized Code for Welded Steel Storage Vessels',
        category: 'pressure_vessels' as const,
        status: 'active' as const,
      },
    ];

    const result = await importStandardsBulk(customStandards);
    expect(result.imported).toBe(2);
    expect(result.errors.length).toBe(0);

    const importedNis = await lookupStandardByCode('NIS 999:2026');
    expect(importedNis).toBeDefined();
    expect(importedNis?.title).toContain('Additive Manufacturing');
  });

  it('should record, verify, and track factory certifications with IAF validation', async () => {
    // 1. Record factory certification claim
    const cert = await recordFactoryCertification({
      factoryId: testFactoryId,
      standardCode: 'NIS 102:2006',
      orgId: testOrgId,
      certificateNumber: 'SON/MANCAP/2026/0412',
      certificationBody: 'Standards Organisation of Nigeria (SON)',
      issuedAt: new Date('2025-01-01'),
      expiresAt: new Date('2027-01-01'),
      verificationStatus: 'unverified',
    });

    expect(cert.verification_status).toBe('unverified');
    expect(cert.is_iaf_verified).toBe(false);

    // 2. Verify certification with IAF CertSearch reference
    const verified = await verifyFactoryCertification(cert.id, testOrgId, {
      iafVerified: true,
      iafCertSearchId: 'IAF-CERT-NIG-998234',
    });

    expect(verified?.verification_status).toBe('verified');
    expect(verified?.is_iaf_verified).toBe(true);
    expect(verified?.iaf_certsearch_id).toBe('IAF-CERT-NIG-998234');
  });

  it('should evaluate job standards compliance and substitute equivalent standards', async () => {
    // 1. Factory holds verified Nigerian standard NIS 102:2006
    const cert = await recordFactoryCertification({
      factoryId: testFactoryId,
      standardCode: 'NIS 102:2006',
      orgId: testOrgId,
      certificationBody: 'SON',
      isIafVerified: true,
      verificationStatus: 'verified',
    });
    expect(cert).toBeDefined();

    // 2. Job stage mandates European standard BS EN 10025-2
    const enStd = await lookupStandardByCode('BS EN 10025-2');
    expect(enStd).toBeDefined();

    await createStageComplianceSpec({
      job_id: testJobId,
      stage_id: 'stage-1',
      standard_id: enStd!.id,
      org_id: testOrgId,
      is_mandatory: true,
      inspection_method: 'MTC',
    });

    // 3. Evaluate compliance: Engine resolves BS EN 10025-2 -> NIS 102:2006 equivalent!
    const compliance = await evaluateJobStandardsCompliance(
      testJobId,
      'stage-1',
      testFactoryId,
      testOrgId,
    );

    expect(compliance.compliancePassed).toBe(true);
    expect(compliance.complianceScore).toBe(100);
    expect(compliance.mandatoryViolations.length).toBe(0);
    expect(compliance.equivalentSubstitutions.length).toBe(1);
    expect(compliance.equivalentSubstitutions[0]).toContain('NIS 102:2006');
  });
});
