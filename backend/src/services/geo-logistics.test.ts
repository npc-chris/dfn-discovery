import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGeoLogistics, GeoLogistics, LogisticsAssessment } from './geo-logistics';
import type { Job, Factory } from '@dfn/shared/types';
import { getRedisClient } from './redis-client';

vi.mock('./redis-client', () => ({
  getRedisClient: vi.fn(),
}));

describe('GeoLogistics Service', () => {
  let service: GeoLogistics;
  const mockFetch = vi.fn();

  beforeEach(() => {
    service = new GeoLogistics();
    vi.clearAllMocks();
    process.env.HERE_API_KEY = 'test-here-key';
    vi.stubGlobal('fetch', mockFetch);
    
    // Mock redis client
    (getRedisClient as any).mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      setEx: vi.fn().mockResolvedValue('OK'),
      isOpen: true,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [
          {
            sections: [
              { summary: { length: 620000 } },
            ],
          },
        ],
      }),
    });
  });

  it('falls back to deterministic routing when HERE is unavailable', async () => {
    delete process.env.HERE_API_KEY;

    const mockJob = {
      id: 'job-2',
      delivery_location: { latitude: 6.5244, longitude: 3.3792 },
    } as unknown as Job;

    const mockFactory = {
      id: 'fac-2',
      location: { latitude: 8.9839, longitude: 7.5562 },
    } as unknown as Factory;

    const assessment = await service.assessLogistics(mockJob, mockFactory);

    expect(assessment.distance_km).toBeGreaterThan(0);
    expect(assessment.estimated_lead_days).toBeGreaterThan(0);
    expect(assessment.feasibility_confidence).toBeLessThan(90);
  });

  describe('estimateLeadTime', () => {
    it('calculates correct short lead time for domestic road', () => {
      const assessment: LogisticsAssessment = {
        distance_km: 100,
        estimated_lead_days: 0,
        transport_modes: ['road'],
        primary_mode: 'road',
        routing_cost_estimate_ngn: 50000,
        border_crossings: 0,
        regulatory_constraints: [],
        feasible: true,
        feasibility_confidence: 90,
      };

      // 100 distance / 300 km/day = ceil(0.33) = 1 day travel
      // Factory processing = +5 days
      // Total = 6 days
      const leadTime = service.estimateLeadTime(assessment);
      expect(leadTime).toBe(6);
    });

    it('adds customs processing for border crossings', () => {
      const assessment: LogisticsAssessment = {
        distance_km: 200,
        estimated_lead_days: 0,
        transport_modes: ['rail'],
        primary_mode: 'rail',
        routing_cost_estimate_ngn: 50000,
        border_crossings: 1, // +3 days
        regulatory_constraints: [],
        feasible: true,
        feasibility_confidence: 90,
      };

      // 200km / 100km/day = ceil(2) = 2 days travel
      // 3 days customs + 5 days factory = 10 days total
      const leadTime = service.estimateLeadTime(assessment);
      expect(leadTime).toBe(10);
    });

    it('returns fast delivery for air transport', () => {
      const assessment: LogisticsAssessment = {
        distance_km: 1500,
        estimated_lead_days: 0,
        transport_modes: ['air'],
        primary_mode: 'air',
        routing_cost_estimate_ngn: 500000,
        border_crossings: 0,
        regulatory_constraints: [],
        feasible: true,
        feasibility_confidence: 90,
      };

      // 1 day travel + 0 days customs + 5 days factory = 6 days
      const leadTime = service.estimateLeadTime(assessment);
      expect(leadTime).toBe(6);
    });
    
    it('returns long delivery for sea transport', () => {
      const assessment: LogisticsAssessment = {
        distance_km: 5000,
        estimated_lead_days: 0,
        transport_modes: ['sea'],
        primary_mode: 'sea',
        routing_cost_estimate_ngn: 150000,
        border_crossings: 1, // +3 days
        regulatory_constraints: [],
        feasible: true,
        feasibility_confidence: 90,
      };

      // 21 days travel (midpoint between 14-28) + 3 days customs + 5 days processing = 29 days
      const leadTime = service.estimateLeadTime(assessment);
      expect(leadTime).toBe(29);
    });
  });

  describe('computeLogisticsFeasibilityScore', () => {
    it('calculates perfect score for close direct logistics', () => {
      const mockJob = {} as Job;
      const assessment: LogisticsAssessment = {
        distance_km: 50,
        estimated_lead_days: 10,
        transport_modes: ['road'],
        primary_mode: 'road',
        routing_cost_estimate_ngn: 10000,
        border_crossings: 0,
        regulatory_constraints: [],
        feasible: true,
        feasibility_confidence: 90,
      };

      const score = service.computeLogisticsFeasibilityScore(mockJob, assessment);
      // Base: 100 - (50/1000)*10 = 99.5
      // No penalties
      // Bonus: +5 (direct, no border crossing)
      // Clamped to 100
      expect(score).toBe(100);
    });

    it('applies penalties for long lead times and border crossings', () => {
      const mockJob = {} as Job;
      const assessment: LogisticsAssessment = {
        distance_km: 2000,
        estimated_lead_days: 25, // > 14 days
        transport_modes: ['road'],
        primary_mode: 'road',
        routing_cost_estimate_ngn: 10000,
        border_crossings: 2, // No bonus
        regulatory_constraints: [],
        feasible: true,
        feasibility_confidence: 90,
      };

      const score = service.computeLogisticsFeasibilityScore(mockJob, assessment);
      // Base: 100 - (2000/1000)*10 = 80
      // Penalty: lead > 14 days => -15
      // Total: 65
      expect(score).toBe(65);
    });

    it('applies penalties for very high cost', () => {
      // In shared/types/job.ts, the budget field is target_price_max, not maximum_budget_ngn
      const mockJob = { target_price_max: 1000000 } as unknown as Job;
      const assessment: LogisticsAssessment = {
        distance_km: 100, // -1 base
        estimated_lead_days: 10, // ok
        transport_modes: ['road'],
        primary_mode: 'road',
        routing_cost_estimate_ngn: 200000, // 20% of budget (>15%)
        border_crossings: 0, // +5 bonus
        regulatory_constraints: [],
        feasible: true,
        feasibility_confidence: 90,
      };

      const score = service.computeLogisticsFeasibilityScore(mockJob, assessment);
      // Base: 100 - 1 = 99
      // Direct bonus: +5
      // Cost penalty: -10
      // Total: 94
      expect(score).toBe(94);
    });
  });

  describe('assessLogistics', () => {
    it('uses mocked location data to compute realistic assessment', async () => {
      const mockJob = {
        id: 'job-1',
        title: 'Test Job',
        delivery_location: { latitude: 6.5244, longitude: 3.3792, state: 'Lagos', country: 'Nigeria' }
      } as unknown as Job;

      const mockFactory = {
        id: 'fac-1',
        name: 'Test Factory',
        location: { latitude: 8.9839, longitude: 7.5562, state: 'Abuja', country: 'Nigeria' }
      } as unknown as Factory;

      const assessment = await service.assessLogistics(mockJob, mockFactory);

      expect(assessment.distance_km).toBeGreaterThan(0);
      expect(assessment.primary_mode).toBeDefined();
      expect(assessment.estimated_lead_days).toBeGreaterThan(0);
      expect(assessment.routing_cost_estimate_ngn).toBeGreaterThan(0);
    });
  });
});
