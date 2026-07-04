import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPresentationLayer, PresentationLayer } from './presentation-layer';
import type { Job, Factory } from '@dfn/shared/types';
import type { ScoringResult } from './core-intelligence';
import { getGeoLogistics } from './geo-logistics';
import { getMarketIntelligence } from './market-intelligence';
import { getSiteRealEstate } from './site-realestate';
import { createAIAnalysisWorkers } from './ai-analysis-workers';

// Mock the dependencies
vi.mock('./geo-logistics', () => ({
  getGeoLogistics: vi.fn(),
}));

vi.mock('./market-intelligence', () => ({
  getMarketIntelligence: vi.fn(),
}));

vi.mock('./site-realestate', () => ({
  getSiteRealEstate: vi.fn(),
}));

vi.mock('./ai-analysis-workers', () => ({
  createAIAnalysisWorkers: vi.fn(),
}));

describe('PresentationLayer Service', () => {
  let service: PresentationLayer;
  let mockJob: Job;
  let mockFactory: Factory;
  let mockScoringResult: ScoringResult;

  beforeEach(() => {
    service = getPresentationLayer();
    vi.clearAllMocks();

    mockJob = {
      id: 'job-123',
      company_name: 'DFN Labs',
      product_name: '3D Gears',
      process_type: 'injection-molding',
      material_type: 'nylon',
      volume_band: '100-500',
      location: { country: 'Nigeria' },
      status: 'submitted',
      created_at: new Date('2026-05-01T12:00:00Z'),
      updated_at: new Date('2026-05-01T13:00:00Z'),
    } as unknown as Job;

    mockFactory = {
      id: 'factory-456',
      factory_name: 'FabFast Nigeria',
      active: true,
      certifications: ['ISO 9001'],
    } as unknown as Factory;

    mockScoringResult = {
      recommendationId: 'rec-789',
      jobId: 'job-123',
      factoryId: 'factory-456',
      fitScore: 85,
      feasibilityScore: 90,
      confidenceScore: 75,
      componentScores: {
        processMatch: 95,
        materialMatch: 90,
        capacityMatch: 85,
        geographyAndLogistics: 80,
        marketAccess: 75,
        evidenceConfidence: 70,
      },
      evidenceCount: 3,
      confidencePenalty: 0,
      gatePassed: true,
      rank: 1,
    };

    // Setup default mocks
    (getGeoLogistics as any).mockReturnValue({
      assessLogistics: vi.fn().mockResolvedValue({
        distance_km: 150,
        estimated_lead_days: 4,
        routing_cost_estimate_ngn: 25000,
        border_crossings: 0,
        transport_modes: ['road'],
        primary_mode: 'road',
      }),
    });

    (getMarketIntelligence as any).mockReturnValue({
      getMarketSignals: vi.fn().mockResolvedValue({
        product_demand_trend: 'increasing',
        demand_confidence: 90,
        estimated_market_size_annual_ngn: 50000000,
        estimated_price_range_per_unit_ngn: [15000, 20000],
        factory_market_share_percent: 5,
        factory_order_frequency_per_month: 8,
        factory_reputation_score: 80,
        recent_price_trend: 'up',
      }),
      computeMarketAccessScore: vi.fn().mockReturnValue(80),
    });

    (getSiteRealEstate as any).mockReturnValue({
      generateSiteBrief: vi.fn().mockResolvedValue({
        facility_id: 'factory-456',
        facility_name: 'FabFast Nigeria',
        facility_size_sqft: 25000,
        facility_condition: 'excellent',
        compliance_status: 'fully_compliant',
        capacity_utilization_percent: 60,
      }),
      assessFacilityCondition: vi.fn().mockReturnValue({
        score: 90,
        risk_level: 'low',
      }),
    });

    (createAIAnalysisWorkers as any).mockReturnValue({
      explainRecommendation: vi.fn().mockResolvedValue({
        explanation: 'AI generated explanation details here.',
      }),
    });
  });

  describe('formatRecommendation', () => {
    it('enriches raw scoring results with external data sources', async () => {
      const presentation = await service.formatRecommendation(mockScoringResult, mockJob, mockFactory);

      expect(presentation.recommendationId).toBe('rec-789');
      expect(presentation.rank).toBe(1);
      expect(presentation.factoryName).toBe('FabFast Nigeria');
      expect(presentation.fitScore).toBe(85);
      expect(presentation.confidenceScore).toBe(75);
      expect(presentation.confidenceLevel).toBe('high'); // 75 >= 60 is high
      expect(presentation.fitDescription).toBe('Excellent fit'); // 85 >= 80 is Excellent
      expect(presentation.leadTimeEstimate).toBe('4–9 business days');
      expect(presentation.costAssessment).toBe('Cost-competitive');
      expect(presentation.facilityQuality).toBe('Excellent facility condition');
      expect(presentation.keyStrengths.length).toBeGreaterThan(0);
      expect(presentation.keyRisks.length).toBeGreaterThan(0);
    });

    it('falls back gracefully to neutral description on external call failure', async () => {
      // Force getSiteRealEstate to throw
      (getSiteRealEstate as any).mockReturnValue({
        generateSiteBrief: vi.fn().mockRejectedValue(new Error('Site CMMS down')),
      });

      const presentation = await service.formatRecommendation(mockScoringResult, mockJob, mockFactory);
      expect(presentation.facilityQuality).toBe('Facility data unavailable');
    });
  });

  describe('formatRecommendationSummary', () => {
    it('generates a summary rollup representing job state and candidates', () => {
      const recs = [
        {
          recommendationId: 'rec-1',
          factoryName: 'FabFast',
          fitScore: 85,
          fitDescription: 'Excellent fit',
        },
      ] as any[];

      const summary = service.formatRecommendationSummary(mockJob, recs);

      expect(summary.jobId).toBe('job-123');
      expect(summary.totalRecommendations).toBe(1);
      expect(summary.gatePassed).toBe(true);
      expect(summary.gateFailureReason).toBeUndefined();
    });

    it('fails recommendation gate if no factory has fit score >= 60', () => {
      const recs = [
        {
          recommendationId: 'rec-1',
          factoryName: 'FabFast',
          fitScore: 45,
          fitDescription: 'Fair fit',
        },
      ] as any[];

      const summary = service.formatRecommendationSummary(mockJob, recs);

      expect(summary.gatePassed).toBe(false);
      expect(summary.gateFailureReason).toContain('No recommendations met the minimum fit score threshold');
    });
  });

  describe('generateExplanation', () => {
    it('uses AI worker for detailed style explanation', async () => {
      const explanation = await service.generateExplanation(mockScoringResult, mockJob, mockFactory, 'detailed');
      expect(explanation).toBe('AI generated explanation details here.');
    });

    it('returns a deterministic fallback explanation on AI failure', async () => {
      (createAIAnalysisWorkers as any).mockReturnValue({
        explainRecommendation: vi.fn().mockRejectedValue(new Error('AI limit reached')),
      });

      const explanation = await service.generateExplanation(mockScoringResult, mockJob, mockFactory, 'detailed');
      expect(explanation).toContain('FabFast Nigeria achieved a fit score of 85/100');
      expect(explanation).toContain('Scoring methodology');
    });

    it('generates deterministic description for executive style', async () => {
      const explanation = await service.generateExplanation(mockScoringResult, mockJob, mockFactory, 'executive');
      expect(explanation).toBe(
        'FabFast Nigeria is a excellent fit for 3D Gears. Fit score: 85/100. Feasibility: 90/100. Confidence: high. Top factors: Process Match, Material Match, Capacity Match.',
      );
    });
  });

  describe('generateDetailedReport', () => {
    it('supports JSON format', async () => {
      const presentation = { recommendationId: 'rec-1' } as any;
      const summary = { jobId: 'job-1' } as any;
      const report = await service.generateDetailedReport(summary, [presentation], 'json');
      const parsed = JSON.parse(report);

      expect(parsed.summary.jobId).toBe('job-1');
      expect(parsed.recommendations).toHaveLength(1);
    });

    it('generates HTML report output', async () => {
      const presentation = {
        recommendationId: 'rec-1',
        rank: 1,
        factoryName: 'FabFast Nigeria',
        fitScore: 85,
        feasibilityScore: 90,
        confidenceLevel: 'high',
        confidenceScore: 75,
        leadTimeEstimate: '4-9 business days',
        costAssessment: 'Cost-competitive',
        facilityQuality: 'Excellent',
        keyStrengths: ['Strong process'],
        keyRisks: ['No major risk'],
        detailedExplanation: 'Deterministic explanation details.',
        nextSteps: ['Verify certifications'],
        componentBreakdown: [
          { label: 'Process Match', score: 95, weight: 0.25, contribution: 24 },
        ],
      } as any;

      const summary = {
        jobId: 'job-123',
        jobName: 'DFN Labs - 3D Gears',
        submittedDate: '2026-05-01',
        status: 'recommended',
        totalRecommendations: 1,
        gatePassed: true,
      } as any;

      const html = await service.generateDetailedReport(summary, [presentation], 'html');
      expect(html).toContain('DFN Discovery');
      expect(html).toContain('Manufacturing Recommendation Report');
      expect(html).toContain('FabFast Nigeria');
    });
  });

  describe('buildComparisonTable', () => {
    it('builds table comparison matrices for top candidates', () => {
      const recs = [
        {
          factoryId: 'factory-456',
          factoryName: 'FabFast Nigeria',
          fitScore: 85,
          feasibilityScore: 90,
          confidenceScore: 75,
          keyStrengths: ['Process', 'Material', 'Capacity'],
          keyRisks: ['Logistics'],
          componentBreakdown: [
            { score: 95 }, { score: 90 }, { score: 85 }, { score: 80 }, { score: 75 },
          ],
        },
      ] as any[];

      const table = service.buildComparisonTable(recs, 1);

      expect(table.criteria).toContain('Fit Score');
      expect(table.factories).toHaveLength(1);
      expect(table.factories[0].name).toBe('FabFast Nigeria');
      expect(table.factories[0].scores).toEqual([85, 90, 75, 95, 90, 85, 80, 75]);
    });
  });
});
