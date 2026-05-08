// Recommendation domain types matching DFN_LLD.md canonical schema

export interface EvidenceItem {
  id: string;
  source_type: 'survey' | 'file' | 'database' | 'external_feed';
  source_ref: string;
  claim: string;
  confidence: number; // 0-100
  created_at: Date;
}

export interface Recommendation {
  id: string;
  job_id: string;
  factory_id: string;
  fit_score: number; // 0-100, primary score
  feasibility_score: number; // 0-100, supporting score
  confidence_score: number; // 0-100, how trusted the result is
  rank: number;
  evidence: EvidenceItem[];
  caveats: string[];
  generated_at: Date;
  version: number;
}

export interface ScoringInput {
  job_id: string;
  factory_id: string;
  evidence: EvidenceItem[];
  market_context?: Record<string, unknown>;
  logistics_context?: Record<string, unknown>;
  site_context?: Record<string, unknown>;
}

export interface RecommendationBrief {
  recommendation: Recommendation;
  summary: string;
  next_steps: string[];
  explainer?: string;
}
