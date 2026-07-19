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
import { routing as hereRouting } from './integrations/here';
import type { LatLng } from './integrations/here/here.types';

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

const NIGERIA_LGA_COORDINATES: Record<string, LatLng> = {
  // Lagos LGAs
  'ikeja': { lat: 6.6018, lng: 3.3515 },
  'eti-osa': { lat: 6.4584, lng: 3.6015 },
  'lagos mainland': { lat: 6.5000, lng: 3.3800 },
  'alimosho': { lat: 6.6167, lng: 3.2500 },
  'ikorodu': { lat: 6.6167, lng: 3.5000 },
  'oshodi-isolo': { lat: 6.5333, lng: 3.3167 },
  'apapa': { lat: 6.4500, lng: 3.3667 },
  'surulere': { lat: 6.5000, lng: 3.3500 },
  'epe': { lat: 6.5833, lng: 3.9833 },
  'badagry': { lat: 6.4167, lng: 2.8833 },
  
  // Kano LGAs
  'kano municipal': { lat: 12.0022, lng: 8.5920 },
  'dala': { lat: 12.0167, lng: 8.5167 },
  'fagge': { lat: 12.0100, lng: 8.5300 },
  'gwale': { lat: 11.9833, lng: 8.4833 },
  'nassarawa': { lat: 12.0000, lng: 8.5500 },
  
  // FCT / Abuja LGAs
  'abuja municipal': { lat: 9.0765, lng: 7.3986 },
  'amac': { lat: 9.0765, lng: 7.3986 },
  'bwari': { lat: 9.2833, lng: 7.3833 },
  'gwagwalada': { lat: 8.9500, lng: 7.0833 },
  
  // Oyo / Ibadan LGAs
  'ibadan north': { lat: 7.4167, lng: 3.9000 },
  'ibadan south-west': { lat: 7.3667, lng: 3.8667 },
  'oluyole': { lat: 7.2833, lng: 3.8667 },
  
  // Rivers / Port Harcourt LGAs
  'port harcourt': { lat: 4.8156, lng: 7.0498 },
  'obio-akpor': { lat: 4.8500, lng: 7.0000 },
  
  // Enugu LGAs
  'enugu north': { lat: 6.4584, lng: 7.5464 },
  'enugu south': { lat: 6.4167, lng: 7.5000 },
  
  // Kaduna LGAs
  'kaduna north': { lat: 10.5333, lng: 7.4333 },
  'kaduna south': { lat: 10.4833, lng: 7.4167 },
  
  // Anambra LGAs
  'onitsha north': { lat: 6.1557, lng: 6.9855 },
  'onitsha south': { lat: 6.1333, lng: 6.7833 },
  'nnewi north': { lat: 6.0167, lng: 6.9167 },
  
  // Abia LGAs
  'aba north': { lat: 5.1333, lng: 7.3667 },
  'aba south': { lat: 5.1066, lng: 7.3667 },
  
  // Edo / Benin LGAs
  'oredo': { lat: 6.3350, lng: 5.6037 },
  'ikpoba-okha': { lat: 6.3167, lng: 5.6500 },
  'egor': { lat: 6.3667, lng: 5.6000 },
  
  // Plateau / Jos LGAs
  'jos north': { lat: 9.9167, lng: 8.8833 },
  'jos south': { lat: 9.7500, lng: 8.8667 },
  
  // Ogun LGAs
  'abeokuta south': { lat: 7.1557, lng: 3.3458 },
  'ado-odo/ota': { lat: 6.6833, lng: 3.2333 },
  'sagamu': { lat: 6.8333, lng: 3.6500 },
};

function lookupLgaCoordinates(location?: any): LatLng {
  if (!location) {
    throw new Error('Location is required to resolve coordinates');
  }

  if (typeof location.latitude === 'number' && typeof location.longitude === 'number') {
    return { lat: location.latitude, lng: location.longitude };
  }

  if (location.lga && typeof location.lga === 'string') {
    const lgaKey = location.lga.toLowerCase().trim();
    if (NIGERIA_LGA_COORDINATES[lgaKey]) {
      return NIGERIA_LGA_COORDINATES[lgaKey];
    }
  }

  throw new Error(`Location missing valid lat/lng and unrecognized LGA: "${location.lga || 'undefined'}"`);
}

export class GeoLogistics {
  private buildAssessmentFromDistance(distanceKm: number, feasibilityConfidence: number): LogisticsAssessment {
    const normalizedDistanceKm = Math.max(1, distanceKm);
    const transport_modes = normalizedDistanceKm > 500 ? ['road', 'air'] : ['road'];
    const primary_mode = normalizedDistanceKm > 700 ? 'air' : 'road';
    const border_crossings = normalizedDistanceKm > 600 ? 1 : 0;
    const routing_cost_estimate_ngn = Math.round(normalizedDistanceKm * 1500);

    const partialAssessment: Omit<LogisticsAssessment, 'estimated_lead_days'> = {
      distance_km: normalizedDistanceKm,
      transport_modes,
      primary_mode,
      routing_cost_estimate_ngn,
      border_crossings,
      regulatory_constraints: border_crossings > 0 ? ['inter-state duties', 'transit-permit'] : [],
      feasible: normalizedDistanceKm < 2500,
      feasibility_confidence: feasibilityConfidence,
    };

    return {
      ...partialAssessment,
      estimated_lead_days: this.estimateLeadTime(partialAssessment as LogisticsAssessment),
    };
  }

  private resolveJobCoordinates(job: Job): LatLng {
    const location = job.delivery_location ?? job.location;
    return lookupLgaCoordinates(location);
  }

  private resolveFactoryCoordinates(factory: Factory): LatLng {
    const location = factory.location ?? factory.locations?.[0];
    return lookupLgaCoordinates(location);
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
    const redis = getRedisClient() as any;
    const origin = this.resolveJobCoordinates(job);
    const destination = this.resolveFactoryCoordinates(factory);
    const cacheKey = `logistics:route:${job.id}:${factory.id}`;
    const fallbackDistanceKm = haversineDistanceKm(origin, destination) * 1.25;

    const cacheAssessment = async (assessment: LogisticsAssessment) => {
      if (redis.isOpen) {
        await redis.setEx(cacheKey, 3600, JSON.stringify(assessment)); // 1 hour TTL
      }
      return assessment;
    };

    if (redis.isOpen) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as LogisticsAssessment;
      }
    }

    if (!process.env.HERE_API_KEY) {
      return cacheAssessment(this.buildAssessmentFromDistance(fallbackDistanceKm, 70));
    }

    try {
      // Use the HERE routing adapter to get a normalized route result
      const route = await hereRouting.getRoute(
        { lat: origin.lat, lng: origin.lng },
        { lat: destination.lat, lng: destination.lng },
        { transportMode: 'truck' },
      );

      const distance_km = (route.distanceMeters || 0) / 1000;
      if (distance_km <= 0) {
        return cacheAssessment(this.buildAssessmentFromDistance(fallbackDistanceKm, 70));
      }

      return cacheAssessment(this.buildAssessmentFromDistance(distance_km, 90));
    } catch {
      return cacheAssessment(this.buildAssessmentFromDistance(fallbackDistanceKm, 70));
    }
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
   * Calculates fallback lead time when HERE routing is unavailable.
   * Speed baselines (conservative; gives supply-chain breathing room):
   *   - Road : 300 km/day  (Nigerian long-haul truck average)
   *   - Rail : 100 km/day  (Nigerian freight rail)
   *   - Air  : 1 day       (next-day delivery)
   *   - Sea  : 21 days     (~3-week average)
   *   - Customs/border processing: 3 days per crossing
   *   - Factory processing time: 5 business days
   */
  estimateLeadTime(assessment: LogisticsAssessment): number {
    let travelDays = 0;

    switch (assessment.primary_mode) {
      case 'air':
        travelDays = 1;
        break;
      case 'sea':
        travelDays = 21; // ~3 weeks average
        break;
      case 'rail':
        // Nigerian freight rail: ~100 km/day (conservative)
        travelDays = Math.ceil(assessment.distance_km / 100);
        break;
      case 'road':
      default:
        // Nigerian long-haul truck: ~300 km/day (conservative)
        travelDays = Math.ceil(assessment.distance_km / 300);
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

function haversineDistanceKm(origin: LatLng, destination: LatLng): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const deltaLat = toRadians(destination.lat - origin.lat);
  const deltaLng = toRadians(destination.lng - origin.lng);
  const latitudeA = toRadians(origin.lat);
  const latitudeB = toRadians(destination.lat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2) * Math.cos(latitudeA) * Math.cos(latitudeB);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
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
