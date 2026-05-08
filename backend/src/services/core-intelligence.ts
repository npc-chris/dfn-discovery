/**
 * Core Intelligence Service
 *
 * Computes fit scores, feasibility assessments, and factory rankings.
 * Core logic engine for decision making on job routing.
 *
 * Responsibilities:
 * - Score jobs against factory capabilities
 * - Rank recommendations by fit and confidence
 * - Apply recommendation gate rules
 * - Compute component scores (process match, material match, etc.)
 * - Handle scoring errors and fallback logic
 * - Track scoring provenance (why a factory was ranked)
 */

import { Job, Factory, Recommendation, EvidenceItem } from '@dfn/shared/types';
import { SCORING_WEIGHTS, CONFIDENCE_PENALTY_FACTOR, RECOMMENDATION_GATE_RULES } from '@dfn/shared/constants/scoring';

export interface ScoringInput {
  jobId: string;
  job: Job;
  factories: Factory[];
  evidence: Record<string, EvidenceItem[]>; // Map of factory ID to evidence items
}

export interface ScoringResult {
  recommendationId: string;
  jobId: string;
  factoryId: string;
  fitScore: number; // 0-100
  feasibilityScore: number; // 0-100
  confidenceScore: number; // 0-30 (draft) or 0-100 (final)
  componentScores: {
    processMatch: number;
    materialMatch: number;
    capacityMatch: number;
    geographyAndLogistics: number;
    marketAccess: number;
    evidenceConfidence: number;
  };
  evidenceCount: number;
  confidencePenalty: number; // Applied penalty for missing data
  gatePassed: boolean; // Whether recommendation meets gate rules
  gateFaiureReason?: string; // If gatePassed=false, why it failed
  rank: number; // 1-based rank among recommendations for this job
}

export class CoreIntelligence {
  /**
   * Score a single factory for a job.
   * Computes fit score using weighted component scoring and confidence penalties.
   *
   * @param input - Job, factory, and evidence data
   * @returns Scoring result with component breakdown and gate status
   * @throws AppError if scoring cannot proceed (missing critical data)
   *
   * TODO: Implement weighted scoring formula:
   *   - ProcessMatch: 0.25 weight
   *   - MaterialMatch: 0.20 weight
   *   - CapacityMatch: 0.15 weight
   *   - GeographyAndLogistics: 0.20 weight
   *   - MarketAccess: 0.10 weight
   *   - EvidenceConfidence: 0.10 weight
   * TODO: Apply confidence penalty: 15% per missing component
   * TODO: Compute feasibility as secondary score (capacity + logistics)
   * TODO: Store component scores for debugging and UI display
   * TODO: Track provenance: why each component scored as it did
   */
  async scoreJob(input: ScoringInput): Promise<ScoringResult[]> {
    throw new Error('Not implemented: scoreJob');
  }

  /**
   * Rank recommendations by fit score and confidence.
   * Orders factories from best fit to worst, applying gate rules.
   *
   * @param scoringResults - Unranked scoring results
   * @returns Ranked and filtered recommendations
   *
   * TODO: Sort by fit score (descending)
   * TODO: Within same fit score, sort by confidence score
   * TODO: Apply recommendation gate rules:
   *   - At least 1 factory in results
   *   - At least 1 evidence item per factory
   *   - Confidence ≥30 for draft, ≥60 for final
   * TODO: Assign rank 1, 2, 3, etc.
   * TODO: Set gatePassed flag and failure reason if gate rules not met
   * TODO: Return top N (configurable, default 5) recommendations
   */
  async rankRecommendations(scoringResults: ScoringResult[]): Promise<ScoringResult[]> {
    throw new Error('Not implemented: rankRecommendations');
  }

  /**
   * Compute a single component score (0-100).
   * Used by scoreJob to evaluate one aspect of job-factory fit.
   *
   * @param component - Component type (processMatch, materialMatch, etc.)
   * @param job - Job data
   * @param factory - Factory data
   * @returns Score 0-100
   *
   * TODO: Implement deterministic scoring for each component:
   *   - ProcessMatch: compare job.process_type with factory.capabilities.processes
   *   - MaterialMatch: compare job.material_type with factory.capabilities.materials
   *   - CapacityMatch: compare job.volume_band with factory.capabilities.capacity_band
   *   - GeographyAndLogistics: use distance scoring from Geo service (TODO: call)
   *   - MarketAccess: use market intelligence from Market service (TODO: call)
   *   - EvidenceConfidence: aggregate confidence of all evidence items
   */
  private computeComponentScore(component: keyof typeof SCORING_WEIGHTS, job: Job, factory: Factory, evidence: EvidenceItem[]): number {
    throw new Error('Not implemented: computeComponentScore');
  }

  /**
   * Apply confidence penalty for missing data.
   * Reduces scores when evidence is incomplete.
   *
   * @param baseScore - Score before penalty
   * @param missingComponentCount - Number of missing or unverified components
   * @returns Score after penalty
   *
   * TODO: Calculate penalty as: baseScore * (1 - CONFIDENCE_PENALTY_FACTOR * missingComponentCount)
   * TODO: Floor at 0, cap at 100
   */
  private applyConfidencePenalty(baseScore: number, missingComponentCount: number): number {
    throw new Error('Not implemented: applyConfidencePenalty');
  }

  /**
   * Check if a recommendation meets gate rules.
   * Gate rules prevent presenting low-quality recommendations.
   *
   * @param result - Scoring result to validate
   * @param stage - 'draft' or 'final'
   * @returns true if gate passed, false otherwise
   *
   * TODO: Implement rules from RECOMMENDATION_GATE_RULES constant
   */
  private checkGateRules(result: ScoringResult, stage: 'draft' | 'final'): boolean {
    throw new Error('Not implemented: checkGateRules');
  }
}

/**
 * Singleton instance for core intelligence
 */
let instance: CoreIntelligence | null = null;

export function getCoreIntelligence(): CoreIntelligence {
  if (!instance) {
    instance = new CoreIntelligence();
  }
  return instance;
}
