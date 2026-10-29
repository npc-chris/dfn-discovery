/**
 * Multi-Stage Process Routing & Manufacturing DAG Engine
 *
 * Implements the Directed Acyclic Graph (DAG) orchestration engine specified in
 * docs/DFN_MULTI_STAGE_PROCESS_ROUTING.md.
 *
 * Responsibilities:
 * - Ingest and decompose manufacturing jobs into DAG stages (V) and WIP transit edges (E)
 * - Stage-by-Stage multi-criteria factory capability scoring (Kinematics, Metallurgy, Tolerancing, SDOs)
 * - Inter-facility Work-In-Progress (WIP) logistics and environmental degradation modeling
 * - Non-compensatory Weighted Geometric Mean composite chain scoring (S_chain)
 * - Cumulative Total Landed Cost (TLC) and Lead Time accumulation
 * - Multi-factory cluster supply chain optimization
 */

import type {
  Job,
  JobInput,
  Factory,
  ProcessStageNode,
  StageTransitionEdge,
  ManufacturingDAG,
  BillOfProcess,
  BopOperation,
  StageRoutingRecommendation,
  EdgeLogisticsBreakdown,
  ClusterChainRecommendation,
} from '@dfn/shared';

// Distance calculation helpers between Nigerian locations
const NIGERIA_COORDINATES: Record<string, { lat: number; lng: number }> = {
  ikeja: { lat: 6.6018, lng: 3.3515 },
  lagos: { lat: 6.5244, lng: 3.3792 },
  agbara: { lat: 6.5167, lng: 3.1167 },
  oshodi: { lat: 6.5333, lng: 3.3167 },
  abeokuta: { lat: 7.1557, lng: 3.3451 },
  ibadan: { lat: 7.3775, lng: 3.947 },
  kano: { lat: 12.0022, lng: 8.592 },
  abuja: { lat: 9.0765, lng: 7.3986 },
  'port harcourt': { lat: 4.8156, lng: 7.0498 },
  nnewi: { lat: 6.0199, lng: 6.9149 },
  aba: { lat: 5.1066, lng: 7.3667 },
  benin: { lat: 6.335, lng: 5.6037 },
  enugu: { lat: 6.4584, lng: 7.5464 },
  kaduna: { lat: 10.5105, lng: 7.4165 },
};

function getApproxCoords(loc: any): { lat: number; lng: number } {
  if (loc && typeof loc === 'object') {
    if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      return { lat: loc.latitude, lng: loc.longitude };
    }
    const stateStr = (loc.state || loc.region || loc.address || '').toLowerCase().trim();
    const lgaStr = (loc.lga || '').toLowerCase().trim();
    if (lgaStr && NIGERIA_COORDINATES[lgaStr]) return NIGERIA_COORDINATES[lgaStr];
    if (stateStr && NIGERIA_COORDINATES[stateStr]) return NIGERIA_COORDINATES[stateStr];
  }
  return { lat: 6.5244, lng: 3.3792 }; // Default Lagos
}

function calculateHaversineKm(
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number },
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLon = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightDist = R * c;
  // Account for Nigerian road network circuity factor (~1.35x straight line)
  return Math.round(straightDist * 1.35);
}

/**
 * Stage Criticality Weight Calibrator (§4.2)
 */
export function getCriticalityWeightForProcess(processId: string): number {
  const p = (processId || '').toLowerCase();
  if (
    p.includes('5-axis') ||
    p.includes('5_axis') ||
    p.includes('cnc_milling') ||
    p.includes('subtractive') ||
    p.includes('edm') ||
    p.includes('grinding')
  ) {
    return 2.0; // High-precision machining
  }
  if (
    p.includes('heat_treat') ||
    p.includes('metallurgy') ||
    p.includes('vacuum') ||
    p.includes('quenching') ||
    p.includes('annealing')
  ) {
    return 1.5; // Thermal bulk metallurgy
  }
  if (
    p.includes('anodiz') ||
    p.includes('plating') ||
    p.includes('passivation') ||
    p.includes('coating') ||
    p.includes('surface')
  ) {
    return 1.2; // Surface engineering
  }
  if (
    p.includes('raw') ||
    p.includes('billet') ||
    p.includes('substrate') ||
    p.includes('stock') ||
    p.includes('saw') ||
    p.includes('casting')
  ) {
    return 1.0; // Raw stock prep
  }
  if (p.includes('cmm') || p.includes('ndt') || p.includes('inspection') || p.includes('audit')) {
    return 1.1; // Gatekeeper inspection
  }
  return 1.0;
}

/**
 * Extract or build a valid Manufacturing DAG from job data
 * Supports:
 * 1. Explicit DAG payload (job.dag)
 * 2. Bill of Process payload (job.bop or job.metadata.bop or job.metadata.prism_analysis.bop)
 * 3. Fallback baseline single-node DAG (from job.process_type)
 */
export function extractOrBuildDAG(job: Job | JobInput | any): ManufacturingDAG {
  // 1. If explicit DAG is present and valid
  if (job.dag && Array.isArray(job.dag.stages) && job.dag.stages.length > 0) {
    return {
      id: job.dag.id || `dag-${job.id || 'new'}`,
      job_id: job.id,
      title: job.dag.title || job.product_name || 'Manufacturing Process DAG',
      stages: job.dag.stages.map((stage: any, idx: number) => ({
        id: stage.id || `stage-${idx + 1}`,
        op_number: stage.op_number ?? idx + 1,
        process_id: stage.process_id || 'machining',
        title: stage.title || `Stage ${idx + 1}: ${stage.process_id}`,
        description: stage.description || '',
        machine_class: stage.machine_class || '',
        kinematics: stage.kinematics || {},
        material_family: stage.material_family || job.material_type || '',
        alloy_grade: stage.alloy_grade || '',
        tolerance_class: stage.tolerance_class || '',
        compliance_standards: stage.compliance_standards || [],
        estimated_cycle_time_min: stage.estimated_cycle_time_min ?? 60,
        setup_hours: stage.setup_hours ?? 1.5,
        tooling_cost_ngn: stage.tooling_cost_ngn ?? 50000,
        direct_stage_cost_ngn: stage.direct_stage_cost_ngn ?? 250000,
        criticality_weight: stage.criticality_weight ?? getCriticalityWeightForProcess(stage.process_id),
      })),
      edges: Array.isArray(job.dag.edges) ? job.dag.edges : [],
    };
  }

  // 2. Extract from Bill of Process (BOP)
  const bopData: BillOfProcess | undefined =
    job.bop ||
    job.metadata?.bop ||
    job.metadata?.prism_analysis?.bop ||
    job.metadata?.prism_manifest?.bop;

  if (bopData && Array.isArray(bopData.operations) && bopData.operations.length > 0) {
    const stages: ProcessStageNode[] = bopData.operations.map((op: BopOperation, idx: number) => {
      const stageId = `stage-${op.op_number || idx + 1}`;
      const procId = op.process_id || 'machining';
      return {
        id: stageId,
        op_number: op.op_number || idx + 1,
        process_id: procId,
        title: op.title || op.description || `Stage ${op.op_number || idx + 1}: ${procId}`,
        description: op.description || op.setup_description || '',
        machine_class: op.machine_type || '',
        material_family: job.material_type || '',
        alloy_grade: job.metadata?.alloy_grade || '',
        tolerance_class: op.tolerances?.linear || '',
        compliance_standards: op.standards || [],
        estimated_cycle_time_min: op.estimated_cycle_time_min || 45,
        setup_hours: 1.5,
        tooling_cost_ngn: 50000,
        direct_stage_cost_ngn: 250000,
        criticality_weight: op.criticality_weight || getCriticalityWeightForProcess(procId),
      };
    });

    // Build sequential edges between stages
    const edges: StageTransitionEdge[] = [];
    for (let i = 0; i < stages.length - 1; i++) {
      const fromStage = stages[i];
      const toStage = stages[i + 1];
      const requiresVci =
        fromStage.process_id.includes('milling') ||
        fromStage.process_id.includes('machin') ||
        toStage.process_id.includes('heat') ||
        toStage.process_id.includes('anodiz');

      edges.push({
        id: `edge-${fromStage.id}-${toStage.id}`,
        from_stage_id: fromStage.id,
        to_stage_id: toStage.id,
        transit_mode: 'road',
        requires_vci_preservation: requiresVci,
        max_queue_time_hours: 48,
        material_sensitivity: (job.material_type || '').toLowerCase().includes('steel') ? 0.08 : 0.04,
        fragility_factor: 1.0,
      });
    }

    return {
      id: `dag-${job.id || 'bop'}`,
      job_id: job.id,
      title: job.product_name ? `${job.product_name} Process DAG` : 'Multi-Stage Process DAG',
      stages,
      edges,
    };
  }

  // 3. Fallback Synthetic 1-Node DAG (Guarantees backward compatibility with flat jobs)
  const defaultProcess = job.process_type || 'general_fabrication';
  const defaultStage: ProcessStageNode = {
    id: 'stage-1',
    op_number: 1,
    process_id: defaultProcess,
    title: job.product_name ? `${job.product_name} (${defaultProcess})` : `Primary Process: ${defaultProcess}`,
    description: `End-to-end processing for ${job.product_name || 'part'}`,
    machine_class: defaultProcess,
    material_family: job.material_type || 'aluminum_6061',
    compliance_standards: ['ISO 9001', 'NIS 102'],
    estimated_cycle_time_min: 60,
    setup_hours: 2.0,
    tooling_cost_ngn: 75000,
    direct_stage_cost_ngn: job.target_price_max || 500000,
    criticality_weight: getCriticalityWeightForProcess(defaultProcess),
  };

  return {
    id: `dag-${job.id || 'single'}`,
    job_id: job.id,
    title: `${job.company_name || 'Job'} Process DAG`,
    stages: [defaultStage],
    edges: [],
  };
}

/**
 * Evaluate Individual Stage Fit for a Candidate Factory (§4.2)
 * S_stage,i = (alpha1*C_proc + alpha2*C_mat + alpha3*C_tol + alpha4*C_comp) * (1 - lambda * N_missing)
 */
export function evaluateStageFit(
  stage: ProcessStageNode,
  factory: Factory | any,
  missingEvidenceCount = 0,
): {
  stageFitScore: number;
  componentScores: {
    processMatch: number;
    materialMatch: number;
    toleranceMatch: number;
    complianceMatch: number;
  };
  standardsAligned: string[];
} {
  // 1. Process Match (alpha1 = 0.30)
  const factoryCapabilities = Array.isArray(factory.capabilities?.processes)
    ? factory.capabilities.processes
    : typeof factory.capabilities === 'object' && factory.capabilities !== null
    ? Object.keys(factory.capabilities)
    : [];

  const normalizeStr = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, '');
  const stageProcNorm = normalizeStr(stage.process_id);

  let processScore = 20;
  if (
    factoryCapabilities.some((c: string) => {
      const capNorm = normalizeStr(c);
      return capNorm === stageProcNorm || capNorm.includes(stageProcNorm) || stageProcNorm.includes(capNorm);
    })
  ) {
    processScore = 95;
  } else if (
    (stageProcNorm.includes('cnc') || stageProcNorm.includes('milling') || stageProcNorm.includes('machin')) &&
    factoryCapabilities.some((c: string) => {
      const capNorm = normalizeStr(c);
      return capNorm.includes('machin') || capNorm.includes('cnc') || capNorm.includes('milling');
    })
  ) {
    processScore = 90;
  } else if (
    (stageProcNorm.includes('heat') || stageProcNorm.includes('quench') || stageProcNorm.includes('anneal')) &&
    factoryCapabilities.some((c: string) => {
      const capNorm = normalizeStr(c);
      return capNorm.includes('heat') || capNorm.includes('thermal') || capNorm.includes('quench');
    })
  ) {
    processScore = 90;
  } else if (
    (stageProcNorm.includes('anodiz') || stageProcNorm.includes('coat') || stageProcNorm.includes('plat')) &&
    factoryCapabilities.some((c: string) => {
      const capNorm = normalizeStr(c);
      return capNorm.includes('anodiz') || capNorm.includes('coat') || capNorm.includes('plat') || capNorm.includes('surface');
    })
  ) {
    processScore = 90;
  } else if (
    (stageProcNorm.includes('cast') || stageProcNorm.includes('raw') || stageProcNorm.includes('billet') || stageProcNorm.includes('stock')) &&
    factoryCapabilities.some((c: string) => {
      const capNorm = normalizeStr(c);
      return capNorm.includes('cast') || capNorm.includes('raw') || capNorm.includes('foundry') || capNorm.includes('saw');
    })
  ) {
    processScore = 90;
  }


  // 2. Material Match (alpha2 = 0.25)
  const factoryMaterials: string[] = Array.isArray(factory.materials) ? factory.materials : [];
  const stageMat = (stage.material_family || stage.alloy_grade || '').toLowerCase();
  let materialScore = 60;
  if (
    factoryMaterials.some((m: string) => {
      const mat = m.toLowerCase();
      return mat.includes(stageMat) || stageMat.includes(mat);
    })
  ) {
    materialScore = 92;
  } else if (factoryMaterials.length > 0) {
    materialScore = 80;
  }

  // 3. Tolerance Match (alpha3 = 0.25)
  let toleranceScore = 85;
  if (factory.verified_sources && factory.verified_sources.length > 0) {
    toleranceScore = 94;
  }

  // 4. Compliance & SDO Standards (alpha4 = 0.20)
  const standardsAligned: string[] = [];
  let complianceScore = 70;
  if (Array.isArray(stage.compliance_standards) && stage.compliance_standards.length > 0) {
    complianceScore = 90;
    standardsAligned.push(...stage.compliance_standards);
  } else {
    standardsAligned.push('ISO 9001', 'NIS Standard');
    complianceScore = 85;
  }

  // Weighted sum
  const weightedBase =
    0.3 * processScore + 0.25 * materialScore + 0.25 * toleranceScore + 0.2 * complianceScore;

  // Apply missing evidence penalty (lambda = 0.15)
  const penaltyFactor = Math.max(0, 1 - 0.15 * missingEvidenceCount);
  const stageFitScore = Math.max(0, Math.min(100, Math.round(weightedBase * penaltyFactor)));

  return {
    stageFitScore,
    componentScores: {
      processMatch: Math.round(processScore),
      materialMatch: Math.round(materialScore),
      toleranceMatch: Math.round(toleranceScore),
      complianceMatch: Math.round(complianceScore),
    },
    standardsAligned,
  };
}

/**
 * Evaluate Intermediate Inter-Fab Edge Logistics Friction (§4.2)
 * P_logistics,j = min(0.35, P_dist + P_rough + P_degrade + P_delay)
 */
export function evaluateEdgeLogistics(
  edge: StageTransitionEdge,
  fromFactory: Factory | any,
  toFactory: Factory | any,
): EdgeLogisticsBreakdown {
  const isSameFactory = fromFactory.id === toFactory.id;

  if (isSameFactory) {
    return {
      edge_id: edge.id,
      from_stage_id: edge.from_stage_id,
      to_stage_id: edge.to_stage_id,
      from_factory_name: fromFactory.factory_name || fromFactory.name || 'Factory A',
      to_factory_name: toFactory.factory_name || toFactory.name || 'Factory A',
      distance_km: 0,
      transit_hours: 0,
      freight_cost_ngn: 0,
      preservation_cost_ngn: 0,
      preservation_applied: false,
      roughness_friction: 0,
      oxidation_friction: 0,
      delay_friction: 0,
      distance_friction: 0,
      total_edge_friction: 0,
    };
  }

  // Inter-facility transit
  const fromLoc = Array.isArray(fromFactory.locations) ? fromFactory.locations[0] : fromFactory.location;
  const toLoc = Array.isArray(toFactory.locations) ? toFactory.locations[0] : toFactory.location;

  const coord1 = getApproxCoords(fromLoc);
  const coord2 = getApproxCoords(toLoc);
  const distanceKm = edge.estimated_distance_km || calculateHaversineKm(coord1, coord2);

  // 1. Distance & Corridor Impedance: P_dist = min(0.12, (d / 300) * 0.08)
  const distanceFriction = Math.min(0.12, (distanceKm / 300) * 0.08);

  // 2. Road Roughness & Vibration: P_rough = 0.05 * f_unpaved * chi_fragility
  const unpavedFraction = 0.1; // Baseline Nigeria inter-industrial link
  const fragility = edge.fragility_factor || 1.0;
  const roughnessFriction = Math.min(0.08, 0.05 * unpavedFraction * fragility);

  // 3. Environmental Degradation / Oxidation: P_degrade = mu * (t_transit / T_MQT) * (1 - delta)
  const transitHours = Math.max(1, Math.round(distanceKm / 35)); // Average 35 km/h transit in Nigerian freight corridors
  const mqtHours = edge.max_queue_time_hours || 48;
  const muMaterial = edge.material_sensitivity || 0.04;
  const preservationApplied = edge.requires_vci_preservation ?? true;
  const deltaPreservation = preservationApplied ? 0.85 : 0.0;
  const oxidationFriction = Math.min(
    0.1,
    muMaterial * (transitHours / mqtHours) * (1 - deltaPreservation),
  );

  // 4. Corridor Delay & Checkpoints: P_delay
  const delayFriction = distanceKm > 100 ? 0.015 : 0.005;

  // Composite edge friction capped at 0.35 (35%)
  const totalEdgeFriction = Math.min(
    0.35,
    distanceFriction + roughnessFriction + oxidationFriction + delayFriction,
  );

  // Costs
  const freightCostNgn = Math.round(15000 + distanceKm * 400);
  const preservationCostNgn = preservationApplied ? 25000 : 0;

  return {
    edge_id: edge.id,
    from_stage_id: edge.from_stage_id,
    to_stage_id: edge.to_stage_id,
    from_factory_name: fromFactory.factory_name || fromFactory.name || 'Factory A',
    to_factory_name: toFactory.factory_name || toFactory.name || 'Factory B',
    distance_km: distanceKm,
    transit_hours: transitHours,
    freight_cost_ngn: freightCostNgn,
    preservation_cost_ngn: preservationCostNgn,
    preservation_applied: preservationApplied,
    roughness_friction: Math.round(roughnessFriction * 1000) / 1000,
    oxidation_friction: Math.round(oxidationFriction * 1000) / 1000,
    delay_friction: Math.round(delayFriction * 1000) / 1000,
    distance_friction: Math.round(distanceFriction * 1000) / 1000,
    total_edge_friction: Math.round(totalEdgeFriction * 1000) / 1000,
  };
}

/**
 * Compute Composite Headline Chain Score (§4.2)
 * Non-compensatory Weighted Geometric Mean with Logistics Friction Attenuation:
 * S_chain = (prod S_stage,i ^ w_i) ^ (1 / sum w_i) * (1 - sum P_logistics,j)
 */
export function computeCompositeChainScore(
  stageScores: number[],
  weights: number[],
  edgeFrictions: number[] = [],
): {
  compositeChainScore: number;
  stageGeometricMeanScore: number;
  totalLogisticsFriction: number;
} {
  if (stageScores.length === 0) {
    return { compositeChainScore: 0, stageGeometricMeanScore: 0, totalLogisticsFriction: 0 };
  }

  // If any stage has 0 score, geometric mean is non-compensatory 0
  if (stageScores.some((s) => s <= 0)) {
    return { compositeChainScore: 0, stageGeometricMeanScore: 0, totalLogisticsFriction: 0 };
  }

  let totalWeight = 0;
  let weightedLogSum = 0;

  // Bound iterations to a constant upper limit to protect against loop bound injection (CWE-400 / CWE-770)
  const MAX_STAGES = 50;
  const stageCount = Math.min(stageScores.length, MAX_STAGES);

  for (let i = 0; i < stageCount; i++) {
    const score = Math.max(1, stageScores[i]);
    const weight = weights[i] ?? 1.0;
    totalWeight += weight;
    weightedLogSum += weight * Math.log(score);
  }

  const logGeometricMean = totalWeight > 0 ? weightedLogSum / totalWeight : 0;
  const stageGeometricMeanScore = Math.exp(logGeometricMean);

  // Sum intermediate edge logistics friction
  const rawLogisticsFriction = edgeFrictions.reduce((acc, f) => acc + f, 0);
  const totalLogisticsFriction = Math.min(0.35, Math.round(rawLogisticsFriction * 1000) / 1000);

  // Apply spatial impedance factor
  const compositeChainScore = Math.max(
    0,
    Math.min(100, Math.round(stageGeometricMeanScore * (1 - totalLogisticsFriction))),
  );

  return {
    compositeChainScore,
    stageGeometricMeanScore: Math.round(stageGeometricMeanScore * 100) / 100,
    totalLogisticsFriction,
  };
}

/**
 * Calculate Total Landed Cost (TLC) & Accumulated Lead Time (§5)
 */
export function calculateTotalLandedCost(
  stages: ProcessStageNode[],
  edges: EdgeLogisticsBreakdown[],
  quantity = 100,
): {
  totalLandedCostNgn: number;
  directMachiningCostNgn: number;
  toolingCostNgn: number;
  freightCostNgn: number;
  preservationCostNgn: number;
  totalLeadDays: number;
  totalDistanceKm: number;
} {
  let directMachiningCostNgn = 0;
  let toolingCostNgn = 0;
  let totalStageLeadDays = 0;

  const boundedStages = stages.slice(0, 50);
  for (const stage of boundedStages) {
    const stageCost = stage.direct_stage_cost_ngn || 200000;
    directMachiningCostNgn += stageCost;
    toolingCostNgn += stage.tooling_cost_ngn || 25000;
    const cycleMin = (stage.estimated_cycle_time_min || 30) * quantity;
    const cycleDays = Math.max(1, Math.ceil(cycleMin / (8 * 60)));
    totalStageLeadDays += cycleDays + (stage.setup_hours ? Math.ceil(stage.setup_hours / 8) : 1);
  }

  let freightCostNgn = 0;
  let preservationCostNgn = 0;
  let transitDays = 0;
  let totalDistanceKm = 0;

  const boundedEdges = edges.slice(0, 100);
  for (const edge of boundedEdges) {
    freightCostNgn += edge.freight_cost_ngn;
    preservationCostNgn += edge.preservation_cost_ngn;
    totalDistanceKm += edge.distance_km;
    if (edge.distance_km > 0) {
      transitDays += Math.max(1, Math.ceil(edge.transit_hours / 24));
    }
  }

  // Statistical scrap/buffer cost: 3% of direct costs
  const scrapBufferNgn = Math.round((directMachiningCostNgn + toolingCostNgn) * 0.03);

  const totalLandedCostNgn =
    directMachiningCostNgn + toolingCostNgn + freightCostNgn + preservationCostNgn + scrapBufferNgn;

  const totalLeadDays = totalStageLeadDays + transitDays;

  return {
    totalLandedCostNgn,
    directMachiningCostNgn,
    toolingCostNgn,
    freightCostNgn,
    preservationCostNgn,
    totalLeadDays,
    totalDistanceKm,
  };
}

/**
 * Route Manufacturing DAG across candidate factories
 * Computes optimal cluster chains and generates dual-tier recommendations
 */
export async function routeManufacturingDAG(
  job: Job | JobInput | any,
  factories: Factory[] | any[],
): Promise<{
  dag: ManufacturingDAG;
  recommendations: ClusterChainRecommendation[];
}> {
  const dag = extractOrBuildDAG(job);
  const stages = dag.stages;
  const edges = dag.edges;

  if (factories.length === 0 || stages.length === 0) {
    return { dag, recommendations: [] };
  }

  // 1. Evaluate each stage against all candidate factories
  const stageFactoryEvaluations = stages.map((stage) => {
    return factories.map((factory) => {
      const evalResult = evaluateStageFit(stage, factory);
      const stageLeadDays = Math.max(
        1,
        Math.ceil(((stage.estimated_cycle_time_min || 30) * 100) / (8 * 60)),
      );
      return {
        stageId: stage.id,
        factory,
        stageFitScore: evalResult.stageFitScore,
        criticalityWeight: stage.criticality_weight || 1.0,
        directStageCostNgn: stage.direct_stage_cost_ngn || 200000,
        estimatedLeadDays: stageLeadDays,
        componentScores: evalResult.componentScores,
        standardsAligned: evalResult.standardsAligned,
      };
    });
  });

  // 2. Select top candidate factory combinations
  // Strategy: For each stage, pick the highest-scoring candidate factory (Best-in-Class Cluster Chain)
  // and construct alternative combinations (e.g. all-in-one single facility vs specialized cluster)
  const candidateChains: Array<{ assignedFactories: Factory[] }> = [];

  // Chain A: Best fit per stage (Specialized Multi-Factory Cluster)
  const bestClusterFactories = stageFactoryEvaluations.map((evals) => {
    const sorted = [...evals].sort((a, b) => b.stageFitScore - a.stageFitScore);
    return sorted[0].factory;
  });
  candidateChains.push({ assignedFactories: bestClusterFactories });

  // Chain B: Best single factory across all stages (Integrated Single-Fab Chain)
  if (factories.length > 1) {
    const factoryAverageScores = factories.map((factory) => {
      let scoreSum = 0;
      for (const evals of stageFactoryEvaluations) {
        const match = evals.find((e) => e.factory.id === factory.id);
        scoreSum += match?.stageFitScore || 0;
      }
      return { factory, avgScore: scoreSum / stages.length };
    });
    factoryAverageScores.sort((a, b) => b.avgScore - a.avgScore);
    const bestSingleFactory = factoryAverageScores[0].factory;
    candidateChains.push({
      assignedFactories: stages.map(() => bestSingleFactory),
    });
  }

  // 3. Score each candidate chain
  const rankedChains: ClusterChainRecommendation[] = [];

  for (let cIdx = 0; cIdx < candidateChains.length; cIdx++) {
    const { assignedFactories } = candidateChains[cIdx];

    // Compute stage results
    const stageRecommendations: StageRoutingRecommendation[] = [];
    const stageScores: number[] = [];
    const stageWeights: number[] = [];

    for (let sIdx = 0; sIdx < stages.length; sIdx++) {
      const stage = stages[sIdx];
      const factory = assignedFactories[sIdx];
      const evalMatch = stageFactoryEvaluations[sIdx].find((e) => e.factory.id === factory.id);

      const fitScore = evalMatch?.stageFitScore ?? 75;
      const weight = stage.criticality_weight ?? 1.0;

      stageScores.push(fitScore);
      stageWeights.push(weight);

      const locStr = Array.isArray(factory.locations)
        ? factory.locations[0]?.state || 'Nigeria'
        : factory.location?.state || 'Nigeria';

      stageRecommendations.push({
        stage_id: stage.id,
        op_number: stage.op_number,
        operation_name: stage.title,
        process_id: stage.process_id,
        factory_id: factory.id,
        factory_name: factory.factory_name || factory.name || 'Factory',
        factory_location: locStr,
        stage_fit_score: fitScore,
        criticality_weight: weight,
        direct_stage_cost_ngn: stage.direct_stage_cost_ngn || 200000,
        estimated_lead_days: evalMatch?.estimatedLeadDays || 3,
        missing_evidence_count: 0,
        component_scores: {
          process_match: evalMatch?.componentScores.processMatch || 80,
          material_match: evalMatch?.componentScores.materialMatch || 80,
          tolerance_match: evalMatch?.componentScores.toleranceMatch || 80,
          compliance_match: evalMatch?.componentScores.complianceMatch || 80,
        },
        standards_aligned: evalMatch?.standardsAligned || ['ISO 9001'],
      });
    }

    // Compute edge logistics breakdowns
    const edgeBreakdowns: EdgeLogisticsBreakdown[] = [];
    const edgeFrictions: number[] = [];

    for (let eIdx = 0; eIdx < edges.length; eIdx++) {
      const edge = edges[eIdx];
      const fromFactory = assignedFactories[eIdx];
      const toFactory = assignedFactories[eIdx + 1];

      const edgeLogistics = evaluateEdgeLogistics(edge, fromFactory, toFactory);
      edgeBreakdowns.push(edgeLogistics);
      edgeFrictions.push(edgeLogistics.total_edge_friction);
    }

    // Compute Composite Headline Score (Weighted Geometric Mean)
    const scoreResult = computeCompositeChainScore(stageScores, stageWeights, edgeFrictions);

    // Compute Total Landed Cost (TLC)
    const tlcResult = calculateTotalLandedCost(stages, edgeBreakdowns, 100);

    rankedChains.push({
      id: `cluster-rec-${cIdx + 1}`,
      job_id: job.id || 'job-new',
      rank: cIdx + 1,
      composite_chain_score: scoreResult.compositeChainScore,
      stage_geometric_mean_score: scoreResult.stageGeometricMeanScore,
      total_logistics_friction: scoreResult.totalLogisticsFriction,
      total_landed_cost_ngn: tlcResult.totalLandedCostNgn,
      total_lead_time_days: tlcResult.totalLeadDays,
      total_inter_fab_distance_km: tlcResult.totalDistanceKm,
      stages: stageRecommendations,
      edges: edgeBreakdowns,
      generated_at: new Date(),
    });
  }

  // Sort by composite chain score descending
  rankedChains.sort((a, b) => b.composite_chain_score - a.composite_chain_score);
  rankedChains.forEach((c, idx) => {
    c.rank = idx + 1;
  });

  return {
    dag,
    recommendations: rankedChains,
  };
}
