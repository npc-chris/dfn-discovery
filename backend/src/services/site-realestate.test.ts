import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSiteRealEstate, SiteRealEstate, SiteBrief } from './site-realestate';
import type { Factory } from '@dfn/shared/types';
import { getRedisClient } from './redis-client';

vi.mock('./redis-client', () => ({
  getRedisClient: vi.fn(),
}));

describe('SiteRealEstate Service', () => {
  let service: SiteRealEstate;
  let mockFactory: Factory;

  beforeEach(() => {
    service = new SiteRealEstate();
    mockFactory = { id: 'factory-123', name: 'Test Factory' } as Factory;
    vi.clearAllMocks();
    
    (getRedisClient as any).mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      setEx: vi.fn().mockResolvedValue('OK'),
      isOpen: true,
    });
  });

  describe('generateSiteBrief', () => {
    it('generates a site brief by combining UpKeep and SafetyCulture data', async () => {
      const brief = await service.generateSiteBrief(mockFactory);
      
      expect(brief.facility_id).toBe('factory-123');
      expect(brief.facility_name).toBe('Test Factory');
      expect(brief.compliance_status).toBeDefined();
      expect(brief.last_site_visit_date).toBeDefined();
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