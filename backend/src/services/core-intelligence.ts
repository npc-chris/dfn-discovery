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

import { createHash } from 'crypto';
import type { Job, Factory, EvidenceItem } from '@dfn/shared';
import { SCORING_WEIGHTS, CONFIDENCE_PENALTY_FACTOR, RECOMMENDATION_GATE_RULES } from '@dfn/shared/constants/scoring';
import { getRedisConnection } from './redis-client.ts';

const CACHE_TTL_MS = 5 * 60 * 1000;

const CACHE_TTL_SECONDS = Math.ceil(CACHE_TTL_MS / 1000);
const SCORE_CACHE_PREFIX = 'dfn:core-intelligence:score';
const RANK_CACHE_PREFIX = 'dfn:core-intelligence:rank';

function cloneResults(results: ScoringResult[]): ScoringResult[] {
  return JSON.parse(JSON.stringify(results)) as ScoringResult[];
}

function hashCacheKey(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

function buildScoreCacheKey(input: ScoringInput): string {
  return hashCacheKey(
    JSON.stringify({
      jobId: input.jobId,
      jobVersion: input.job.version,
      factoryIds: input.factories.map((factory) => factory.id),
      evidence: Object.entries(input.evidence).map(([factoryId, items]) => ({
        factoryId,
        evidenceCount: items.length,
        confidences: items.map((item) => item.confidence),
      })),
    }),
  );
}

function buildRankCacheKey(scoringResults: ScoringResult[]): string {
  return hashCacheKey(
    JSON.stringify(
      scoringResults.map((result) => ({
        recommendationId: result.recommendationId,
        fitScore: result.fitScore,
        feasibilityScore: result.feasibilityScore,
        confidenceScore: result.confidenceScore,
        evidenceCount: result.evidenceCount,
        gatePassed: result.gatePassed,
      })),
    ),
  );
}

async function getCachedResults(prefix: string, key: string): Promise<ScoringResult[] | null> {
  const redis = await getRedisConnection();
  if (!redis) {
    return null;
  }

  const cached = await redis.get(`${prefix}:${key}`);
  if (!cached) {
    return null;
  }

  try {
    return JSON.parse(cached) as ScoringResult[];
  } catch {
    return null;
  }
}

async function setCachedResults(prefix: string, key: string, value: ScoringResult[]): Promise<void> {
  const redis = await getRedisConnection();
  if (!redis) {
    return;
  }

  await redis.set(`${prefix}:${key}`, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
}

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
    const cacheKey = buildScoreCacheKey(input);
    const cached = await getCachedResults(SCORE_CACHE_PREFIX, cacheKey);
    if (cached) {
      return cloneResults(cached);
    }

    const { jobId, job, factories, evidence } = input;
    const results: ScoringResult[] = [];

    for (const factory of factories) {
      const factoryEvidence = evidence[factory.id] || [];

      const componentScores: any = {};
      let missingCount = 0;
      let weightSum = 0;
      let weightedSum = 0;

      for (const key of Object.keys(SCORING_WEIGHTS) as Array<keyof typeof SCORING_WEIGHTS>) {
        const scoringKey = key as keyof typeof SCORING_WEIGHTS;
        const score = this.computeComponentScore(scoringKey, job, factory, factoryEvidence);
        if (score === -1) {
          missingCount += 1;
          componentScores[key as string] = 0;
          continue;
        }
        componentScores[key as string] = Math.max(0, Math.min(100, Math.round(score)));
        const weight = SCORING_WEIGHTS[scoringKey] ?? 0;
        weightedSum += componentScores[key as string] * weight;
        weightSum += weight;
      }

      const baseFit = weightSum > 0 ? weightedSum / weightSum : 0;
      const fitScore = this.applyConfidencePenalty(baseFit, missingCount);

      const capacity = componentScores['capacity_match'] ?? componentScores['CapacityMatch'] ?? 0;
      const logistics = componentScores['geography_and_logistics'] ?? componentScores['GeographyAndLogistics'] ?? 0;
      const feasibilityScore = Math.round(((capacity || 0) + (logistics || 0)) / 2);

      const evidenceConfidence = componentScores['evidence_confidence'] ?? componentScores['EvidenceConfidence'] ?? 0;
      const confidenceScore = this.applyConfidencePenalty(evidenceConfidence, missingCount);

      results.push({
        recommendationId: `${jobId}:${factory.id}`,
        jobId,
        factoryId: factory.id,
        fitScore,
        feasibilityScore,
        confidenceScore,
        componentScores: {
          processMatch: componentScores['process_match'] ?? componentScores['ProcessMatch'] ?? 0,
          materialMatch: componentScores['material_match'] ?? componentScores['MaterialMatch'] ?? 0,
          capacityMatch: componentScores['capacity_match'] ?? componentScores['CapacityMatch'] ?? 0,
          geographyAndLogistics: componentScores['geography_and_logistics'] ?? componentScores['GeographyAndLogistics'] ?? 0,
          marketAccess: componentScores['market_access'] ?? componentScores['MarketAccess'] ?? 0,
          evidenceConfidence: componentScores['evidence_confidence'] ?? componentScores['EvidenceConfidence'] ?? 0,
        },
        evidenceCount: factoryEvidence.length,
        confidencePenalty: Math.round(CONFIDENCE_PENALTY_FACTOR * missingCount * 100) / 100,
        gatePassed: true,
        rank: -1,
      });
    }

    await setCachedResults(SCORE_CACHE_PREFIX, cacheKey, cloneResults(results));
    return results;
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
    if (!Array.isArray(scoringResults) || scoringResults.length === 0) return [];

    const cacheKey = buildRankCacheKey(scoringResults);
    const cached = await getCachedResults(RANK_CACHE_PREFIX, cacheKey);
    if (cached) {
      return cloneResults(cached);
    }

    // Determine gate pass for each result (assume draft stage by default)
    const annotated = scoringResults.map(r => {
      const gatePassed = this.checkGateRules(r, 'draft');
      const gateFaiureReason = gatePassed ? undefined : 'Gate rules not satisfied for draft stage';
      return { ...r, gatePassed, gateFaiureReason } as ScoringResult & { gateFaiureReason?: string };
    });

    // Sort: gatePassed first, then fitScore desc, then confidence desc
    annotated.sort((a, b) => {
      if ((a.gatePassed ? 1 : 0) !== (b.gatePassed ? 1 : 0)) return (b.gatePassed ? 1 : 0) - (a.gatePassed ? 1 : 0);
      if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
      return b.confidenceScore - a.confidenceScore;
    });

    const topN = 5;
    let rank = 1;
    for (const res of annotated) {
      if (res.gatePassed) {
        res.rank = rank++;
      } else {
        res.rank = -1;
      }
    }

    const ranked = annotated.slice(0, topN).map(r => ({ ...r } as ScoringResult));
    await setCachedResults(RANK_CACHE_PREFIX, cacheKey, cloneResults(ranked));
    return ranked;
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
    // Return -1 to indicate missing data for this component
    try {
      switch (component as string) {
        case 'process_match':
          if (!job.process_type || !factory.capabilities) return -1;
          return factory.capabilities.some((capability: { process: string }) => capability.process === job.process_type) ? 100 : 0;
        case 'material_match':
          if (!job.material_type || !factory.materials) return -1;
          return factory.materials.includes(job.material_type) ? 100 : 0;
        case 'capacity_match':
          if (!job.volume_band || !factory.capacity_band) return -1;
          return job.volume_band === factory.capacity_band ? 100 : 50;
        case 'geography_and_logistics':
          if (!job.location || !factory.locations) return -1;
          // Simple geography heuristic: same country -> 100, else 50
          const sameCountry = factory.locations.some((location: { country: string }) => location.country === job.location.country);
          return sameCountry ? 100 : 50;
        case 'market_access':
          // Market access heuristic: active factories score higher
          return factory.active ? 80 : 20;
        case 'evidence_confidence':
          if (!evidence || evidence.length === 0) return 0;
          const avg = evidence.reduce((s, e) => s + (e.confidence || 0), 0) / evidence.length;
          return Math.round(avg);
        default:
          return -1;
      }
    } catch (err) {
      return -1;
    }
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
    const adjusted = Math.round(baseScore * (1 - CONFIDENCE_PENALTY_FACTOR * missingComponentCount));
    return Math.max(0, Math.min(100, adjusted));
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
    if (!result) return false;
    const rules = RECOMMENDATION_GATE_RULES as any;
    if (rules.minEvidenceItemsRequired) {
      if ((result.evidenceCount || 0) < rules.minEvidenceItemsRequired) return false;
    }
    const minConfidence = stage === 'final' ? rules.minConfidenceForFinal : rules.minConfidenceToShow;
    if ((result.confidenceScore || 0) < minConfidence) return false;
    return true;
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
