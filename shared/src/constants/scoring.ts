// Scoring constants and rules matching DFN_LLD.md

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

export enum ScoringComponent {
  ProcessMatch = 'process_match',
  MaterialMatch = 'material_match',
  CapacityMatch = 'capacity_match',
  GeographyAndLogistics = 'geography_and_logistics',
  MarketAccess = 'market_access',
  EvidenceConfidence = 'evidence_confidence',
}

export const SCORING_WEIGHTS: Record<ScoringComponent, number> = {
  [ScoringComponent.ProcessMatch]: 0.25,
  [ScoringComponent.MaterialMatch]: 0.20,
  [ScoringComponent.CapacityMatch]: 0.15,
  [ScoringComponent.GeographyAndLogistics]: 0.20,
  [ScoringComponent.MarketAccess]: 0.10,
  [ScoringComponent.EvidenceConfidence]: 0.10,
};

export const CONFIDENCE_PENALTY_FACTOR = 0.15; // Reduce score by 15% per missing component

export const RECOMMENDATION_GATE_RULES = {
  minFactoriesRequired: 1,
  minEvidenceItemsRequired: 1,
  minConfidenceToShow: 30, // Can show tentative recommendations below this
  minConfidenceForFinal: 60, // Requires higher confidence for final recommendation
};

export const QUEUE_JOB_TYPES = [
  'classify-job',
  'extract-evidence',
  'score-fit',
  'enrich-logistics',
  'refresh-market-signals',
  'refresh-site-brief',
  'generate-recommendation-brief',
] as const;
