// Recommendation domain types matching DFN_LLD.md canonical schema and DFN_MULTI_STAGE_PROCESS_ROUTING.md

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

/**
 * Stage-by-Stage individual factory match result in a multi-stage process
 */
export interface StageRoutingRecommendation {
  stage_id: string;
  op_number: number;
  operation_name: string;
  process_id: string;
  factory_id: string;
  factory_name: string;
  factory_location: string;
  stage_fit_score: number; // 0-100
  criticality_weight: number;
  direct_stage_cost_ngn: number;
  estimated_lead_days: number;
  missing_evidence_count: number;
  component_scores: {
    process_match: number;
    material_match: number;
    tolerance_match: number;
    compliance_match: number;
  };
  standards_aligned: string[];
}

/**
 * Inter-fab transition edge logistics breakdown
 */
export interface EdgeLogisticsBreakdown {
  edge_id: string;
  from_stage_id: string;
  to_stage_id: string;
  from_factory_name: string;
  to_factory_name: string;
  distance_km: number;
  transit_hours: number;
  freight_cost_ngn: number;
  preservation_cost_ngn: number;
  preservation_applied: boolean;
  roughness_friction: number;
  oxidation_friction: number;
  delay_friction: number;
  distance_friction: number;
  total_edge_friction: number; // P_logistics,j (0 - 0.35)
}

/**
 * Composite multi-facility cluster routing recommendation
 */
export interface ClusterChainRecommendation {
  id: string;
  job_id: string;
  rank: number;
  composite_chain_score: number; // S_chain (0-100)
  stage_geometric_mean_score: number; // S_stages (0-100)
  total_logistics_friction: number; // sum P_logistics,j
  total_landed_cost_ngn: number; // Total Landed Cost in NGN
  total_lead_time_days: number;
  total_inter_fab_distance_km: number;
  stages: StageRoutingRecommendation[];
  edges: EdgeLogisticsBreakdown[];
  generated_at: Date;
}

