import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMarketIntelligence, MarketIntelligence, MarketSignals } from './market-intelligence';
import type { Factory } from '@dfn/shared/types';
import { getRedisClient } from './redis-client';

vi.mock('./redis-client', () => ({
  getRedisClient: vi.fn(),
}));

describe('MarketIntelligence Service', () => {
  let service: MarketIntelligence;

  beforeEach(() => {
    service = new MarketIntelligence();
    vi.clearAllMocks();
    
    (getRedisClient as any).mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      setEx: vi.fn().mockResolvedValue('OK'),
      isOpen: true,
    });
  });

  describe('getMarketSignals', () => {
    it('returns structured market signals based on product type', async () => {
      const mockFactory = { id: 'factory-1' } as Factory;
      const signals = await service.getMarketSignals(mockFactory, 'Textiles');
      
      expect(signals.product_demand_trend).toBeDefined();
      expect(signals.estimated_price_range_per_unit_ngn).toHaveLength(2);
      expect(signals.factory_market_share_percent).toBeGreaterThanOrEqual(0);
    });
  });

  describe('computeMarketAccessScore', () => {
    it('computes correct score for a strong market position', () => {
      const signals: MarketSignals = {
        product_demand_trend: 'increasing', // +20
        demand_confidence: 90,
        estimated_market_size_annual_ngn: 1000000,
        estimated_price_range_per_unit_ngn: [10, 20],
        factory_market_share_percent: 15, // > 10% -> +10
        factory_order_frequency_per_month: 10, // > 5 -> +15
        factory_reputation_score: 80, // > 75 -> +10
        recent_price_trend: 'up', // no penalty
      };
      
      // Base: 50 + 20 + 15 + 10 + 10 = 105 -> clamped to 100
      const score = service.computeMarketAccessScore(signals);
      expect(score).toBe(100);
    });

    it('computes correct score for a weak market position', () => {
      const signals: MarketSignals = {
        product_demand_trend: 'decreasing', // -20
        demand_confidence: 90,
        estimated_market_size_annual_ngn: 1000000,
        estimated_price_range_per_unit_ngn: [10, 20],
        factory_market_share_percent: 5, // no bonus
        factory_order_frequency_per_month: 2, // no bonus
        factory_reputation_score: 50, // no bonus
        recent_price_trend: 'down', // -10 penalty
      };
      
      // Base: 50 - 20 - 10 = 20
      const score = service.computeMarketAccessScore(signals);
      expect(score).toBe(20);
    });
  });

  describe('getMarketOutlook', () => {
    it('returns a natural language outlook string', async () => {
      const outlook = await service.getMarketOutlook('Plastics');
      expect(outlook.outlook).toBeTypeOf('string');
      expect(outlook.outlook.length).toBeGreaterThan(10);
      expect(outlook.confidence).toBeGreaterThan(0);
    });
  });
});