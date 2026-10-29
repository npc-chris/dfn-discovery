/**
 * Standards and Standards Development Organization (SDO) Domain Types
 * Matching DFN_STANDARDS_AND_SDO_ARCHITECTURE.md
 */

export type StandardCategory =
  | 'materials'
  | 'welding'
  | 'pressure_vessels'
  | 'quality'
  | 'coatings'
  | 'machining'
  | 'electrical'
  | 'structural'
  | 'oil_and_gas'
  | 'safety_environmental';

export type StandardStatus = 'active' | 'withdrawn' | 'under_revision';

export type EquivalenceLevel =
  | 'identical'
  | 'modified'
  | 'equivalent_substitute'
  | 'related';

export type VerificationStatus = 'verified' | 'unverified' | 'expired' | 'revoked';

export type InspectionMethod =
  | 'MTC' // Mill Test Certificate (EN 10204 3.1)
  | 'NDT' // Non-Destructive Testing
  | 'dimensional_audit' // CMM inspection
  | 'third_party' // Third-party audit (e.g. SON, SGS)
  | 'visual';

export interface StandardDefinition {
  id: string;
  sdo: string; // e.g. 'SON', 'ISO', 'ASTM', 'ASME', 'API', 'DIN', 'BSI', 'IEC', 'AWS', 'NACE'
  standard_code: string; // e.g. 'NIS 102:2006', 'ISO 9001:2015', 'ASTM A36/A36M'
  title: string;
  category: StandardCategory;
  status: StandardStatus;
  scope_summary?: string | null;
  ics_code?: string | null; // International Classification for Standards
  metadata?: Record<string, unknown> | null;
  published_date?: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface StandardInput {
  sdo: string;
  standard_code: string;
  title: string;
  category: StandardCategory;
  status?: StandardStatus;
  scope_summary?: string;
  ics_code?: string;
  metadata?: Record<string, unknown>;
  published_date?: Date | string;
}

export interface StandardCrossReference {
  id: string;
  source_standard_id: string;
  target_standard_id: string;
  equivalence_level: EquivalenceLevel;
  technical_notes?: string | null;
  property_mapping?: Record<string, unknown> | null;
  created_at: Date | string;
}

export interface FactoryCertification {
  id: string;
  factory_id: string;
  standard_id: string;
  org_id: string;
  certificate_number?: string | null;
  certification_body: string; // e.g. 'SON', 'SGS', 'DNV', 'Bureau Veritas'
  iaf_certsearch_id?: string | null;
  is_iaf_verified: boolean;
  issued_at?: Date | string | null;
  expires_at?: Date | string | null;
  verification_status: VerificationStatus;
  standard?: StandardDefinition;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface StageComplianceSpec {
  id: string;
  job_id: string;
  stage_id: string;
  standard_id: string;
  org_id: string;
  is_mandatory: boolean;
  inspection_method: InspectionMethod;
  standard?: StandardDefinition;
  created_at: Date | string;
}

export interface StandardsSearchParams {
  sdo?: string;
  category?: StandardCategory;
  status?: StandardStatus;
  q?: string;
  page?: number;
  limit?: number;
}

export interface CrossReferenceResolution {
  requested_standard: StandardDefinition;
  identical_standards: StandardDefinition[];
  equivalent_substitutes: Array<{
    standard: StandardDefinition;
    equivalence_level: EquivalenceLevel;
    technical_notes?: string | null;
    property_mapping?: Record<string, unknown> | null;
  }>;
  local_nigerian_equivalents: StandardDefinition[];
}
