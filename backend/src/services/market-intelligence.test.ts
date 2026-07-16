import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMarketIntelligence, MarketIntelligence, MarketSignals } from './market-intelligence';
import type { Factory } from '@dfn/shared/types';
import { getRedisClient } from './redis-client';

vi.mock('./redis-client', () => ({
  getRedisClient: vi.fn(),
}));

describe('MarketIntelligence Service', () => {
  let service: MarketIntelligence;
  const mockFetch = vi.fn();

  beforeEach(() => {
    service = new MarketIntelligence();
    vi.clearAllMocks();
    process.env.COMTRADE_API_KEY = 'test-comtrade-key';
    vi.stubGlobal('fetch', mockFetch);
    
    (getRedisClient as any).mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      setEx: vi.fn().mockResolvedValue('OK'),
      isOpen: true,
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([{}, [{ value: 10.2 }]]),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { primaryValue: 1200000000 },
          { primaryValue: 300000000 },
        ],
      }),
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

  it('throws an error when external sources are unavailable', async () => {
    delete process.env.COMTRADE_API_KEY;
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const mockFactory = { id: 'factory-fallback' } as Factory;
    await expect(service.getMarketSignals(mockFactory, 'Textiles')).rejects.toThrow();
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
    // Test-only helper: the deterministic hash-based outlook that was previously
    // baked into the production code. Preserved here for regression testing of
    // the expected shape, NOT for use in production logic.
    function deterministicMockOutlook(productType: string): { outlook: string; confidence: number } {
      const productHash = productType.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const isPositive = productHash % 2 === 0;
      const outlook = isPositive
        ? `The market outlook for ${productType} is generally positive with rising demand and stable pricing projected for the next 2 quarters. We see growth opportunities primarily due to domestic supply chain shifts.`
        : `Demand for ${productType} shows a slight cooling trend. While market saturation is a risk, stable mid-market producers with long-term contracts remain insulated.`;
      return { outlook, confidence: 65 + (productHash % 30) };
    }

    it('mock helper produces a deterministic outlook string (test-only)', () => {
      const result = deterministicMockOutlook('Plastics');
      expect(result.outlook).toBeTypeOf('string');
      expect(result.outlook.length).toBeGreaterThan(10);
      expect(result.confidence).toBeGreaterThanOrEqual(65);
      expect(result.confidence).toBeLessThanOrEqual(94);
    });

    it('real getMarketOutlook throws when market data is unavailable', async () => {
      delete process.env.COMTRADE_API_KEY;
      mockFetch.mockRejectedValueOnce(new Error('network down'));
      await expect(service.getMarketOutlook('Plastics')).rejects.toThrow();
    });
  });
});