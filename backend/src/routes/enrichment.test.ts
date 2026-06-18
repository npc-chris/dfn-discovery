import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

import { describe, it, expect } from 'vitest';
import { factories } from '../db/schema.ts';
import {
  performLogisticsAssessment,
  retrieveMarketSignals,
  retrieveMarketOutlook,
  retrieveSiteBrief,
  retrieveSiteVisitReport,
  verifyFacilityAvailability,
} from './enrichment.ts';

// Mock data
const mockJob = {
  id: 'job-1',
  company_name: 'ACME Corp',
  product_name: 'Widget',
  location: { country: 'NG', latitude: 6.5244, longitude: 3.3792 },
  target_price_max: 1000000,
};

const mockFactory = {
  id: 'factory-1',
  factory_name: 'Lagos Manufacturing',
  capabilities: { processes: ['injection-molding'] },
  materials: ['plastic'],
  capacity_band: 'medium',
  locations: [{ country: 'NG', latitude: 6.6018, longitude: 3.3515 }],
  active: true,
};

// Fake Database builder
const callLog: string[] = [];
const fakeDb: any = {
  select() {
    callLog.push('select');
    return {
      from(table: any) {
        if (table === factories) {
          return {
            where() {
              return {
                limit(_max: number) {
                  return Promise.resolve([mockFactory]);
                },
              };
            },
          };
        }
        return Promise.resolve([]);
      },
    };
  },
};

// Fake Services
const mockGeoLogistics: any = {
  assessLogistics: async (_job: any, _factory: any) => {
    callLog.push('assessLogistics');
    return {
      distance_km: 15,
      estimated_lead_days: 6,
      transport_modes: ['road'],
      primary_mode: 'road',
      routing_cost_estimate_ngn: 22500,
      border_crossings: 0,
      regulatory_constraints: [],
      feasible: true,
      feasibility_confidence: 90,
    };
  },
};

const mockMarketIntelligence: any = {
  getMarketSignals: async (_factory: any, _productType: string) => {
    callLog.push('getMarketSignals');
    return {
      product_demand_trend: 'increasing',
      demand_confidence: 95,
      estimated_market_size_annual_ngn: 15000000000,
      estimated_price_range_per_unit_ngn: [1200, 1500],
      factory_market_share_percent: 5,
      factory_order_frequency_per_month: 8,
      factory_reputation_score: 85,
      recent_price_trend: 'stable',
    };
  },
  getMarketOutlook: async (_productType: string) => {
    callLog.push('getMarketOutlook');
    return {
      outlook: 'Strong demand expected.',
      confidence: 80,
    };
  },
};

const mockSiteRealEstate: any = {
  generateSiteBrief: async (factory: any) => {
    callLog.push('generateSiteBrief');
    return {
      facility_id: factory.id,
      facility_name: factory.factory_name,
      facility_size_sqft: 35000,
      facility_age_years: 4,
      facility_condition: 'excellent',
      equipment_age_years: 3,
      certifications: ['ISO 9001'],
      compliance_status: 'fully_compliant',
      capacity_utilization_percent: 40,
      expansion_planned: true,
      last_site_visit_date: '2026-05-01',
      site_visit_confidence: 95,
      environmental_permits: true,
      labor_availability_assessment: 'medium',
    };
  },
  getSiteVisitReport: async (_factory: any) => {
    callLog.push('getSiteVisitReport');
    return {
      lastVisitDate: '2026-05-01',
      daysSinceVisit: 48,
      findings: ['Passed audit'],
      redFlags: [],
      recommendations: ['Maintain current procedures'],
    };
  },
  checkFacilityAvailability: async (_factory: any, _requiredCapacityPercent: number, _requiredLeadDays: number) => {
    callLog.push('checkFacilityAvailability');
    return {
      available: true,
    };
  },
};

describe('Enrichment Route Handler Logic', () => {
  const jobLoader = async () => mockJob as any;

  it('performs logistics assessment correctly', async () => {
    const logistics = await performLogisticsAssessment(
      'job-1',
      'factory-1',
      fakeDb,
      jobLoader,
      mockGeoLogistics
    );
    expect(logistics.distance_km).toBe(15);
    expect(logistics.feasible).toBe(true);
    expect(callLog).toContain('assessLogistics');
  });

  it('retrieves market signals correctly', async () => {
    const signals = await retrieveMarketSignals(
      'factory-1',
      'plastic-widget',
      fakeDb,
      mockMarketIntelligence
    );
    expect(signals.product_demand_trend).toBe('increasing');
    expect(signals.factory_reputation_score).toBe(85);
    expect(callLog).toContain('getMarketSignals');
  });

  it('retrieves market outlook correctly', async () => {
    const outlook = await retrieveMarketOutlook('plastic-widget', mockMarketIntelligence);
    expect(outlook.confidence).toBe(80);
    expect(callLog).toContain('getMarketOutlook');
  });

  it('generates site brief correctly', async () => {
    const brief = await retrieveSiteBrief('factory-1', fakeDb, mockSiteRealEstate);
    expect(brief.facility_size_sqft).toBe(35000);
    expect(brief.facility_condition).toBe('excellent');
    expect(callLog).toContain('generateSiteBrief');
  });

  it('retrieves site visit report correctly', async () => {
    const report = await retrieveSiteVisitReport('factory-1', fakeDb, mockSiteRealEstate);
    expect(report.daysSinceVisit).toBe(48);
    expect(callLog).toContain('getSiteVisitReport');
  });

  it('verifies facility availability correctly', async () => {
    const availability = await verifyFacilityAvailability(
      'factory-1',
      20,
      14,
      fakeDb,
      mockSiteRealEstate
    );
    expect(availability.available).toBe(true);
    expect(callLog).toContain('checkFacilityAvailability');
  });
});
