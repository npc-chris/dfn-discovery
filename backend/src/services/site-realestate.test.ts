import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SiteRealEstate, SiteBrief } from './site-realestate';
import type { Factory } from '@dfn/shared/types';
import { getRedisClient } from './redis-client';

vi.mock('./redis-client', () => ({
  getRedisClient: vi.fn(),
}));

describe('SiteRealEstate Service', () => {
  let service: SiteRealEstate;
  let mockFactory: Factory;
  const mockFetch = vi.fn();

  beforeEach(() => {
    service = new SiteRealEstate();
    mockFactory = { id: 'factory-123', name: 'Test Factory' } as Factory;
    vi.clearAllMocks();
    process.env.UPKEEP_API_KEY = 'test-upkeep-key';
    process.env.SAFETYCULTURE_API_KEY = 'test-safetyculture-key';
    vi.stubGlobal('fetch', mockFetch);
    
    (getRedisClient as any).mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      setEx: vi.fn().mockResolvedValue('OK'),
      isOpen: true,
    });

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/assets?')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'asset-1',
                name: 'CNC Machine',
                category: 'Machining',
                location: { id: 'factory-123' },
                createdAt: '2021-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
                status: 'operational',
              },
            ],
          }),
        } as Response;
      }

      if (url.includes('/work-orders?')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'wo-1',
                title: 'Monthly check',
                status: 'complete',
                priority: 'medium',
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-02T00:00:00.000Z',
                asset: { id: 'asset-1' },
              },
            ],
          }),
        } as Response;
      }

      if (url.includes('/audits/search?')) {
        return {
          ok: true,
          json: async () => ({
            audits: [
              {
                audit_id: 'audit-1',
                template_id: 'template-1',
                name: 'Safety Audit',
                score: 92,
                total_score: 100,
                modified_at: '2026-05-20T00:00:00.000Z',
                created_at: '2026-05-20T00:00:00.000Z',
                failed_responses_count: 1,
              },
            ],
          }),
        } as Response;
      }

      throw new Error(`Unexpected URL in fetch mock: ${url}`);
    });
  });

  describe('generateSiteBrief', () => {
    it('generates a site brief by combining UpKeep and SafetyCulture data', async () => {
      const brief = await service.generateSiteBrief(mockFactory);
      
      expect(brief.facility_id).toBe('factory-123');
      expect(brief.facility_name).toBe('Test Factory');
      expect(brief.compliance_status).toBeDefined();
      expect(brief.last_site_visit_date).toBe('2026-05-20T00:00:00.000Z');
      expect(brief.facility_size_sqft).toBeGreaterThanOrEqual(0);
    });

    it('degrades gracefully with baseline brief when provider credentials are missing', async () => {
      delete process.env.UPKEEP_API_KEY;
      delete process.env.SAFETYCULTURE_API_KEY;

      const brief = await service.generateSiteBrief(mockFactory);
      expect(brief.facility_id).toBe('factory-123');
      expect(brief.site_visit_confidence).toBe(0);
    });
  });

  describe('assessFacilityCondition', () => {
    it('returns high score and low risk for excellent facilities', () => {
      const brief = {
        facility_condition: 'excellent', // +50 (base 50 = 100)
        equipment_age_years: 2, // <5 -> +15
        compliance_status: 'fully_compliant', // +10
        capacity_utilization_percent: 50, // <60 -> +10
        expansion_planned: true // +10
      } as unknown as SiteBrief;

      const result = service.assessFacilityCondition(brief);
      expect(result.score).toBe(100); // Clamped
      expect(result.risk_level).toBe('low');
    });

    it('returns low score and high risk for poor facilities', () => {
      const brief = {
        facility_condition: 'poor', // -10 (base 50 = 40)
        equipment_age_years: 15,
        compliance_status: 'non_compliant', // -20
        capacity_utilization_percent: 80,
        expansion_planned: false
      } as unknown as SiteBrief;

      const result = service.assessFacilityCondition(brief);
      expect(result.score).toBe(20);
      expect(result.risk_level).toBe('high');
    });
  });

  describe('getSiteVisitReport', () => {
    it('fetches safety inspection report correctly', async () => {
      const report = await service.getSiteVisitReport(mockFactory);
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.lastVisitDate).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });
  });

  describe('checkFacilityAvailability', () => {
    it('rejects if lead time is too short', async () => {
      // Mock generateSiteBrief utilizing vi
      vi.spyOn(service, 'generateSiteBrief').mockResolvedValue({
        capacity_utilization_percent: 50 // 50% available
      } as SiteBrief);

      const result = await service.checkFacilityAvailability(mockFactory, 30, 2);
      expect(result.available).toBe(false);
      expect(result.reason).toContain('Lead time too short');
    });

    it('rejects if capacity is insufficient', async () => {
      vi.spyOn(service, 'generateSiteBrief').mockResolvedValue({
        capacity_utilization_percent: 90 // 10% available
      } as SiteBrief);

      const result = await service.checkFacilityAvailability(mockFactory, 30, 14);
      expect(result.available).toBe(false);
      expect(result.reason).toContain('Insufficient capacity');
    });

    it('approves if conditions are met', async () => {
      vi.spyOn(service, 'generateSiteBrief').mockResolvedValue({
        capacity_utilization_percent: 50 // 50% available
      } as SiteBrief);

      const result = await service.checkFacilityAvailability(mockFactory, 30, 14);
      expect(result.available).toBe(true);
    });
  });
});