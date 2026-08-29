import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/client';
import { projects, jobs, factories, quotes, recommendations, project_activities } from '../db/schema';
import { getProjectSourcingMetrics, getJobQuotes, awardQuote } from './sourcing-service';
import { getFormattedActivities } from './activity-service';

describe('Sourcing & Procurement Service', () => {
  const testOrgId = 'org-sourcing-test-123';
  let projectId: string;
  let jobId: string;
  let factory1Id: string;
  let factory2Id: string;

  beforeEach(async () => {
    // 1. Create test project
    const [project] = await db
      .insert(projects)
      .values({
        org_id: testOrgId,
        title: 'Gearbox Housing Project',
        budget_ceiling_ngn: 15000000,
        target_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        created_by: 'test-user',
      })
      .returning();
    projectId = project.id;

    // 2. Create test job
    const [job] = await db
      .insert(jobs)
      .values({
        org_id: testOrgId,
        created_by: 'test-user',
        project_id: projectId as any,
        rfq_code: 'RFQ-2026-041',
        company_name: 'Apex Industrial',
        product_name: 'Gearbox Housing x200',
        process_type: 'cnc_milling',
        material_type: 'aluminum_6061',
        volume_band: 'medium',
        location: { state: 'Lagos', lga: 'Ikeja' },
        status: 'recommended',
        procurement_stage: 'source',
        target_ceiling_ngn: 15000000,
      })
      .returning();
    jobId = job.id;

    // 3. Create test factories
    const [f1] = await db
      .insert(factories)
      .values({
        org_id: testOrgId,
        factory_name: 'Precision Works Lagos',
        capabilities: { processes: ['cnc_milling'] },
        materials: ['aluminum_6061'],
        capacity_band: 'medium',
        locations: [{ state: 'Lagos' }],
        verified_sources: ['cac'],
        active: true,
      })
      .returning();
    factory1Id = f1.id;

    const [f2] = await db
      .insert(factories)
      .values({
        org_id: testOrgId,
        factory_name: 'Apex Tooling Ltd (Ogun)',
        capabilities: { processes: ['cnc_milling'] },
        materials: ['aluminum_6061'],
        capacity_band: 'high',
        locations: [{ state: 'Ogun' }],
        verified_sources: ['cac'],
        active: true,
      })
      .returning();
    factory2Id = f2.id;

    // 4. Create recommendation for factory 1
    await db.insert(recommendations).values({
      job_id: jobId as any,
      factory_id: factory1Id as any,
      org_id: testOrgId,
      fit_score: 94,
      feasibility_score: 90,
      confidence_score: 85,
      evidence: [],
    });

    // 5. Insert quotes
    await db.insert(quotes).values([
      {
        job_id: jobId as any,
        factory_id: factory1Id as any,
        org_id: testOrgId,
        unit_price_ngn: 71000,
        total_price_ngn: 14200000,
        lead_time_days: 7,
        status: 'submitted',
      },
      {
        job_id: jobId as any,
        factory_id: factory2Id as any,
        org_id: testOrgId,
        unit_price_ngn: 73500,
        total_price_ngn: 14700000,
        lead_time_days: 5,
        status: 'submitted',
      },
    ]);
  });

  it('should compute accurate project sourcing metrics', async () => {
    const metrics = await getProjectSourcingMetrics(projectId, testOrgId);

    expect(metrics.projectStatus).toBe('Source');
    expect(metrics.currentStageIndex).toBe(2);
    expect(metrics.totalStages).toBe(5);
    expect(metrics.quoteCoverage.received).toBe(2);
    expect(metrics.bestLandedCost.amountNgn).toBe(14200000);
    expect(metrics.bestLandedCost.leadSupplier).toBe('Precision Works Lagos');
    expect(metrics.bestLandedCost.targetCeilingNgn).toBe(15000000);
    expect(metrics.bestLandedCost.varianceNgn).toBe(-800000); // ₦800k below target ceiling
    expect(metrics.actionNeededCount).toBe(1);
    expect(metrics.actionItems[0].type).toBe('quote_review');
  });

  it('should retrieve and rank received supplier quotes', async () => {
    const response = await getJobQuotes(jobId, testOrgId);

    expect(response.quotes.length).toBe(2);
    expect(response.targetCeilingNgn).toBe(15000000);

    const cheapest = response.quotes.find((q) => q.rankBadge === 'Cheapest');
    expect(cheapest).toBeDefined();
    expect(cheapest?.supplierName).toBe('Precision Works Lagos');
    expect(cheapest?.totalBidNgn).toBe(14200000);
    expect(cheapest?.fitScore).toBe(94);

    const fastest = response.quotes.find((q) => q.rankBadge === 'Fastest');
    expect(fastest).toBeDefined();
    expect(fastest?.supplierName).toBe('Apex Tooling Ltd (Ogun)');
    expect(fastest?.leadTimeDays).toBe(5);
  });

  it('should award a quote and transition job stage to commit', async () => {
    const response = await getJobQuotes(jobId, testOrgId);
    const quoteToAward = response.quotes[0];

    const result = await awardQuote(quoteToAward.id, jobId, testOrgId, 'Chief Engineer');
    expect(result.status).toBe('awarded');

    // Verify job stage transitioned to 'commit'
    const updatedMetrics = await getProjectSourcingMetrics(projectId, testOrgId);
    expect(updatedMetrics.projectStatus).toBe('Commit');
    expect(updatedMetrics.currentStageIndex).toBe(3);

    // Verify activity stream logged the event
    const activities = await getFormattedActivities(testOrgId, { projectId });
    expect(activities.length).toBeGreaterThan(0);
    const awardActivity = activities.find((a) => a.eventType === 'quote_awarded');
    expect(awardActivity).toBeDefined();
    expect(awardActivity?.title).toBe('Quote Awarded');
    expect(awardActivity?.severity).toBe('success');
  });
});
