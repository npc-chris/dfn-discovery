/**
 * Site & Real Estate Service
 *
 * Provides facility intelligence and on-site verification data.
 * Used for evidence enrichment and recommendation presentation.
 *
 * Responsibilities:
 * - Track facility specifications (size, age, condition)
 * - Manage facility certifications and compliance status
 * - Provide site visit reports and documentation
 * - Monitor facility availability and scheduling
 * - Track facility expansion or modernization plans
 * - Integrate with site survey data and satellite imagery (optional)
 */

import { Factory } from '@dfn/shared/types';

export interface SiteBrief {
  facility_id: string;
  facility_name: string;
  facility_size_sqft: number;
  facility_age_years: number;
  facility_condition: 'excellent' | 'good' | 'fair' | 'poor';
  equipment_age_years: number;
  certifications: string[]; // ISO standards, environmental, safety
  compliance_status: 'fully_compliant' | 'mostly_compliant' | 'non_compliant';
  capacity_utilization_percent: number;
  expansion_planned: boolean;
  expansion_timeline_months?: number;
  last_site_visit_date: string; // ISO date
  site_visit_confidence: number; // 0-100
  environmental_permits: boolean;
  labor_availability_assessment: string; // 'high', 'medium', 'low'
}

export class SiteRealEstate {
  /**
   * Generate comprehensive facility brief for a factory.
   * Used by Recommendation Presentation Layer to provide detailed site information.
   *
   * @param factory - Factory profile with location and identifiers
   * @returns Detailed facility brief with all site specifications
   *
   * TODO: Implement facility data retrieval:
   *   - Query facility database for specifications
   *   - Get certification status from compliance tracking
   *   - Retrieve most recent site visit report
   *   - Calculate equipment depreciation (age)
   *   - Assess capacity utilization from production logs
   *   - Check for planned expansions from capital projects
   * TODO: Handle missing data (use last-known or placeholder)
   * TODO: Validate data freshness (warn if site visit >12 months old)
   */
  async generateSiteBrief(factory: Factory): Promise<SiteBrief> {
    throw new Error('Not implemented: generateSiteBrief');
  }

  /**
   * Assess facility condition for scoring and presentation.
   * Provides facility quality score (0-100) for confidence weighting.
   *
   * @param brief - Facility brief information
   * @returns Facility condition score and risk assessment
   *
   * TODO: Implement facility scoring:
   *   - Base score: 50 + (condition score) * 10
   *     - excellent: +50, good: +30, fair: +10, poor: -10
   *   - Bonus for modern equipment (age < 5 years): +15 points
   *   - Bonus for full compliance: +10 points
   *   - Penalty for non-compliance: -20 points
   *   - Bonus for low utilization (<60%): +10 points (capacity available)
   *   - Bonus for planned expansion: +10 points
   * TODO: Normalize to 0-100 range
   */
  assessFacilityCondition(brief: SiteBrief): { score: number; risk_level: 'low' | 'medium' | 'high' } {
    throw new Error('Not implemented: assessFacilityCondition');
  }

  /**
   * Get site visit report summary for presentation.
   * Used to show verification confidence and last inspection details.
   *
   * @param factory - Factory to retrieve visit report for
   * @returns Summary of most recent site visit
   *
   * TODO: Query site visit database
   * TODO: Return visit date, inspector notes, and findings
   * TODO: Calculate freshness (days since last visit)
   * TODO: Identify any red flags or maintenance issues
   */
  async getSiteVisitReport(factory: Factory): Promise<{
    lastVisitDate: string;
    daysSinceVisit: number;
    findings: string[];
    redFlags: string[];
    recommendations: string[];
  }> {
    throw new Error('Not implemented: getSiteVisitReport');
  }

  /**
   * Check facility availability for job scheduling.
   * Used to inform feasibility and timeline assessments.
   *
   * @param factory - Factory to check availability for
   * @param requiredCapacityPercent - Percentage of factory capacity needed
   * @param requiredLeadDays - Minimum lead time needed
   * @returns Availability assessment
   *
   * TODO: Check current capacity utilization
   * TODO: Assess if required capacity can be freed up
   * TODO: Verify lead time against production schedule
   * TODO: Identify any conflicts or scheduling constraints
   */
  async checkFacilityAvailability(
    factory: Factory,
    requiredCapacityPercent: number,
    requiredLeadDays: number
  ): Promise<{ available: boolean; reason?: string; alternative_dates?: string[] }> {
    throw new Error('Not implemented: checkFacilityAvailability');
  }
}

/**
 * Singleton instance for site & real estate
 */
let instance: SiteRealEstate | null = null;

export function getSiteRealEstate(): SiteRealEstate {
  if (!instance) {
    instance = new SiteRealEstate();
  }
  return instance;
}
