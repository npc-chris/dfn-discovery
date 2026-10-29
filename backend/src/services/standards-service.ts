/**
 * Standards & SDO Compliance Engine Service
 *
 * Implements the standards management, cross-referencing, and certification
 * verification architecture specified in docs/DFN_STANDARDS_AND_SDO_ARCHITECTURE.md.
 *
 * Responsibilities:
 * - Search, catalog, and index multi-SDO manufacturing standards (SON, ISO, ASTM, ASME, API, AWS, DIN)
 * - Bulk ingestion of official gazetted SON NIS catalogs
 * - Canonical cross-reference resolution (mapping international specs to local Nigerian equivalents)
 * - Factory accreditation & certification tracking with IAF verification
 * - Hard gating and compliance scoring evaluation
 */

import {
  upsertStandard,
  getStandardById,
  getStandardByCode,
  searchStandardsCatalog,
  createCrossReference,
  getCrossReferencesForStandard,
  createFactoryCertification,
  getFactoryCertifications,
  updateFactoryCertification,
  getStageComplianceSpecsForJob,
} from '../db/queries';
import type {
  StandardDefinition,
  StandardInput,
  StandardsSearchParams,
  CrossReferenceResolution,
  EquivalenceLevel,
} from '@dfn/shared';

/**
 * Search the indexed standards catalog
 */
export async function searchStandards(params?: StandardsSearchParams) {
  return searchStandardsCatalog(params);
}

/**
 * Get standard details by ID
 */
export async function getStandard(id: string) {
  return getStandardById(id);
}

/**
 * Lookup standard by code with case & whitespace tolerance
 */
export async function lookupStandardByCode(code: string) {
  return getStandardByCode(code);
}

/**
 * Bulk import standards from structured JSON/CSV payloads (e.g. SON gazetted catalogs)
 */
export async function importStandardsBulk(
  standards: StandardInput[],
  options?: { defaultSdo?: string },
): Promise<{ imported: number; errors: string[] }> {
  let imported = 0;
  const errors: string[] = [];

  for (let i = 0; i < standards.length; i++) {
    const item = standards[i];
    try {
      if (!item.standard_code || !item.title) {
        errors.push(`Row ${i + 1}: Missing standard_code or title`);
        continue;
      }

      await upsertStandard({
        sdo: item.sdo || options?.defaultSdo || 'SON',
        standard_code: item.standard_code.trim(),
        title: item.title.trim(),
        category: item.category || 'materials',
        status: item.status || 'active',
        scope_summary: item.scope_summary || null,
        ics_code: item.ics_code || null,
        metadata: item.metadata || null,
        published_date: item.published_date ? new Date(item.published_date) : null,
      });

      imported++;
    } catch (err) {
      errors.push(`Row ${i + 1} (${item.standard_code}): ${String(err)}`);
    }
  }

  return { imported, errors };
}

/**
 * Resolve international and Nigerian standard equivalents (The Cross-Reference Engine)
 */
export async function resolveStandardEquivalents(
  standardCode: string,
): Promise<CrossReferenceResolution | null> {
  const standard = await getStandardByCode(standardCode);
  if (!standard) {
    return null;
  }

  const crossRefs = await getCrossReferencesForStandard(standard.id);

  const identical_standards: StandardDefinition[] = [];
  const equivalent_substitutes: Array<{
    standard: StandardDefinition;
    equivalence_level: EquivalenceLevel;
    technical_notes?: string | null;
    property_mapping?: Record<string, unknown> | null;
  }> = [];
  const local_nigerian_equivalents: StandardDefinition[] = [];

  const seenIds = new Set<string>();

  // Process all linked standards
  const allLinks = [
    ...crossRefs.asSource.map((s) => ({
      linked: s.linkedStandard,
      level: s.crossRef.equivalence_level as EquivalenceLevel,
      notes: s.crossRef.technical_notes,
      props: s.crossRef.property_mapping as Record<string, unknown> | null,
    })),
    ...crossRefs.asTarget.map((t) => ({
      linked: t.linkedStandard,
      level: t.crossRef.equivalence_level as EquivalenceLevel,
      notes: t.crossRef.technical_notes,
      props: t.crossRef.property_mapping as Record<string, unknown> | null,
    })),
  ];

  for (const link of allLinks) {
    if (seenIds.has(link.linked.id)) continue;
    seenIds.add(link.linked.id);

    const stdDef: StandardDefinition = {
      id: link.linked.id,
      sdo: link.linked.sdo,
      standard_code: link.linked.standard_code,
      title: link.linked.title,
      category: link.linked.category as any,
      status: link.linked.status as any,
      scope_summary: link.linked.scope_summary,
      ics_code: link.linked.ics_code,
      metadata: link.linked.metadata as any,
      published_date: link.linked.published_date,
      created_at: link.linked.created_at,
      updated_at: link.linked.updated_at,
    };

    if (link.level === 'identical') {
      identical_standards.push(stdDef);
    } else {
      equivalent_substitutes.push({
        standard: stdDef,
        equivalence_level: link.level,
        technical_notes: link.notes,
        property_mapping: link.props,
      });
    }

    if (link.linked.sdo.toUpperCase() === 'SON' || link.linked.standard_code.toUpperCase().startsWith('NIS')) {
      local_nigerian_equivalents.push(stdDef);
    }
  }

  return {
    requested_standard: {
      id: standard.id,
      sdo: standard.sdo,
      standard_code: standard.standard_code,
      title: standard.title,
      category: standard.category as any,
      status: standard.status as any,
      scope_summary: standard.scope_summary,
      ics_code: standard.ics_code,
      metadata: standard.metadata as any,
      published_date: standard.published_date,
      created_at: standard.created_at,
      updated_at: standard.updated_at,
    },
    identical_standards,
    equivalent_substitutes,
    local_nigerian_equivalents,
  };
}

/**
 * Link two standards with an equivalence cross-reference
 */
export async function linkStandardEquivalence(data: {
  sourceCode: string;
  targetCode: string;
  equivalenceLevel: EquivalenceLevel;
  technicalNotes?: string;
  propertyMapping?: Record<string, unknown>;
}) {
  const [source, target] = await Promise.all([
    getStandardByCode(data.sourceCode),
    getStandardByCode(data.targetCode),
  ]);

  if (!source || !target) {
    throw new Error(`Standards not found: source=${data.sourceCode}, target=${data.targetCode}`);
  }

  return createCrossReference({
    source_standard_id: source.id,
    target_standard_id: target.id,
    equivalence_level: data.equivalenceLevel,
    technical_notes: data.technicalNotes,
    property_mapping: data.propertyMapping,
  });
}

/**
 * Factory Certification & IAF Verification Engine
 */
export async function recordFactoryCertification(data: {
  factoryId: string;
  standardCode: string;
  orgId: string;
  certificateNumber?: string;
  certificationBody: string;
  iafCertSearchId?: string;
  isIafVerified?: boolean;
  issuedAt?: Date | string;
  expiresAt?: Date | string;
  verificationStatus?: 'verified' | 'unverified' | 'expired';
}) {
  let standard = await getStandardByCode(data.standardCode);
  if (!standard) {
    // Auto-create standard in catalog if missing
    standard = await upsertStandard({
      sdo: data.standardCode.split(' ')[0] || 'ISO',
      standard_code: data.standardCode.trim(),
      title: `${data.standardCode} Standard`,
      category: 'quality',
    });
  }

  return createFactoryCertification({
    factory_id: data.factoryId,
    standard_id: standard.id,
    org_id: data.orgId,
    certificate_number: data.certificateNumber,
    certification_body: data.certificationBody,
    iaf_certsearch_id: data.iafCertSearchId,
    is_iaf_verified: data.isIafVerified ?? false,
    issued_at: data.issuedAt ? new Date(data.issuedAt) : null,
    expires_at: data.expiresAt ? new Date(data.expiresAt) : null,
    verification_status: data.verificationStatus || (data.isIafVerified ? 'verified' : 'unverified'),
  });
}

export async function verifyFactoryCertification(
  certId: string,
  orgId: string,
  options?: { iafVerified?: boolean; iafCertSearchId?: string },
) {
  return updateFactoryCertification(certId, orgId, {
    verification_status: 'verified',
    is_iaf_verified: options?.iafVerified ?? true,
    iaf_certsearch_id: options?.iafCertSearchId,
  });
}

/**
 * Evaluate Stage Standards Compliance for DAG Routing
 */
export async function evaluateJobStandardsCompliance(
  jobId: string,
  stageId: string,
  factoryId: string,
  orgId: string,
): Promise<{
  compliancePassed: boolean;
  complianceScore: number;
  mandatoryViolations: string[];
  matchedCertifications: string[];
  equivalentSubstitutions: string[];
}> {
  const [stageSpecs, factoryCerts] = await Promise.all([
    getStageComplianceSpecsForJob(jobId, orgId),
    getFactoryCertifications(factoryId, orgId),
  ]);

  const relevantSpecs = stageSpecs.filter((s) => s.spec.stage_id === stageId);
  if (relevantSpecs.length === 0) {
    return {
      compliancePassed: true,
      complianceScore: 100,
      mandatoryViolations: [],
      matchedCertifications: [],
      equivalentSubstitutions: [],
    };
  }

  const factoryStandardIds = new Set(
    factoryCerts
      .filter((c) => c.certification.verification_status === 'verified')
      .map((c) => c.standard.id),
  );

  const matchedCertifications: string[] = [];
  const equivalentSubstitutions: string[] = [];
  const mandatoryViolations: string[] = [];

  for (const req of relevantSpecs) {
    const requiredStd = req.standard;
    // Direct match
    if (factoryStandardIds.has(requiredStd.id)) {
      matchedCertifications.push(requiredStd.standard_code);
      continue;
    }

    // Check equivalent substitutions
    const resolution = await resolveStandardEquivalents(requiredStd.standard_code);
    let foundEquivalent = false;

    if (resolution) {
      for (const eqStd of [...resolution.identical_standards, ...resolution.local_nigerian_equivalents]) {
        if (factoryStandardIds.has(eqStd.id)) {
          matchedCertifications.push(eqStd.standard_code);
          equivalentSubstitutions.push(
            `${requiredStd.standard_code} matched via local equivalent ${eqStd.standard_code}`,
          );
          foundEquivalent = true;
          break;
        }
      }
    }

    if (!foundEquivalent && req.spec.is_mandatory) {
      mandatoryViolations.push(requiredStd.standard_code);
    }
  }

  const compliancePassed = mandatoryViolations.length === 0;
  const complianceScore = compliancePassed
    ? Math.min(
        100,
        Math.round(
          (matchedCertifications.length / Math.max(1, relevantSpecs.length)) * 100,
        ),
      )
    : 30;

  return {
    compliancePassed,
    complianceScore,
    mandatoryViolations,
    matchedCertifications,
    equivalentSubstitutions,
  };
}

