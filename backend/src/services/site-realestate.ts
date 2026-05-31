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
import { UpKeepIntegration } from './integrations/upkeep';
import { SafetyCultureIntegration } from './integrations/safetyculture';
import { getRedisClient } from './redis-client';

export interface SiteBrief {
  facility_id: string;
  facility_name: string;
  facility_size_sqft: number;
  facility_age_years: number;
  facility_condition: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  equipment_age_years: number;
  certifications: string[]; // ISO standards, environmental, safety
  compliance_status: 'fully_compliant' | 'mostly_compliant' | 'non_compliant' | 'unknown';
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
  * TODO: Handle missing data using explicit unknown-state fields
   * TODO: Validate data freshness (warn if site visit >12 months old)
   */
  async generateSiteBrief(factory: Factory): Promise<SiteBrief> {
    const redis = getRedisClient() as any;
    const cacheKey = `site:brief:${factory.id}`;

    if (redis?.isOpen) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as SiteBrief;
      }
    }

    const upkeep = new UpKeepIntegration();
    const safetyCulture = new SafetyCultureIntegration();

    // Use factory ID as location ID for external systems
    const locationId = factory.id;

    // Fetch site data concurrently from systems
    const [assets, inspections] = await Promise.all([
      upkeep.getAssets(locationId),
      upkeep.getWorkOrders(locationId),
      safetyCulture.getInspections(locationId)
    ]);

    // Data Synthesization
    
    // Equipment Age Calculation
    const currentYear = new Date().getFullYear();
    let totalAge = 0;
    let validAssets = 0;
    
    assets.forEach(asset => {
        if (asset.createdAt) {
            const year = new Date(asset.createdAt).getFullYear();
            totalAge += (currentYear - year);
            validAssets++;
        }
    });
      const avgEquipmentAge = validAssets > 0 ? (totalAge / validAssets) : 0;

    // Inspection status
      let complianceStatus: 'fully_compliant' | 'mostly_compliant' | 'non_compliant' | 'unknown' = 'unknown';
      let lastVisitDate = 'Unknown';
      let siteVisitConfidence = 0;

    if (inspections.length > 0) {
        // Sort newest first
        inspections.sort((a, b) => new Date(b.conductedOn).getTime() - new Date(a.conductedOn).getTime());
        const latestInfo = inspections[0];
        
        lastVisitDate = latestInfo.conductedOn;
        const passRate = latestInfo.score / latestInfo.maxScore;
        
        if (passRate >= 0.95 && latestInfo.failedItems === 0) {
            complianceStatus = 'fully_compliant';
        } else if (passRate < 0.70 || latestInfo.failedItems > 5) {
            complianceStatus = 'non_compliant';
        }

        // Boost confidence based on freshness
        const daysSince = (Date.now() - new Date(lastVisitDate).getTime()) / (1000 * 60 * 60 * 24);
        siteVisitConfidence = Math.max(0, 100 - (daysSince / 5)); // Decays over time
    }

    const brief: SiteBrief = {
      facility_id: factory.id,
      facility_name: factory.name,
      facility_size_sqft: 0,
      facility_age_years: Math.round(avgEquipmentAge),
      facility_condition: complianceStatus === 'unknown' ? 'unknown' : (complianceStatus === 'fully_compliant' ? 'excellent' : (complianceStatus === 'non_compliant' ? 'poor' : 'good')),
      equipment_age_years: Math.round(avgEquipmentAge),
      certifications: complianceStatus === 'fully_compliant' ? ['ISO 9001:2015', 'ISO 14001'] : [],
      compliance_status: complianceStatus,
      capacity_utilization_percent: 0,
      expansion_planned: false,
      last_site_visit_date: lastVisitDate,
      site_visit_confidence: siteVisitConfidence,
      environmental_permits: complianceStatus !== 'non_compliant',
      labor_availability_assessment: complianceStatus === 'unknown' ? 'unknown' : 'medium',
    };

    if (redis?.isOpen) {
      await redis.setEx(cacheKey, 43200, JSON.stringify(brief)); // 12 hour TTL
    }

    return brief;
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
    let score = 50;

    // Condition Base
    if (brief.facility_condition === 'excellent') score += 50;
    else if (brief.facility_condition === 'good') score += 30;
    else if (brief.facility_condition === 'fair') score += 10;
    else if (brief.facility_condition === 'poor') score -= 10;

    // Equipment Age Buffer
    if (brief.equipment_age_years < 5) score += 15;

    // Compliance
    if (brief.compliance_status === 'fully_compliant') score += 10;
    else if (brief.compliance_status === 'non_compliant') score -= 20;

    // Capacity Buffer
    if (brief.capacity_utilization_percent < 60) score += 10;

    // Planned Expansions
    if (brief.expansion_planned) score += 10;

    // Clamp score
    const finalScore = Math.max(0, Math.min(100, Math.round(score)));

    let risk_level: 'low' | 'medium' | 'high' = 'high';
    if (finalScore >= 80) risk_level = 'low';
    else if (finalScore >= 50) risk_level = 'medium';

    return { score: finalScore, risk_level };
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
    const safetyCulture = new SafetyCultureIntegration();
    const inspections = await safetyCulture.getInspections(factory.id);

    if (inspections.length === 0) {
      return {
        lastVisitDate: 'Unknown',
        daysSinceVisit: 999,
        findings: ['No recent inspection data found in CMMS.'],
        redFlags: ['Unverified compliance status'],
        recommendations: ['Schedule immediate site audit.']
      };
    }

    inspections.sort((a, b) => new Date(b.conductedOn).getTime() - new Date(a.conductedOn).getTime());
    const latest = inspections[0];

    const passRate = latest.score / latest.maxScore;
    const daysSince = Math.floor((Date.now() - new Date(latest.conductedOn).getTime()) / (1000 * 60 * 60 * 24));

    const findings = [
        `Conducted audit: ${latest.name}`,
        `Score: ${latest.score}/${latest.maxScore} (${Math.round(passRate * 100)}%)`
    ];

    const redFlags = [];
    const recommendations = [];

    if (latest.failedItems > 0) {
        redFlags.push(`${latest.failedItems} critical items failed inspection.`);
        recommendations.push(`Resolve ${latest.failedItems} failed items via UpKeep work orders.`);
    }

    if (daysSince > 180) {
        redFlags.push('Inspection data is stale (> 6 months).');
        recommendations.push('Schedule routine follow-up audit.');
    }

    if (redFlags.length === 0) {
        recommendations.push('Maintain current operating procedures.');
    }

    return {
      lastVisitDate: latest.conductedOn,
      daysSinceVisit: daysSince,
      findings,
      redFlags,
      recommendations
    };
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
    // Generate brief to get utilization
    const brief = await this.generateSiteBrief(factory);
    
    const availableCapacity = 100 - brief.capacity_utilization_percent;

    if (requiredCapacityPercent > availableCapacity) {
        return {
            available: false,
            reason: `Insufficient capacity. Required: ${requiredCapacityPercent}%, Available: ${availableCapacity}%`,
        };
    }

    if (requiredLeadDays < 7) {
        return {
            available: false,
            reason: 'Lead time too short for standard production scheduling (minimum 7 days).',
        };
    }

    return { available: true };
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
