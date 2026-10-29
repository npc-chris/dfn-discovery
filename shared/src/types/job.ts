// Job domain types matching DFN_LLD.md canonical schema and DFN_MULTI_STAGE_PROCESS_ROUTING.md

export enum JobStatus {
  Draft = 'draft',
  Submitted = 'submitted',
  Normalized = 'normalized',
  Analyzing = 'analyzing',
  Scored = 'scored',
  Recommended = 'recommended',
  Published = 'published',
  Archived = 'archived',
  ValidationFailed = 'validation_failed',
  AnalysisFailed = 'analysis_failed',
  ScoringFailed = 'scoring_failed',
  StaleData = 'stale_data',
}

export interface Location {
  latitude?: number;
  longitude?: number;
  address?: string;
  country: string;
  region?: string;
  state?: string;
  lga?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: Date;
  source_type: 'form' | 'file' | 'survey';
}

/**
 * Discrete manufacturing process operation node in the DAG
 */
export interface ProcessStageNode {
  id: string;
  op_number: number;
  process_id: string; // e.g. 'cnc_milling', 'heat_treatment', 'anodizing', 'die_casting'
  title: string;
  description?: string;
  machine_class?: string; // e.g. '5-axis CNC', 'Vacuum Furnace', 'Anodizing Tank'
  kinematics?: {
    spindle_speed_rpm?: number;
    spindle_power_kw?: number;
    travel_envelope_mm?: { x: number; y: number; z: number };
    tank_volume_liters?: number;
  };
  material_family?: string;
  alloy_grade?: string; // e.g. '6061-T6', '316L', 'NIS 102'
  tolerance_class?: string; // e.g. '+/- 0.012 mm', 'Ra 0.8um'
  compliance_standards?: string[]; // e.g. ['ISO 9001', 'NIS 102', 'MIL-A-8625']
  estimated_cycle_time_min?: number;
  setup_hours?: number;
  tooling_cost_ngn?: number;
  direct_stage_cost_ngn?: number;
  criticality_weight?: number; // wi (default 1.0, range 0.8 - 2.5)
}

/**
 * Inter-stage Work-In-Progress (WIP) transition edge in the DAG
 */
export interface StageTransitionEdge {
  id: string;
  from_stage_id: string;
  to_stage_id: string;
  transit_mode?: 'road' | 'rail' | 'air' | 'sea' | 'internal';
  requires_vci_preservation?: boolean;
  max_queue_time_hours?: number; // MQT before surface oxidation/degradation
  material_sensitivity?: number; // oxidation factor (e.g., carbon steel 0.08, aluminum 0.04)
  fragility_factor?: number; // chi fragility (0.5 - 2.0)
  estimated_distance_km?: number;
  estimated_transit_hours?: number;
  freight_cost_ngn?: number;
  preservation_cost_ngn?: number;
}

/**
 * Manufacturing Directed Acyclic Graph (DAG) G = (V, E)
 */
export interface ManufacturingDAG {
  id?: string;
  job_id?: string;
  title?: string;
  stages: ProcessStageNode[];
  edges: StageTransitionEdge[];
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Prism-compatible Bill of Process (BOP) structure
 */
export interface BopOperation {
  op_number: number;
  process_id: string;
  title?: string;
  description?: string;
  machine_type?: string;
  setup_description?: string;
  tooling?: string[];
  estimated_cycle_time_min?: number;
  tolerances?: Record<string, any>;
  standards?: string[];
  criticality_weight?: number;
}

export interface BillOfProcess {
  version?: string;
  operations: BopOperation[];
  target_delivery_days?: number;
  notes?: string;
}

export interface Job {
  id: string;
  org_id: string;
  created_by: string;
  project_id?: string;
  batch_id?: string;
  rfq_code?: string;
  company_name: string;
  product_name: string;
  process_type: string;
  material_type: string;
  volume_band: string;
  location: Location;
  delivery_location?: Location;
  target_price_max?: number;
  requirements?: Record<string, unknown>;
  attachments: Attachment[];
  status: JobStatus;
  version: number;
  created_at: Date;
  updated_at: Date;
  metadata?: Record<string, unknown>;
  bop?: BillOfProcess;
  dag?: ManufacturingDAG;
}

export interface JobInput {
  company_name: string;
  product_name: string;
  process_type?: string;
  material_type?: string;
  volume_band?: string;
  location: Location;
  delivery_location?: Location;
  attachments?: File[];
  metadata?: Record<string, unknown>;
  bop?: BillOfProcess;
  dag?: ManufacturingDAG;
  target_ceiling_ngn?: number;
}

