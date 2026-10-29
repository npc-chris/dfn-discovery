import { describe, it, expect, beforeEach } from 'vitest';
import express, { Express } from 'express';
import { db } from '../db/client';
import { projects, jobs, factories, quotes } from '../db/schema';
import jobsRouter from './jobs';
import projectsRouter from './projects';
import quotesRouter from './quotes';

// Helper to make test HTTP calls against Express routers in-memory
async function mockRequest(
  app: Express,
  method: 'GET' | 'POST',
  path: string,
  body?: any,
  auth = { orgId: 'test-org-routes', userId: 'user-routes-1' },
) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    // Create an express app with auth mock
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

describe('Sourcing & Procurement API Endpoints', () => {
  const testOrgId = 'test-org-routes';
  let app: Express;
  let projectId: string;
  let jobId: string;
  let factoryId: string;
  let quoteId: string;

  beforeEach(async () => {
    app = express();
    app.use('/api/v1/jobs', jobsRouter);
    app.use('/api/v1/projects', projectsRouter);
    app.use('/api/v1/quotes', quotesRouter);

    // 1. Seed project
    const [project] = await db
      .insert(projects)
      .values({
        org_id: testOrgId,
        title: 'Gearbox Housing Assembly',
        budget_ceiling_ngn: 15000000,
        created_by: 'user-routes-1',
      })
      .returning();
    projectId = project.id;

    // 2. Seed factory
    const [factory] = await db
      .insert(factories)
      .values({
        org_id: testOrgId,
        factory_name: 'Precision Works Lagos',
        capabilities: { processes: ['cnc_milling'] },
        materials: ['aluminum_6061'],
        capacity_band: 'high',
        locations: [{ state: 'Lagos' }],
        verified_sources: ['cac'],
        active: true,
      })
      .returning();
    factoryId = factory.id;

    // 3. Seed job
    const [job] = await db
      .insert(jobs)
      .values({
        org_id: testOrgId,
        created_by: 'user-routes-1',
        project_id: projectId as any,
        rfq_code: 'RFQ-2026-041',
        company_name: 'Apex Industrial',
        product_name: 'Gearbox Housing x200',
        process_type: 'cnc_milling',
        material_type: 'aluminum_6061',
        volume_band: 'medium',
        location: { state: 'Lagos' },
        status: 'recommended',
        procurement_stage: 'source',
        target_ceiling_ngn: 15000000,
      })
      .returning();
    jobId = job.id;

    // 4. Seed quote
    const [quote] = await db
      .insert(quotes)
      .values({
        job_id: jobId as any,
        factory_id: factoryId as any,
        org_id: testOrgId,
        unit_price_ngn: 71000,
        total_price_ngn: 14200000,
        lead_time_days: 7,
        status: 'submitted',
      })
      .returning();
    quoteId = quote.id;
  });

  it('GET /api/v1/projects/:projectId/metrics should return the 5 KPI cards data', async () => {
    const res = await mockRequest(app, 'GET', `/api/v1/projects/${projectId}/metrics`);

    expect(res.status).toBe(200);
    expect(res.body.projectStatus).toBe('Source');
    expect(res.body.currentStageIndex).toBe(2);
    expect(res.body.totalStages).toBe(5);
    expect(res.body.quoteCoverage.received).toBe(1);
    expect(res.body.bestLandedCost.amountNgn).toBe(14200000);
    expect(res.body.bestLandedCost.leadSupplier).toBe('Precision Works Lagos');
    expect(res.body.bestLandedCost.varianceNgn).toBe(-800000);
  });

  it('GET /api/v1/jobs should list RFQ pipeline with stage filters', async () => {
    const res = await mockRequest(app, 'GET', `/api/v1/jobs?stage=source`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].code).toBe('RFQ-2026-041');
    expect(res.body.data[0].procurementStage).toBe('Source');
    expect(res.body.data[0].quotesSummary).toBe('1/5 received');
  });

  it('GET /api/v1/jobs/:jobId/quotes should return received quotes with ranking badges', async () => {
    const res = await mockRequest(app, 'GET', `/api/v1/jobs/${jobId}/quotes`);

    expect(res.status).toBe(200);
    expect(res.body.quotes.length).toBe(1);
    expect(res.body.quotes[0].supplierName).toBe('Precision Works Lagos');
    expect(res.body.quotes[0].rankBadge).toBe('Cheapest');
    expect(res.body.quotes[0].totalBidNgn).toBe(14200000);
  });

  it('POST /api/v1/quotes/:quoteId/award should award the contract and record activity', async () => {
    const res = await mockRequest(app, 'POST', `/api/v1/quotes/${quoteId}/award`, {
      actor: 'Procurement Officer',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.quote.status).toBe('awarded');

    // Verify activity stream has recorded the award
    const actRes = await mockRequest(app, 'GET', `/api/v1/projects/${projectId}/activities`);
    expect(actRes.status).toBe(200);
    expect(actRes.body.activities.length).toBeGreaterThan(0);
    expect(actRes.body.activities[0].title).toBe('Quote Awarded');
  });
});
