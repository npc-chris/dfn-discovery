import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import type { Server } from 'http';
import webhooksRouter from './webhooks';
import {
  validateSchemaVersion,
  deserializePrismReportManifest,
  serializePrismReportManifest,
  adaptPrismManifestToCadTelemetry,
  toPrismaJobModel,
  fromPrismaJobModel,
  getOpenApiSpecification,
  SchemaValidationError,
  DrizzleJobRecord,
} from '@dfn/shared';
import type { PrismReportManifest } from '@dfn/shared/types';

describe('Cross-Service Data Contract & OpenAPI 3.1 Parity [KAN-77]', () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;

  const validManifest: PrismReportManifest = {
    schema_version: '1.1',
    report_id: '11111111-2222-3333-4444-555555555555',
    job_id: '99999999-8888-7777-6666-555555555555',
    created_at: '2026-11-20T20:30:00.000Z',
    source_file: {
      filename: 'planetary-gearbox-casing.step',
      format: 'STEP',
      size_bytes: 4194304,
      hash_sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
    },
    geometry: {
      volume_mm3: 540000.0,
      surface_area_mm2: 48000.0,
      bounding_box: {
        x_mm: 180.0,
        y_mm: 150.0,
        z_mm: 95.0,
      },
      is_watertight: true,
      face_count: 86,
      edge_count: 142,
    },
    features: [
      {
        type: 'through_hole',
        diameter_mm: 12.0,
        depth_mm: 95.0,
        confidence: 0.99,
      },
      {
        type: 'fillet',
        confidence: 0.94,
      },
    ],
    material: {
      inferred: 'aluminum_alloy',
      confidence: 0.98,
      source: 'step_metadata',
      density_kg_m3: 2700,
    },
    is_assembly: false,
    part_count: 1,
    workflows: [
      {
        steps: [
          { process: 'cnc_milling_5axis', confidence: 0.96, is_primary: true },
          { process: 'anodizing_type_ii', confidence: 0.91, is_primary: false },
        ],
        reasoning: 'Deep pockets and bearing seat tolerances necessitate 5-axis milling.',
        estimated_complexity: 'Medium',
      },
    ],
    dfm_issues: [
      {
        type: 'tight_internal_radius',
        severity: 'warning',
        message: 'Internal pocket radius 1.5mm requires micro-endmill tool change.',
      },
      {
        type: 'wall_thickness_breach',
        severity: 'critical',
        message: 'Web thickness under 1.2mm near flange.',
      },
    ],
    complexity_score: 6.8,
  };

  beforeAll(async () => {
    delete process.env.PRISM_WEBHOOK_SECRET; // dev mode for parity integration test
    app = express();
    app.use(
      express.raw({ type: '*/*', limit: '1mb', inflate: true }),
      (req, _res, next) => {
        (req as any).rawBody = req.body as Buffer;
        next();
      }
    );
    app.use('/webhooks', webhooksRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}/webhooks`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Tier 1 Design Freeze — Schema Version Rejection Policy', () => {
    it('accepts compliant schema_version 1.1 with HTTP 200', () => {
      // Arrange
      const payload = { schema_version: '1.1', data: 'ok' };

      // Action
      const result = validateSchemaVersion(payload, '1.1');

      // Assert
      expect(result.valid).toBe(true);
      expect(result.status).toBe(200);
      if (result.valid) {
        expect(result.version).toBe('1.1');
      }
    });

    it('rejects unsupported schema versions with HTTP 422 and exact error shape', () => {
      // Arrange
      const payload = { schema_version: '1.0' };

      // Action
      const result = validateSchemaVersion(payload, '1.1');

      // Assert
      expect(result.valid).toBe(false);
      expect(result.status).toBe(422);
      if (!result.valid) {
        expect(result.error).toBe('Unsupported Schema Version');
        expect(result.received).toBe('1.0');
        expect(result.expected).toBe('1.1');
      }
    });

    it('rejects missing schema_version with HTTP 422 and received="undefined"', () => {
      // Arrange
      const payload = { report_id: 'uuid-no-ver' };

      // Action
      const result = validateSchemaVersion(payload, '1.1');

      // Assert
      expect(result.valid).toBe(false);
      expect(result.status).toBe(422);
      if (!result.valid) {
        expect(result.received).toBe('undefined');
        expect(result.expected).toBe('1.1');
      }
    });
  });

  describe('Prism Webhook Route Tier 1 Rejection Enforcement', () => {
    it('rejects webhook with legacy schema_version 1.0 returning HTTP 422', async () => {
      // Arrange: Given an incoming webhook payload with schema_version 1.0
      const payload = {
        ...validManifest,
        schema_version: '1.0',
      };

      // Action: When POSTed to /webhooks/prism
      const res = await fetch(`${baseUrl}/prism`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Assert: Then HTTP 422 Unprocessable Entity is returned with exact mismatch body
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data).toEqual({
        error: 'Unsupported Schema Version',
        received: '1.0',
        expected: '1.1',
      });
    });

    it('rejects webhook missing schema_version returning HTTP 422', async () => {
      // Arrange: Given an incoming webhook payload without schema_version
      const { schema_version: _, ...unversioned } = validManifest;

      // Action: When POSTed to /webhooks/prism
      const res = await fetch(`${baseUrl}/prism`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unversioned),
      });

      // Assert: Then HTTP 422 Unprocessable Entity is returned
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data).toEqual({
        error: 'Unsupported Schema Version',
        received: 'undefined',
        expected: '1.1',
      });
    });

    it('accepts compliant webhook with schema_version 1.1 returning HTTP 200', async () => {
      // Arrange: Given a fully compliant v1.1 PrismReportManifest
      const payload = validManifest;

      // Action: When POSTed to /webhooks/prism
      const res = await fetch(`${baseUrl}/prism`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Assert: Then HTTP 200 OK is returned
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.job_id).toBe(validManifest.job_id);
      expect(data.report_id).toBe(validManifest.report_id);
      expect(data.complexity_score).toBe(validManifest.complexity_score);
    });
  });

  describe('Prism Manifest Serialization & Deserialization', () => {
    it('deserializes a valid payload and maps all properties', () => {
      const manifest = deserializePrismReportManifest(validManifest);
      expect(manifest.schema_version).toBe('1.1');
      expect(manifest.report_id).toBe(validManifest.report_id);
      expect(manifest.geometry.bounding_box.x_mm).toBe(180.0);
    });

    it('throws SchemaValidationError with status 422 on unsupported version', () => {
      const invalidVersion = { ...validManifest, schema_version: '3.0' };
      expect(() => deserializePrismReportManifest(invalidVersion)).toThrowError(SchemaValidationError);
      try {
        deserializePrismReportManifest(invalidVersion);
      } catch (err) {
        expect((err as SchemaValidationError).status).toBe(422);
      }
    });

    it('preserves mathematical round-trip idempotency', () => {
      const serialized = serializePrismReportManifest(validManifest);
      const deserialized = deserializePrismReportManifest(serialized);
      expect(deserialized.report_id).toBe(validManifest.report_id);
      expect(deserialized.geometry.bounding_box).toEqual(validManifest.geometry.bounding_box);
    });
  });

  describe('CAD Telemetry Extraction', () => {
    it('extracts bounding envelope, volume, surface area, and primary process', () => {
      const telemetry = adaptPrismManifestToCadTelemetry(validManifest);
      expect(telemetry.envelope_mm.max_dimension).toBe(180.0);
      expect(telemetry.volume_cm3).toBe(540.0);
      expect(telemetry.surface_area_cm2).toBe(480.0);
      expect(telemetry.primary_process).toBe('cnc_milling_5axis');
      expect(telemetry.critical_dfm_count).toBe(1);
      expect(telemetry.warning_dfm_count).toBe(1);
    });
  });

  describe('Cross-ORM Drizzle-Prisma Parity', () => {
    const drizzleJob: DrizzleJobRecord = {
      id: 'job-uuid-201',
      org_id: 'org-kano-01',
      created_by: 'user-009',
      project_id: 'proj-uuid-505',
      batch_id: 'batch-uuid-606',
      rfq_code: 'RFQ-2026-102',
      company_name: 'Northern Casting Works Ltd',
      product_name: 'Pump Impeller Vane',
      process_type: 'sand_casting',
      material_type: 'gray_iron',
      volume_band: 'medium_volume',
      location: { country: 'Nigeria', state: 'Kano' },
      status: 'scored',
      procurement_stage: 'source',
      target_ceiling_ngn: 1200000,
      version: 1,
      metadata: { mold_type: 'furan_resin' },
      created_at: new Date('2026-11-20T21:00:00.000Z'),
      updated_at: new Date('2026-11-20T21:10:00.000Z'),
    };

    it('converts Drizzle snake_case model to Prisma camelCase model without loss', () => {
      const prismaJob = toPrismaJobModel(drizzleJob);
      expect(prismaJob.id).toBe(drizzleJob.id);
      expect(prismaJob.orgId).toBe(drizzleJob.org_id);
      expect(prismaJob.companyName).toBe(drizzleJob.company_name);
      expect(prismaJob.targetCeilingNgn).toBe(drizzleJob.target_ceiling_ngn);
    });

    it('maintains bi-directional isomorphism across Drizzle and Prisma models', () => {
      const prismaJob = toPrismaJobModel(drizzleJob);
      const restored = fromPrismaJobModel(prismaJob);
      expect(restored).toEqual(drizzleJob);
    });
  });

  describe('OpenAPI 3.1.0 Contract Definition Parity', () => {
    it('provides valid OpenAPI 3.1.0 specification with documented Tier 1 422 error', () => {
      const spec = getOpenApiSpecification();
      expect(spec.openapi).toBe('3.1.0');
      expect(spec.info.title).toBe('DFN Discovery API');
      expect(spec.paths['/webhooks/prism']).toBeDefined();

      const webhookResponses = (spec.paths['/webhooks/prism'] as any).post.responses;
      expect(webhookResponses['422']).toBeDefined();
      expect(webhookResponses['422'].content['application/json'].schema.$ref).toBe(
        '#/components/schemas/SchemaVersionMismatchError'
      );
    });
  });
});
