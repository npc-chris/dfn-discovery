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

/**
 * Human-readable label for each scoring component.
 * Shared so that any product (Discovery, Prism, etc.) can display
 * consistent terminology when presenting scoring breakdowns.
 *
 * Keys are the camelCase names used in ScoringResult.componentScores
 * (not the snake_case ScoringComponent enum values used internally
 * by computeComponentScore).
 */
export const SCORING_COMPONENT_LABELS: Record<string, string> = {
  processMatch:          'Process Match',
  materialMatch:         'Material Match',
  capacityMatch:         'Capacity Match',
  geographyAndLogistics: 'Geo \u0026 Logistics',
  marketAccess:          'Market Access',
  evidenceConfidence:    'Evidence Confidence',
};

/**
 * Score bands that define how a numeric score maps to a human-readable tier.
 * Thresholds are inclusive lower bounds (score >= threshold).
 * Shared so all products apply the same interpretation of DFN scores.
 */
export const CONFIDENCE_BANDS = {
  /** Confidence score [0, 30) — insufficient evidence. */
  LOW:    { min: 0,  max: 30,  label: 'low'    },
  /** Confidence score [30, 60) — partial evidence. */
  MEDIUM: { min: 30, max: 60,  label: 'medium' },
  /** Confidence score [60, 100] — well-evidenced. */
  HIGH:   { min: 60, max: 100, label: 'high'   },
} as const;

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export const FIT_BANDS = {
  /** Fit score [0, 40) — factory does not meet job requirements. */
  POOR:      { min: 0,  max: 40,  label: 'Poor fit'      },
  /** Fit score [40, 60) — factory partially meets requirements. */
  FAIR:      { min: 40, max: 60,  label: 'Fair fit'      },
  /** Fit score [60, 80) — factory is a solid match. */
  GOOD:      { min: 60, max: 80,  label: 'Good fit'      },
  /** Fit score [80, 100] — factory is the ideal match. */
  EXCELLENT: { min: 80, max: 100, label: 'Excellent fit' },
} as const;

export type FitLevel = 'Poor fit' | 'Fair fit' | 'Good fit' | 'Excellent fit';

export const CONFIDENCE_PENALTY_FACTOR = 0.15; // Reduce score by 15% per missing component

export const RECOMMENDATION_GATE_RULES = {
  minFactoriesRequired: 1,
  minEvidenceItemsRequired: 1,
  minConfidenceToShow: 30,  // Minimum to show tentative recommendation
  minConfidenceForFinal: 60, // Minimum for a final/published recommendation
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
