/**
 * Geo & Logistics Service
 *
 * Computes geographic fit, logistics feasibility, and routing analysis.
 * Used during evidence enrichment and scoring.
 *
 * Responsibilities:
 * - Calculate distance between job location and factory
 * - Assess logistics feasibility (routes, transport modes, costs)
 * - Compute delivery lead times
 * - Identify geographic constraints (border crossings, regulations)
 * - Integrate with mapping APIs
 * - Track routing costs for feasibility assessment
 */

import type { Job, Factory } from '@dfn/shared/types';
import { getRedisClient } from './redis-client';

export interface LogisticsAssessment {
  distance_km: number;
  estimated_lead_days: number;
  transport_modes: string[]; // 'road', 'rail', 'air', 'sea'
  primary_mode: string;
  routing_cost_estimate_ngn: number;
  border_crossings: number;
  regulatory_constraints: string[];
  feasible: boolean;
  feasibility_confidence: number; // 0-100
}

export class GeoLogistics {
  private resolveJobCoordinates(job: Job): { latitude: number; longitude: number } {
    const location = job.delivery_location ?? job.location;

    if (location.latitude == null || location.longitude == null) {
      throw new Error(`Missing job coordinates for ${job.id}`);
    }

    return {
      latitude: location.latitude,
      longitude: location.longitude,
    };
  }

  private resolveFactoryCoordinates(factory: Factory): { latitude: number; longitude: number } {
    const location = factory.location ?? factory.locations?.[0];

    if (!location || location.latitude == null || location.longitude == null) {
      throw new Error(`Missing factory coordinates for ${factory.id}`);
    }

    return {
      latitude: location.latitude,
      longitude: location.longitude,
    };
  }

  /**
   * Calculate distance and routing from job location to factory.
   * Used by Core Intelligence for GeographyAndLogistics component score.
   *
   * @param job - Job with location
   * @param factory - Factory with location
   * @returns Distance in km and logistics details
   *
   * TODO: Implement distance calculation (use Google Maps API or deterministic formula)
   * TODO: Determine optimal transport mode(s) based on distance and volume
   * TODO: Calculate lead time based on transport mode and distance
   * TODO: Estimate routing cost based on distance and transport mode
   * TODO: Identify border crossings if locations are in different states/countries
   * TODO: Flag regulatory constraints (import duties, documentation, customs)
   * TODO: Cache results to avoid repeated API calls
   */
  async assessLogistics(job: Job, factory: Factory): Promise<LogisticsAssessment> {
    const redis = getRedisClient();
    const origin = this.resolveJobCoordinates(job);
    const destination = this.resolveFactoryCoordinates(factory);

    if (!process.env.HERE_API_KEY) {
      throw new Error('HERE_API_KEY is required for logistics routing');
    }
    
    // Create a stable cache key
    const cacheKey = `logistics:route:${job.id}:${factory.id}`;
    if (redis.isOpen) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as LogisticsAssessment;
      }
    }

    const hereResponse = await fetch(
      `https://router.hereapi.com/v8/routes?transportMode=truck&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&return=summary&apikey=${process.env.HERE_API_KEY}`
    );

    if (!hereResponse.ok) {
      throw new Error(`HERE routing request failed with status ${hereResponse.status}`);
    }

    const hereData = await hereResponse.json();
    const routeSummary = hereData?.routes?.[0]?.sections?.[0]?.summary;

    if (!routeSummary || typeof routeSummary.length !== 'number') {
      throw new Error('HERE routing response did not include a route length');
    }

    const distance_km = routeSummary.length / 1000;

    if (distance_km <= 0) {
      throw new Error('HERE routing returned a non-positive distance');
    }

    const transport_modes = distance_km > 500 ? ['road', 'air'] : ['road'];
    const primary_mode = distance_km > 700 ? 'air' : 'road';
    
    const border_crossings = distance_km > 600 ? 1 : 0;
    
    const routing_cost_estimate_ngn = distance_km * 1500;

    const partialAssessment: Omit<LogisticsAssessment, 'estimated_lead_days'> = {
      distance_km,
      transport_modes,
      primary_mode,
      routing_cost_estimate_ngn,
      border_crossings,
      regulatory_constraints: border_crossings > 0 ? ['inter-state duties', 'transit-permit'] : [],
      feasible: true,
      feasibility_confidence: 90,
    };

    const assessment: LogisticsAssessment = {
      ...partialAssessment,
      estimated_lead_days: this.estimateLeadTime(partialAssessment as LogisticsAssessment)
    };

    if (redis.isOpen) {
      await redis.setEx(cacheKey, 3600, JSON.stringify(assessment)); // 1 hour TTL
    }

    return assessment;
  }

  /**
   * Compute a logistics feasibility score (0-100) for Core Intelligence.
   * Combines distance, lead time, and cost considerations.
   *
   * @param job - Job with volume requirements
   * @param assessment - Logistics assessment details
   * @returns Feasibility score
   *
   * TODO: Implement scoring:
   *   - Base score 100 - (distance_km / 1000) * 10
   *   - Penalty for lead time exceeding 14 days: -15 points
   *   - Penalty for very high cost (>15% of manufacturing): -10 points
   *   - Bonus for direct mode without border crossing: +5 points
   * TODO: Normalize to 0-100 range
   */
  computeLogisticsFeasibilityScore(job: Job, assessment: LogisticsAssessment): number {
    let score = 100;
    
    // Base distance penalty: (distance_km / 1000) * 10
    const distancePenalty = (assessment.distance_km / 1000) * 10;
    score -= distancePenalty;

    // Penalty for lead time exceeding 14 days
    if (assessment.estimated_lead_days > 14) {
      score -= 15;
    }

    // Cost penalty: > 15% of budget.
    const budget = job.target_price_max;
    if (typeof budget === 'number' && budget > 0 && assessment.routing_cost_estimate_ngn > (budget * 0.15)) {
      score -= 10;
    }

    // Bonus for direct mode without border crossing
    if (assessment.border_crossings === 0 && assessment.transport_modes.length === 1) {
      score += 5;
    }

    // Clamp score to 0-100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Get estimated delivery lead time given logistics assessment.
   * Used by presentation layer to show delivery commitments.
   *
   * @param assessment - Logistics assessment
   * @returns Lead time in business days
   *
   * TODO: Calculate based on:
   *   - Transport mode speed (road: 10 km/day, rail: 20 km/day, air: next day, sea: 2-4 weeks)
   *   - Customs/border processing (2-5 days if crossing)
   *   - Factory processing time (5 business days default)
   */
  estimateLeadTime(assessment: LogisticsAssessment): number {
    let travelDays = 0;
    
    // Transport mode speed (road: 10 km/day, rail: 20 km/day, air: next day, sea: 2-4 weeks)
    // Note: The speeds given in doc are quite slow, interpreting literally.
    switch (assessment.primary_mode) {
      case 'air':
        travelDays = 1;
        break;
      case 'sea':
        travelDays = 21; // ~3 weeks avg
        break;
      case 'rail':
        travelDays = Math.ceil(assessment.distance_km / 20);
        break;
      case 'road':
      default:
        travelDays = Math.ceil(assessment.distance_km / 10);
        break;
    }

    let totalDays = travelDays;

    // Customs/border processing (2-5 days if crossing) - Using 3 days on avg
    if (assessment.border_crossings > 0) {
      totalDays += 3 * assessment.border_crossings;
    }

    // Factory processing time (5 business days default)
    totalDays += 5;

    return totalDays;
  }
}

/**
 * Singleton instance for geo & logistics
 */
let instance: GeoLogistics | null = null;

export function getGeoLogistics(): GeoLogistics {
  if (!instance) {
    instance = new GeoLogistics();
  }
  return instance;
}
