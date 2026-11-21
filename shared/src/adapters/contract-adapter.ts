/**
 * Cross-Service Data Contract & OpenAPI Parity Adapters
 * Subsystem: SUB-10 (API Contracts & Data Parity)
 * Mandate: Enforce Tier 1 Design Freeze & Schema Version Mismatch Policy
 */

import type { PrismReportManifest } from '../types/prism';
import openApiSpecJson from '../../schemas/openapi.json';

export interface SchemaVersionValidationSuccess {
  valid: true;
  status: 200;
  version: string;
}

export interface SchemaVersionValidationFailure {
  valid: false;
  status: 422;
  error: 'Unsupported Schema Version';
  received: string;
  expected: string;
}

export type SchemaVersionValidationResult =
  | SchemaVersionValidationSuccess
  | SchemaVersionValidationFailure;

export interface CadTelemetrySummary {
  report_id: string;
  job_id: string;
  schema_version: string;
  envelope_mm: {
    x: number;
    y: number;
    z: number;
    max_dimension: number;
  };
  volume_cm3: number;
  surface_area_cm2: number;
  is_watertight: boolean;
  material_inferred: string;
  material_source: string;
  primary_process: string;
  complexity_score: number;
  is_assembly: boolean;
  part_count: number;
  critical_dfm_count: number;
  warning_dfm_count: number;
}

export class SchemaValidationError extends Error {
  public readonly status: number;
  public readonly received?: string;
  public readonly expected?: string;

  constructor(message: string, status = 400, received?: string, expected?: string) {
    super(message);
    this.name = 'SchemaValidationError';
    this.status = status;
    this.received = received;
    this.expected = expected;
  }
}

/**
 * Validates that an incoming payload satisfies the explicit schema_version check.
 * Rejects unsupported versions with HTTP 422 per dfn-docs/02-data-contracts-schemas.md.
 */
export function validateSchemaVersion(
  payload: unknown,
  expectedVersion = '1.1'
): SchemaVersionValidationResult {
  if (!payload || typeof payload !== 'object') {
    return {
      valid: false,
      status: 422,
      error: 'Unsupported Schema Version',
      received: typeof payload,
      expected: expectedVersion,
    };
  }

  const rawVersion = (payload as Record<string, unknown>).schema_version;
  const receivedStr = rawVersion !== undefined && rawVersion !== null ? String(rawVersion) : 'undefined';

  if (receivedStr !== expectedVersion) {
    return {
      valid: false,
      status: 422,
      error: 'Unsupported Schema Version',
      received: receivedStr,
      expected: expectedVersion,
    };
  }

  return {
    valid: true,
    status: 200,
    version: expectedVersion,
  };
}

/**
 * Deserializes and validates a PrismReportManifest from a JSON string or object.
 * Enforces mandatory fields and schema version 1.1.
 */
export function deserializePrismReportManifest(raw: unknown): PrismReportManifest {
  let manifest: Record<string, any>;

  if (typeof raw === 'string') {
    try {
      manifest = JSON.parse(raw);
    } catch {
      throw new SchemaValidationError('Malformed JSON payload', 400);
    }
  } else if (raw && typeof raw === 'object') {
    manifest = raw as Record<string, any>;
  } else {
    throw new SchemaValidationError('Payload must be an object or JSON string', 400);
  }

  // 1. Enforce Tier 1 Schema Version
  const versionValidation = validateSchemaVersion(manifest, '1.1');
  if (!versionValidation.valid) {
    throw new SchemaValidationError(
      `Unsupported Schema Version: received '${versionValidation.received}', expected '${versionValidation.expected}'`,
      422,
      versionValidation.received,
      versionValidation.expected
    );
  }

  // 2. Validate mandatory identifiers
  if (!manifest.report_id || typeof manifest.report_id !== 'string') {
    throw new SchemaValidationError('Missing mandatory manifest field: report_id', 400);
  }
  if (!manifest.job_id || typeof manifest.job_id !== 'string') {
    throw new SchemaValidationError('Missing mandatory manifest field: job_id', 400);
  }
  if (!manifest.created_at || typeof manifest.created_at !== 'string') {
    throw new SchemaValidationError('Missing mandatory manifest field: created_at', 400);
  }

  // 3. Validate source file
  if (!manifest.source_file || typeof manifest.source_file !== 'object') {
    throw new SchemaValidationError('Missing mandatory manifest field: source_file', 400);
  }
  if (!manifest.source_file.filename || !manifest.source_file.format) {
    throw new SchemaValidationError('Invalid source_file: filename and format required', 400);
  }

  // 4. Validate geometry
  if (!manifest.geometry || typeof manifest.geometry !== 'object') {
    throw new SchemaValidationError('Missing mandatory manifest field: geometry', 400);
  }
  const bbox = manifest.geometry.bounding_box;
  if (!bbox || typeof bbox.x_mm !== 'number' || typeof bbox.y_mm !== 'number' || typeof bbox.z_mm !== 'number') {
    throw new SchemaValidationError('Invalid geometry: bounding_box with x_mm, y_mm, z_mm required', 400);
  }

  // 5. Validate material
  if (!manifest.material || typeof manifest.material !== 'object' || !manifest.material.inferred) {
    throw new SchemaValidationError('Missing mandatory manifest field: material.inferred', 400);
  }

  // 6. Validate workflows & dfm_issues arrays
  if (!Array.isArray(manifest.workflows)) {
    throw new SchemaValidationError('Missing mandatory manifest array: workflows', 400);
  }
  if (!Array.isArray(manifest.dfm_issues)) {
    throw new SchemaValidationError('Missing mandatory manifest array: dfm_issues', 400);
  }

  // 7. Validate complexity score
  const complexity = Number(manifest.complexity_score);
  if (isNaN(complexity) || complexity < 0.0 || complexity > 10.0) {
    throw new SchemaValidationError('Invalid complexity_score: must be a number between 0.0 and 10.0', 400);
  }

  return {
    schema_version: '1.1',
    report_id: manifest.report_id,
    job_id: manifest.job_id,
    created_at: manifest.created_at,
    source_file: {
      filename: String(manifest.source_file.filename),
      format: String(manifest.source_file.format),
      size_bytes: Number(manifest.source_file.size_bytes ?? 0),
      hash_sha256: String(manifest.source_file.hash_sha256 ?? ''),
    },
    geometry: {
      volume_mm3: Number(manifest.geometry.volume_mm3 ?? 0),
      surface_area_mm2: Number(manifest.geometry.surface_area_mm2 ?? 0),
      bounding_box: {
        x_mm: Number(bbox.x_mm),
        y_mm: Number(bbox.y_mm),
        z_mm: Number(bbox.z_mm),
      },
      center_of_mass_mm: manifest.geometry.center_of_mass_mm,
      aspect_ratio: manifest.geometry.aspect_ratio,
      surface_to_volume_ratio: manifest.geometry.surface_to_volume_ratio,
      is_watertight: Boolean(manifest.geometry.is_watertight),
      face_count: manifest.geometry.face_count,
      edge_count: manifest.geometry.edge_count,
      shell_count: manifest.geometry.shell_count,
      face_type_distribution: manifest.geometry.face_type_distribution,
    },
    features: Array.isArray(manifest.features) ? manifest.features : [],
    material: {
      inferred: String(manifest.material.inferred),
      confidence: manifest.material.confidence !== undefined ? Number(manifest.material.confidence) : undefined,
      source: String(manifest.material.source ?? 'inferred'),
      density_kg_m3: manifest.material.density_kg_m3 !== undefined ? Number(manifest.material.density_kg_m3) : undefined,
    },
    is_assembly: Boolean(manifest.is_assembly),
    part_count: manifest.part_count !== undefined ? Number(manifest.part_count) : undefined,
    parts: manifest.parts,
    workflows: manifest.workflows,
    dfm_issues: manifest.dfm_issues,
    complexity_score: complexity,
    metadata: manifest.metadata,
    bop: manifest.bop ?? null,
    bom: manifest.bom ?? null,
  };
}

/**
 * Serializes a validated PrismReportManifest to formatted JSON string.
 */
export function serializePrismReportManifest(manifest: PrismReportManifest): string {
  if (!manifest || manifest.schema_version !== '1.1') {
    throw new SchemaValidationError("Cannot serialize manifest: invalid schema_version (expected '1.1')", 422);
  }
  return JSON.stringify(manifest, null, 2);
}

/**
 * Extracts high-density CAD telemetry from a PrismReportManifest for routing and AE triage.
 */
export function adaptPrismManifestToCadTelemetry(manifest: PrismReportManifest): CadTelemetrySummary {
  const bbox = manifest.geometry.bounding_box;
  const maxDim = Math.max(bbox.x_mm, bbox.y_mm, bbox.z_mm);
  const primaryStep = manifest.workflows[0]?.steps.find((s) => s.is_primary);

  return {
    report_id: manifest.report_id,
    job_id: manifest.job_id,
    schema_version: manifest.schema_version,
    envelope_mm: {
      x: bbox.x_mm,
      y: bbox.y_mm,
      z: bbox.z_mm,
      max_dimension: maxDim,
    },
    volume_cm3: (manifest.geometry.volume_mm3 ?? 0) / 1000,
    surface_area_cm2: (manifest.geometry.surface_area_mm2 ?? 0) / 100,
    is_watertight: manifest.geometry.is_watertight,
    material_inferred: manifest.material.inferred,
    material_source: manifest.material.source,
    primary_process: primaryStep ? primaryStep.process : 'unknown',
    complexity_score: manifest.complexity_score,
    is_assembly: Boolean(manifest.is_assembly || (manifest.part_count && manifest.part_count > 1)),
    part_count: manifest.part_count ?? 1,
    critical_dfm_count: manifest.dfm_issues.filter((d) => d.severity === 'critical').length,
    warning_dfm_count: manifest.dfm_issues.filter((d) => d.severity === 'warning').length,
  };
}

// ---------------------------------------------------------------------------
// Cross-ORM Model Converters (Drizzle <-> Prisma)
// ---------------------------------------------------------------------------

export interface DrizzleJobRecord {
  id: string;
  org_id: string;
  created_by: string;
  project_id?: string | null;
  batch_id?: string | null;
  rfq_code?: string | null;
  company_name: string;
  product_name: string;
  process_type?: string | null;
  material_type?: string | null;
  volume_band?: string | null;
  location: any;
  status: string;
  procurement_stage: string;
  target_ceiling_ngn?: number | null;
  version: number;
  metadata?: any;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface PrismaJobRecord {
  id: string;
  orgId: string;
  createdBy: string;
  projectId?: string | null;
  batchId?: string | null;
  rfqCode?: string | null;
  companyName: string;
  productName: string;
  processType?: string | null;
  materialType?: string | null;
  volumeBand?: string | null;
  location: any;
  status: string;
  procurementStage: string;
  targetCeilingNgn?: number | null;
  version: number;
  metadata?: any;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Maps Drizzle Job entity (snake_case) to Prisma Job entity (camelCase).
 */
export function toPrismaJobModel(drizzle: DrizzleJobRecord): PrismaJobRecord {
  return {
    id: drizzle.id,
    orgId: drizzle.org_id,
    createdBy: drizzle.created_by,
    projectId: drizzle.project_id ?? null,
    batchId: drizzle.batch_id ?? null,
    rfqCode: drizzle.rfq_code ?? null,
    companyName: drizzle.company_name,
    productName: drizzle.product_name,
    processType: drizzle.process_type ?? null,
    materialType: drizzle.material_type ?? null,
    volumeBand: drizzle.volume_band ?? null,
    location: drizzle.location,
    status: drizzle.status,
    procurementStage: drizzle.procurement_stage,
    targetCeilingNgn: drizzle.target_ceiling_ngn ?? null,
    version: drizzle.version ?? 1,
    metadata: drizzle.metadata ?? null,
    createdAt: drizzle.created_at,
    updatedAt: drizzle.updated_at,
  };
}

/**
 * Maps Prisma Job entity (camelCase) to Drizzle Job entity (snake_case).
 */
export function fromPrismaJobModel(prisma: PrismaJobRecord): DrizzleJobRecord {
  return {
    id: prisma.id,
    org_id: prisma.orgId,
    created_by: prisma.createdBy,
    project_id: prisma.projectId ?? null,
    batch_id: prisma.batchId ?? null,
    rfq_code: prisma.rfqCode ?? null,
    company_name: prisma.companyName,
    product_name: prisma.productName,
    process_type: prisma.processType ?? null,
    material_type: prisma.materialType ?? null,
    volume_band: prisma.volumeBand ?? null,
    location: prisma.location,
    status: prisma.status,
    procurement_stage: prisma.procurementStage,
    target_ceiling_ngn: prisma.targetCeilingNgn ?? null,
    version: prisma.version ?? 1,
    metadata: prisma.metadata ?? null,
    created_at: prisma.createdAt,
    updated_at: prisma.updatedAt,
  };
}

/**
 * Returns the loaded OpenAPI 3.1.0 specification document for DFN Discovery.
 */
export function getOpenApiSpecification(): typeof openApiSpecJson {
  return openApiSpecJson;
}
