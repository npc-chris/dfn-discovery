/**
 * Market Intelligence Service
 *
 * Provides market signals, demand data, and pricing intelligence for factories.
 * Used during evidence enrichment and scoring for market access assessment.
 *
 * Responsibilities:
 * - Track market demand for specific products/materials
 * - Provide pricing reference data for market positioning
 * - Assess factory market reputation and order frequency
 * - Identify market growth trends
 * - Monitor competitor pricing and capacity
 * - Integrate with market data feeds (optional, can use deterministic placeholders)
 */

import { Factory } from '@dfn/shared/types';
import { getRedisClient } from './redis-client';

export interface MarketSignals {
  product_demand_trend: 'increasing' | 'stable' | 'decreasing';
  demand_confidence: number; // 0-100
  estimated_market_size_annual_ngn: number;
  estimated_price_range_per_unit_ngn: [number, number]; // Min, max
  factory_market_share_percent: number; // 0-100
  factory_order_frequency_per_month: number;
  factory_reputation_score: number; // 0-100
  recent_price_trend: 'up' | 'stable' | 'down';
}

export class MarketIntelligence {
  /**
   * Assess market signals and demand for a factory's products.
   * Used by Core Intelligence for MarketAccess component score.
   *
   * @param factory - Factory profile
   * @param productType - Product category for demand lookup
   * @returns Market signals and demand assessment
   *
   * TODO: Implement market data queries:
   *   - Look up product demand from market database or API
   *   - Retrieve factory historical order frequency
   *   - Calculate factory market share (orders / market total)
   *   - Get pricing data for product category
   *   - Assess factory reputation from reviews/feedback
   * TODO: Handle missing data gracefully (return neutral/default signals)
   * TODO: Cache market data with TTL (24 hours recommended)
   * TODO: Support trend analysis over time
   */
  async getMarketSignals(factory: Factory, productType: string): Promise<MarketSignals> {
    const redis = getRedisClient();
    const cacheKey = `market:signals:${factory.id}:${productType}`;

    if (redis.isOpen) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as MarketSignals;
      }
    }

    let wbIndicatorValue = 0;
    
    // 1. Interrogate World Bank API for macro manufacturing trends 
    // Indicator NV.IND.MANF.ZS: Manufacturing, value added (% of GDP)
    // We try to pull Nigeria (NG) data specifically, or fallback to Sub-Saharan Africa.
    try {
      const wbResponse = await fetch(
        'https://api.worldbank.org/v2/country/NG/indicator/NV.IND.MANF.ZS?format=json&date=2021:2024'
      );
      if (wbResponse.ok) {
        const wbData = await wbResponse.json();
        if (Array.isArray(wbData) && wbData.length > 1 && Array.isArray(wbData[1])) {
          // Find the most recent non-null value
          const recentData = wbData[1].find((d: any) => d.value !== null);
          if (recentData) {
            wbIndicatorValue = recentData.value;
          }
        }
      }
    } catch (err) {
      console.error('World Bank API error:', err);
    }

    // Hash productType strictly for pseudo-random deterministic traits if we don't have UN Comtrade keys
    const productHash = productType.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // Baseline trends based on WB indicator if available (e.g. > 10% manufacturing added value is strong)
    const demandTrend = wbIndicatorValue > 12 ? 'increasing' : (wbIndicatorValue < 8 ? 'decreasing' : 'stable');
    
    // Optional UN Comtrade integration if key provided
    if (process.env.COMTRADE_API_KEY) {
      try {
        const comtradeRes = await fetch(
          `https://comtradeapi.un.org/data/v1/get/C/A/HS?subscription-key=${process.env.COMTRADE_API_KEY}&reportercode=566` // 566 = Nigeria
        );
        // ... Normally we would parse exact HS codes here
        if (comtradeRes.ok) {
           // Refine productHash based on imports/exports data
           // (stubbed implementation logic due to complex HS codes)
        }
      } catch (err) {
        console.error('UN Comtrade API error:', err);
      }
    }
    
    // Synthesize the real-world macro dataset with factory specific assumptions
    const signals: MarketSignals = {
      product_demand_trend: wbIndicatorValue > 0 ? demandTrend : (['decreasing', 'stable', 'increasing'] as const)[productHash % 3],
      demand_confidence: wbIndicatorValue > 0 ? 95 : (70 + (productHash % 30)), // High confidence if we have external data
      estimated_market_size_annual_ngn: 100000000 + (productHash * 50000), 
      estimated_price_range_per_unit_ngn: [100 + (productHash % 50), 500 + (productHash % 200)],
      factory_market_share_percent: 2 + (productHash % 15), 
      factory_order_frequency_per_month: 1 + (productHash % 10), 
      factory_reputation_score: 50 + (productHash % 45), 
      recent_price_trend: (wbIndicatorValue > 10) ? 'up' : 'stable',
    };

    if (redis.isOpen) {
      await redis.setEx(cacheKey, 86400, JSON.stringify(signals)); // 24 hour TTL
    }

    return signals;
  }

  /**
   * Compute a market access feasibility score (0-100) for Core Intelligence.
   * Combines market demand, factory reputation, and pricing position.
   *
   * @param signals - Market signals for the factory
   * @returns Feasibility score
   *
   * TODO: Implement scoring:
   *   - Base score: 50 + (demand_trend) * 20 (increasing=+20, stable=+0, decreasing=-20)
   *   - Bonus for high order frequency (>5/month): +15 points
   *   - Bonus for strong reputation (>75 score): +10 points
   *   - Penalty for declining price trend: -10 points
   *   - Bonus for market leader position (>10% share): +10 points
   * TODO: Normalize to 0-100 range
   */
  computeMarketAccessScore(signals: MarketSignals): number {
    let score = 50;

    // Trend adjustment
    if (signals.product_demand_trend === 'increasing') {
      score += 20;
    } else if (signals.product_demand_trend === 'decreasing') {
      score -= 20;
    } // stable is +0

    // High order frequency bonus
    if (signals.factory_order_frequency_per_month > 5) {
      score += 15;
    }

    // Strong reputation bonus
    if (signals.factory_reputation_score > 75) {
      score += 10;
    }

    // Penalty for declining price trend
    if (signals.recent_price_trend === 'down') {
      score -= 10;
    }

    // Market leader bonus
    if (signals.factory_market_share_percent > 10) {
      score += 10;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Get market outlook and trend information for presentation.
   * Used to inform user about market conditions affecting recommendation.
   *
   * @param productType - Product category
   * @returns Trend description and confidence
   *
   * TODO: Provide natural language summary of market conditions
   * TODO: Highlight risks (declining demand, oversupply)
   * TODO: Identify opportunities (rising demand, price stability)
   */
  async getMarketOutlook(productType: string): Promise<{ outlook: string; confidence: number }> {
    const productHash = productType.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const isPositive = productHash % 2 === 0;

    let outlook = '';
    if (isPositive) {
      outlook = `The market outlook for ${productType} is generally positive with rising demand and stable pricing projected for the next 2 quarters. We see growth opportunities primarily due to domestic supply chain shifts.`;
    } else {
      outlook = `Demand for ${productType} shows a slight cooling trend. While market saturation is a risk, stable mid-market producers with long-term contracts remain insulated.`;
    }

    return {
      outlook,
      confidence: 65 + (productHash % 30),
    };
  }
}

/**
 * Singleton instance for market intelligence
 */
let instance: MarketIntelligence | null = null;

export function getMarketIntelligence(): MarketIntelligence {
  if (!instance) {
    instance = new MarketIntelligence();
  }
  return instance;
}
