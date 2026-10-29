/**
 * Phase 1 Foundation & Security End-to-End Test Suite
 *
 * Exercises real API endpoints with live PostgreSQL:
 * 1. Job Intake & BOP Normalization (Ingress)
 * 2. Strict Multi-Tenant Isolation & Security Gating
 * 3. Nigerian Industrial Geo-Logistics & Corridor Physics
 * 4. Standards & SDO Catalog, Cross-Reference Resolver & Factory Accreditations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { db } from '../db/client';
import { factories } from '../db/schema';
import jobsRouter from '../routes/jobs';
import standardsRouter from '../routes/standards';
import { geoLogistics } from '../services/geo-logistics';

// Helper to make test HTTP calls against Express routers in-memory

async function mockApiRequest(
  router: express.Router,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: any,
  auth: { orgId: string; userId: string; orgRole?: string } = { orgId: 'org-alpha', userId: 'user-alpha-1', orgRole: 'member' },
) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.auth = auth;
      next();
    });
    app.use('/api/v1', router);

    const server = app.listen(0, async () => {
      const addr = server.address() as any;
      const port = addr.port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        server.close();
        resolve({ status: res.status, body: data });
      } catch (err) {
        server.close();
        resolve({ status: 500, body: { error: String(err) } });
      }
    });
  });
}

describe('Phase 1: Foundation Services & Security Testing', () => {
  const orgAdmin = { orgId: 'dfn-admin-org', userId: 'admin-super', orgRole: 'admin' };
  const orgAlpha = { orgId: 'org-alpha-enterprise', userId: 'engineer-alpha', orgRole: 'member' };
  const orgBeta = { orgId: 'org-beta-competitor', userId: 'engineer-beta', orgRole: 'member' };


  let alphaJobId: string;
  let alphaFactoryId: string;

  beforeEach(async () => {
    // 1. Create a factory belonging to orgAlpha
    const [factory] = await db
      .insert(factories)
      .values({
        org_id: orgAlpha.orgId,
        factory_name: 'Trans-Sahara Heavy Machining Ltd',
        capabilities: { processes: ['cnc_milling', 'turning', 'saw_cutting'] },
        materials: ['carbon_steel', 'aluminum_6061'],
        capacity_band: 'high',
        locations: [{ state: 'Lagos', lga: 'ikeja' }],
        verified_sources: ['cac', 'iso_9001'],
        active: true,
      })
      .returning();
    alphaFactoryId = factory.id;
  });

  describe('1. Job Intake & Ingestion Pipeline', () => {
    it('should ingest an RFQ with structured multi-stage BOP and store it in PostgreSQL', async () => {
      const bopPayload = {
        company_name: 'Dangote Refinery Subsea Division',
        product_name: 'High-Pressure Manifold Flange',
        process_type: 'cnc_milling',
        material_type: 'carbon_steel',
        volume_band: 'medium',
        location: { country: 'Nigeria', state: 'Lagos', lga: 'ikeja' },
        bop: {
          operations: [
            {
              op_number: 1,
              process_id: 'casting',
              title: 'Sand Casting Billets',
              machine_type: 'induction_furnace',
              tolerances: { linear: '+/- 1.0mm' },
              estimated_cycle_time_min: 120,
            },
            {
              op_number: 2,
              process_id: '5-axis_cnc_milling',
              title: '5-Axis Precision Milling',
              machine_type: '5-axis_vmc',
              tolerances: { linear: '+/- 0.025mm' },
              estimated_cycle_time_min: 90,
            },
            {
              op_number: 3,
              process_id: 'heat_treat',
              title: 'Vacuum Quench & Temper',
              machine_type: 'vacuum_furnace',
              tolerances: { linear: 'HRC 38-42' },
              estimated_cycle_time_min: 180,
            },
            {
              op_number: 4,
              process_id: 'passivation',
              title: 'Chemical Passivation & NDT',
              machine_type: 'immersion_tank',
              estimated_cycle_time_min: 45,
            },
          ],
        },
      };

      const res = await mockApiRequest(jobsRouter, 'POST', '/', bopPayload, orgAlpha);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('draft');
      expect(res.body.company_name).toBe('Dangote Refinery Subsea Division');
      expect(res.body.metadata.bop.operations.length).toBe(4);

      alphaJobId = res.body.id;

      // Verify retrieval via GET /:jobId
      const getRes = await mockApiRequest(jobsRouter, 'GET', `/${alphaJobId}`, undefined, orgAlpha);
      expect(getRes.status).toBe(200);
      expect(getRes.body.product_name).toBe('High-Pressure Manifold Flange');
      expect(getRes.body.org_id).toBe(orgAlpha.orgId);
    });

    it('should reject invalid job payloads missing mandatory location or product name', async () => {
      const invalidPayload = {
        company_name: 'Incomplete RFQ Ltd',
        // Missing product_name and location
      };

      const res = await mockApiRequest(jobsRouter, 'POST', '/', invalidPayload, orgAlpha);
      expect(res.status).toBe(400);
    });
  });

  describe('2. Multi-Tenant Security & Tenant Isolation Audit', () => {
    it('should strictly block Org Beta from reading or modifying Org Alpha jobs', async () => {
      // 1. Org Alpha creates a job
      const createRes = await mockApiRequest(
        jobsRouter,
        'POST',
        '/',
        {
          company_name: 'Alpha Defense Engineering',
          product_name: 'Armored Enclosure Panel',
          location: { country: 'Nigeria', state: 'Ogun', lga: 'sagamu' },
        },
        orgAlpha,
      );
      expect(createRes.status).toBe(201);
      const secretJobId = createRes.body.id;

      // 2. Org Beta attempts to fetch Org Alpha's job -> MUST return 404 (multi-tenant boundary)
      const unauthorizedGet = await mockApiRequest(
        jobsRouter,
        'GET',
        `/${secretJobId}`,
        undefined,
        orgBeta,
      );
      expect(unauthorizedGet.status).toBe(404);

      // 3. Org Beta lists jobs -> Org Alpha's job must NOT appear
      const orgBetaList = await mockApiRequest(jobsRouter, 'GET', '/', undefined, orgBeta);
      expect(orgBetaList.status).toBe(200);
      const leakedJob = orgBetaList.body.data?.find((j: any) => j.id === secretJobId);
      expect(leakedJob).toBeUndefined();
    });
  });

  describe('3. Geo-Logistics & Nigerian Industrial Corridors', () => {
    it('should compute logistics feasibility and transit friction across Nigerian industrial hubs', async () => {
      const mockJob: any = {
        location: { country: 'Nigeria', state: 'Lagos', lga: 'ikeja' },
        material_type: 'carbon_steel',
      };

      const mockFactory: any = {
        id: 'fac-kano-1',
        factory_name: 'Kano Heavy Foundry',
        locations: [{ state: 'Kano', lga: 'kano municipal' }],
      };

      // Calculate Ikeja -> Kano (~850+ km)
      const assessment = await geoLogistics.assessLogistics(mockJob, mockFactory);

      expect(assessment).toBeDefined();
      expect(assessment.distance_km).toBeGreaterThan(700);
      expect(assessment.feasible).toBe(true);
      expect(assessment.primary_mode).toBe('road');
      expect(assessment.estimated_lead_days).toBeGreaterThanOrEqual(2);
      expect(assessment.routing_cost_estimate_ngn).toBeGreaterThan(100000);
    });

    it('should assign zero distance and high confidence for co-located facility handoffs', async () => {
      const mockJob: any = {
        location: { country: 'Nigeria', state: 'Lagos', lga: 'ikeja' },
      };

      const mockFactory: any = {
        id: 'fac-ikeja-local',
        locations: [{ state: 'Lagos', lga: 'ikeja' }],
      };

      const assessment = await geoLogistics.assessLogistics(mockJob, mockFactory);

      expect(assessment.distance_km).toBeLessThanOrEqual(5);
      expect(assessment.feasibility_confidence).toBeGreaterThanOrEqual(70);
    });
  });

  describe('4. Standards & SDO Catalog, Cross-References & Factory Certifications', () => {
    it('should reject non-admin clients from calling internal bulk-import and cross-references endpoints', async () => {
      // 1. Client member tries to call bulk-import -> 403 Forbidden
      const unauthorizedImport = await mockApiRequest(
        standardsRouter,
        'POST',
        '/bulk-import',
        { standards: [{ sdo: 'SON', standard_code: 'NIS 1:1992', title: 'Test Standard', category: 'materials' }] },
        orgAlpha, // orgRole: 'member'
      );
      expect(unauthorizedImport.status).toBe(403);

      // 2. Client member tries to link cross-references -> 403 Forbidden
      const unauthorizedCrossRef = await mockApiRequest(
        standardsRouter,
        'POST',
        '/cross-references',
        { sourceCode: 'ISO 9001', targetCode: 'NIS 102', equivalenceLevel: 'identical' },
        orgAlpha, // orgRole: 'member'
      );
      expect(unauthorizedCrossRef.status).toBe(403);
    });

    it('should allow DFN admin to bulk import a batch of official gazetted standards', async () => {
      const gazettedBatch = [
        {
          sdo: 'SON',
          standard_code: 'NIS 102:2006',
          title: 'Specification for Steel Bars for the Reinforcement of Concrete',
          category: 'materials' as const,
          status: 'active' as const,
          scope_summary: 'Covers plain and ribbed steel bars in Nigeria.',
        },
        {
          sdo: 'BS/EN',
          standard_code: 'BS EN 10025-2',
          title: 'Hot Rolled Products of Structural Steels',
          category: 'materials' as const,
          status: 'active' as const,
        },
        {
          sdo: 'ASTM',
          standard_code: 'ASTM A36/A36M',
          title: 'Standard Specification for Carbon Structural Steel',
          category: 'materials' as const,
          status: 'active' as const,
        },
      ];

      const importRes = await mockApiRequest(
        standardsRouter,
        'POST',
        '/bulk-import',
        { standards: gazettedBatch },
        orgAdmin, // Authorized admin role
      );

      expect(importRes.status).toBe(201);
      expect(importRes.body.success).toBe(true);
      expect(importRes.body.imported).toBe(3);
    });

    it('should create equivalence cross-references and resolve Nigerian equivalents', async () => {
      // 0. Admin ensures target standards exist in catalog
      await mockApiRequest(
        standardsRouter,
        'POST',
        '/bulk-import',
        {
          standards: [
            {
              sdo: 'SON',
              standard_code: 'NIS 102:2006',
              title: 'Specification for Steel Bars for Concrete',
              category: 'materials',
            },
            {
              sdo: 'BS/EN',
              standard_code: 'BS EN 10025-2',
              title: 'Hot Rolled Structural Steels',
              category: 'materials',
            },
          ],
        },
        orgAdmin,
      );

      // 1. Admin creates cross-reference link between BS EN 10025-2 and NIS 102:2006
      const linkRes = await mockApiRequest(
        standardsRouter,
        'POST',
        '/cross-references',
        {
          sourceCode: 'BS EN 10025-2',
          targetCode: 'NIS 102:2006',
          equivalenceLevel: 'equivalent_substitute',
          technicalNotes: 'EN 10025 S275 matches locally milled NIS 102 ribbed bar.',
          propertyMapping: { yield_strength_min_mpa: 275 },
        },
        orgAdmin,
      );

      expect(linkRes.status).toBe(201);
      expect(linkRes.body.success).toBe(true);

      // 2. Client query equivalence resolver for BS EN 10025-2 (Public read endpoint for all clients)
      const code = encodeURIComponent('BS EN 10025-2');
      const resolveRes = await mockApiRequest(
        standardsRouter,
        'GET',
        `/code/${code}/cross-references`,
        undefined,
        orgAlpha,
      );

      expect(resolveRes.status).toBe(200);

      expect(resolveRes.body.requested_standard.standard_code).toBe('BS EN 10025-2');
      expect(resolveRes.body.local_nigerian_equivalents.length).toBeGreaterThan(0);
      expect(resolveRes.body.local_nigerian_equivalents[0].standard_code).toBe('NIS 102:2006');
    });

    it('should manage factory certification lifecycle with IAF CertSearch verification', async () => {
      // 1. Register a factory certification claim
      const regRes = await mockApiRequest(
        standardsRouter,
        'POST',
        `/factories/${alphaFactoryId}/certifications`,
        {
          standardCode: 'NIS 102:2006',
          certificateNumber: 'SON-MANCAP-2026-0041',
          certificationBody: 'Standards Organisation of Nigeria (SON)',
          issuedAt: '2025-01-01',
          expiresAt: '2027-01-01',
        },
        orgAlpha,
      );

      expect(regRes.status).toBe(201);
      expect(regRes.body.success).toBe(true);
      const certId = regRes.body.certification.id;

      // 2. Verify certification via IAF CertSearch
      const verifyRes = await mockApiRequest(
        standardsRouter,
        'PATCH',
        `/factories/${alphaFactoryId}/certifications/${certId}/verify`,
        {
          iafVerified: true,
          iafCertSearchId: 'IAF-SON-9921',
        },
        orgAlpha,
      );

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.certification.verification_status).toBe('verified');
      expect(verifyRes.body.certification.is_iaf_verified).toBe(true);

      // 3. Multi-tenant security check: Org Beta querying certifications for Org Alpha factory returns empty
      const betaQuery = await mockApiRequest(
        standardsRouter,
        'GET',
        `/factories/${alphaFactoryId}/certifications`,
        undefined,
        orgBeta,
      );
      expect(betaQuery.status).toBe(200);
      expect(betaQuery.body.data.length).toBe(0); // Zero cross-tenant data leakage!
    });
  });
});
