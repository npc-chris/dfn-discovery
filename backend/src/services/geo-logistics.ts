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
 * - Integrate with mapping APIs (optional, can use deterministic placeholders)
 * - Track routing costs for feasibility assessment
 */

import { Job, Factory } from '@dfn/shared/types';

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
    throw new Error('Not implemented: assessLogistics');
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
    throw new Error('Not implemented: computeLogisticsFeasibilityScore');
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
    throw new Error('Not implemented: estimateLeadTime');
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
