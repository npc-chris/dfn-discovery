import { describe, it, expect, beforeEach } from 'vitest';
import express, { Express } from 'express';
import { db } from '../db/client';
import { factories } from '../db/schema';
import standardsRouter from './standards';
import { seedCanonicalStandards } from '../db/seeds/standards-seed';



// Helper to make test HTTP calls against Express routers in-memory
async function mockRequest(
  app: Express,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: any,
  auth = { orgId: 'test-org-standards-routes', userId: 'user-std-1', orgRole: 'admin' },
) {

  return new Promise<{ status: number; body: any }>((resolve) => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use((_req, res, next) => {
      res.locals.auth = auth;
      next();
    });
    testApp.use(app);

    const server = testApp.listen(0, async () => {
      const addr = server.address() as any;
      const port = addr.port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, {
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

describe('Standards & SDO API Endpoints', () => {
  const testOrgId = 'test-org-standards-routes';
  let app: Express;
  let factoryId: string;

  beforeEach(async () => {
    app = express();
    app.use('/api/v1/standards', standardsRouter);

    // Seed canonical standards
    await seedCanonicalStandards();

    // Create test factory
    const [factory] = await db
      .insert(factories)
      .values({
        org_id: testOrgId,
        factory_name: 'Lagos Precision Heavy Fab Ltd',
        capabilities: { processes: ['cnc_milling', 'welding'] },
        materials: ['carbon_steel'],
        capacity_band: 'high',
        locations: [{ state: 'Lagos' }],
        verified_sources: ['cac'],
        active: true,
      })
      .returning();
    factoryId = factory.id;
  });

  it('GET /api/v1/standards should search indexed catalog with filters', async () => {
    const res = await mockRequest(app, 'GET', '/api/v1/standards?sdo=SON');

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(4);
    expect(res.body.data.some((s: any) => s.standard_code === 'NIS 102:2006')).toBe(true);
  });

  it('GET /api/v1/standards/code/:code/cross-references should resolve equivalents', async () => {
    const code = encodeURIComponent('BS EN 10025-2');
    const res = await mockRequest(app, 'GET', `/api/v1/standards/code/${code}/cross-references`);

    expect(res.status).toBe(200);
    expect(res.body.requested_standard.standard_code).toBe('BS EN 10025-2');
    expect(res.body.local_nigerian_equivalents.length).toBeGreaterThan(0);
    expect(res.body.local_nigerian_equivalents[0].standard_code).toBe('NIS 102:2006');
  });

  it('POST /api/v1/standards/bulk-import should ingest standards batch', async () => {
    const res = await mockRequest(app, 'POST', '/api/v1/standards/bulk-import', {
      standards: [
        {
          sdo: 'SON',
          standard_code: 'NIS 888:2026',
          title: 'Quality Requirements for Structural Fabrication',
          category: 'structural',
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.imported).toBe(1);
  });

  it('POST & PATCH /api/v1/standards/factories/:factoryId/certifications should register and verify factory certification', async () => {
    // 1. Register certification
    const regRes = await mockRequest(
      app,
      'POST',
      `/api/v1/standards/factories/${factoryId}/certifications`,
      {
        standardCode: 'NIS ISO 9001:2015',
        certificateNumber: 'SON-QMS-2026-99',
        certificationBody: 'Standards Organisation of Nigeria (SON)',
      },
    );

    expect(regRes.status).toBe(201);
    expect(regRes.body.success).toBe(true);
    const certId = regRes.body.certification.id;

    // 2. Verify certification with IAF accreditation
    const verifyRes = await mockRequest(
      app,
      'PATCH',
      `/api/v1/standards/factories/${factoryId}/certifications/${certId}/verify`,
      {
        iafVerified: true,
        iafCertSearchId: 'IAF-99412',
      },
    );

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.certification.verification_status).toBe('verified');
    expect(verifyRes.body.certification.is_iaf_verified).toBe(true);

    // 3. List certifications for factory
    const listRes = await mockRequest(
      app,
      'GET',
      `/api/v1/standards/factories/${factoryId}/certifications`,
    );
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.data[0].isIafVerified).toBe(true);
  });
});
