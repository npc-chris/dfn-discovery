/**
 * Manufacturing Strategy, Feasibility & Tolerance Domain Types
 * Standards: DIN ISO 2768-1/2 & DFN Multi-Process Feasibility Architecture
 * Subsystem: SUB-10 (API Contracts & Data Parity)
 */

export type ToleranceClass = 'f' | 'm' | 'c' | 'v';

export interface LinearToleranceRange {
  min_dim: number;
  max_dim: number;
  fine: number;
  medium: number;
  coarse: number;
  very_coarse: number;
}

export interface AngularToleranceRange {
  min_length_mm: number;
  max_length_mm: number;
  fine_arcmin: number;
  medium_arcmin: number;
  coarse_arcmin: number;
  very_coarse_arcmin: number;
}

export interface ToleranceFitEvaluation {
  nominal_dim_mm: number;
  tolerance_mm: number;
  iso_standard_allowance_mm: number;
  is_within_iso: boolean;
  is_tighter_than_iso: boolean;
  precision_ratio: number;
  target_class: ToleranceClass;
  classification:
    | 'precision_ground_or_lapped'
    | 'tight_machined'
    | 'standard_iso_match'
    | 'loose_commercial';
}

export interface ManifestToleranceProfile {
  total_features_evaluated: number;
  tightest_tolerance_mm: number;
  critical_fit_count: number;
  target_class: ToleranceClass;
  fits: ToleranceFitEvaluation[];
}

export interface ManufacturingStrategyDefinition {
  strategy_code: string;
  name: string;
  process_category: 'cnc_machining' | 'sheet_metal' | 'casting' | 'additive';
  min_tolerance_class: ToleranceClass;
  supported_materials: string[];
  typical_lead_days: { min: number; max: number };
  primary_clusters: string[];
  active: boolean;
}

export interface ClusterWorkshopProfile {
  id: string;
  factory_id: string;
  cluster_zone: string;
  has_backup_power: boolean;
  cnc_axis_max: number;
  metrology_gate_verified: boolean;
  active_machines: number;
}

export interface FeasibilityEvaluationResult {
  job_id: string;
  strategy_code: string;
  machinability_score: number;
  tolerance_class: ToleranceClass;
  precision_ratio: number;
  is_feasible: boolean;
  cluster_routing_recommended: string;
}
