import { describe, it, expect } from 'vitest';
import {
  extractOrBuildDAG,
  evaluateStageFit,
  evaluateEdgeLogistics,
  computeCompositeChainScore,
  calculateTotalLandedCost,
  routeManufacturingDAG,
} from './dag-routing-service';
import type { Job, Factory } from '@dfn/shared';

describe('Manufacturing DAG & Multi-Stage Routing Engine', () => {
  // Test Factory 1: Foundry in Abeokuta
  const foundryAbeokuta: Factory = {
    id: 'fac-foundry-1',
    org_id: 'test-org',
    factory_name: 'AlumaTech Foundry (Abeokuta)',
    capabilities: { processes: ['raw_stock_prep', 'casting', 'saw_cutting'] },
    materials: ['aluminum_6061', 'aluminum_billet'],
    capacity_band: 'medium',
    locations: [{ state: 'Ogun', lga: 'abeokuta' }],
    verified_sources: ['cac', 'soncap'],
    active: true,
  } as any;

  // Test Factory 2: Precision CNC in Ikeja
  const cncIkeja: Factory = {
    id: 'fac-cnc-2',
    org_id: 'test-org',
    factory_name: 'Precision Dynamics (Ikeja)',
    capabilities: { processes: ['5-axis_cnc_milling', 'cnc_milling', 'machining'] },
    materials: ['aluminum_6061', 'steel_316l'],
    capacity_band: 'high',
    locations: [{ state: 'Lagos', lga: 'ikeja' }],
    verified_sources: ['cac', 'iso_9001'],
    active: true,
  } as any;

  // Test Factory 3: Thermal Treatment in Agbara
  const thermalAgbara: Factory = {
    id: 'fac-thermal-3',
    org_id: 'test-org',
    factory_name: 'ThermalPro Fabs (Agbara)',
    capabilities: { processes: ['vacuum_heat_treatment', 'heat_treat', 'quenching'] },
    materials: ['aluminum_6061', 'alloy_steel'],
    capacity_band: 'medium',
    locations: [{ state: 'Ogun', lga: 'agbara' }],
    verified_sources: ['cac'],
    active: true,
  } as any;

  // Test Factory 4: Anodizing in Oshodi
  const anodizeOshodi: Factory = {
    id: 'fac-anodize-4',
    org_id: 'test-org',
    factory_name: 'SurfaceTech Africa (Oshodi)',
    capabilities: { processes: ['hard_anodize', 'anodizing', 'electroplating'] },
    materials: ['aluminum_6061'],
    capacity_band: 'medium',
    locations: [{ state: 'Lagos', lga: 'oshodi' }],
    verified_sources: ['cac'],
    active: true,
  } as any;

  const candidateFactories = [foundryAbeokuta, cncIkeja, thermalAgbara, anodizeOshodi];

  it('should extract a multi-stage DAG from Prism Bill of Process (BOP)', () => {
    const jobWithBop: Partial<Job> = {
      id: 'job-gearbox-1',
      product_name: 'Precision Gearbox Housing',
      material_type: 'aluminum_6061',
      metadata: {
        bop: {
          version: '1.0',
          operations: [
            {
              op_number: 1,
              process_id: 'raw_stock_prep',
              title: 'Alloy Billet / Stock Prep',
              machine_type: 'Band Saw',
              estimated_cycle_time_min: 20,
            },
            {
              op_number: 2,
              process_id: '5-axis_cnc_milling',
              title: '5-Axis CNC Milling',
              machine_type: 'DMG Mori 5-Axis',
              estimated_cycle_time_min: 90,
            },
            {
              op_number: 3,
              process_id: 'vacuum_heat_treatment',
              title: 'Vacuum Heat Treatment',
              machine_type: 'Vacuum Furnace',
              estimated_cycle_time_min: 120,
            },
            {
              op_number: 4,
              process_id: 'hard_anodize',
              title: 'Type III Hard Anodize',
              machine_type: 'Anodizing Tank',
              estimated_cycle_time_min: 45,
            },
          ],
        },
      },
    };

    const dag = extractOrBuildDAG(jobWithBop);

    expect(dag.stages.length).toBe(4);
    expect(dag.edges.length).toBe(3);

    expect(dag.stages[0].process_id).toBe('raw_stock_prep');
    expect(dag.stages[0].criticality_weight).toBe(1.0);

    expect(dag.stages[1].process_id).toBe('5-axis_cnc_milling');
    expect(dag.stages[1].criticality_weight).toBe(2.0);

    expect(dag.stages[2].process_id).toBe('vacuum_heat_treatment');
    expect(dag.stages[2].criticality_weight).toBe(1.5);

    expect(dag.stages[3].process_id).toBe('hard_anodize');
    expect(dag.stages[3].criticality_weight).toBe(1.2);

    expect(dag.edges[0].from_stage_id).toBe('stage-1');
    expect(dag.edges[0].to_stage_id).toBe('stage-2');
  });

  it('should generate a backwards-compatible 1-stage synthetic DAG for flat legacy jobs', () => {
    const flatJob: Partial<Job> = {
      id: 'job-flat-1',
      product_name: 'Steel Bracket',
      process_type: 'cnc_milling',
      material_type: 'mild_steel',
    };

    const dag = extractOrBuildDAG(flatJob);

    expect(dag.stages.length).toBe(1);
    expect(dag.edges.length).toBe(0);
    expect(dag.stages[0].process_id).toBe('cnc_milling');
    expect(dag.stages[0].criticality_weight).toBe(2.0);
  });

  it('should evaluate individual stage capability fit accurately', () => {
    const stage = {
      id: 'stage-2',
      op_number: 2,
      process_id: '5-axis_cnc_milling',
      title: '5-Axis CNC Milling',
      material_family: 'aluminum_6061',
      compliance_standards: ['ISO 9001', 'NIS 102'],
    };

    // CNC factory should score high on CNC stage
    const match = evaluateStageFit(stage, cncIkeja);
    expect(match.stageFitScore).toBeGreaterThanOrEqual(90);
    expect(match.componentScores.processMatch).toBe(95);
    expect(match.componentScores.materialMatch).toBe(92);

    // Missing evidence reduces confidence
    const matchWithMissing = evaluateStageFit(stage, cncIkeja, 2);
    expect(matchWithMissing.stageFitScore).toBeLessThan(match.stageFitScore);
  });

  it('should compute zero logistics friction for internal same-factory transfers', () => {
    const edge = {
      id: 'edge-1-2',
      from_stage_id: 'stage-1',
      to_stage_id: 'stage-2',
    };

    const edgeLogistics = evaluateEdgeLogistics(edge, cncIkeja, cncIkeja);
    expect(edgeLogistics.distance_km).toBe(0);
    expect(edgeLogistics.total_edge_friction).toBe(0);
    expect(edgeLogistics.freight_cost_ngn).toBe(0);
  });

  it('should calculate inter-facility transit friction and preservation benefits', () => {
    const edge = {
      id: 'edge-2-3',
      from_stage_id: 'stage-2',
      to_stage_id: 'stage-3',
      requires_vci_preservation: true,
      material_sensitivity: 0.08,
      max_queue_time_hours: 48,
    };

    const edgeProtected = evaluateEdgeLogistics(edge, cncIkeja, thermalAgbara);
    expect(edgeProtected.distance_km).toBeGreaterThan(0);
    expect(edgeProtected.preservation_applied).toBe(true);
    expect(edgeProtected.total_edge_friction).toBeLessThan(0.15);

    // Without VCI preservation, oxidation friction increases
    const edgeUnprotected = evaluateEdgeLogistics(
      { ...edge, requires_vci_preservation: false },
      cncIkeja,
      thermalAgbara,
    );
    expect(edgeUnprotected.oxidation_friction).toBeGreaterThan(edgeProtected.oxidation_friction);
  });

  it('should verify the Weighted Geometric Mean formula matching the DFN_MULTI_STAGE_PROCESS_ROUTING.md numerical example', () => {
    // Exact values from §4.3 worked numerical example:
    // Stage 1: S1 = 88, w1 = 1.0
    // Stage 2: S2 = 94, w2 = 2.0
    // Stage 3: S3 = 91, w3 = 1.5
    // Stage 4: S4 = 86, w4 = 1.2
    // Sum weights = 5.7
    // Stage Geometric Mean S_stages ≈ 90.42
    // Sum edge frictions = 0.018 + 0.012 + 0.008 = 0.038 (3.8%)
    // S_chain = 90.42 * (1 - 0.038) ≈ 86.98 -> 87 / 100
    const stageScores = [88, 94, 91, 86];
    const weights = [1.0, 2.0, 1.5, 1.2];
    const edgeFrictions = [0.018, 0.012, 0.008];

    const result = computeCompositeChainScore(stageScores, weights, edgeFrictions);

    expect(result.stageGeometricMeanScore).toBeCloseTo(90.42, 1);
    expect(result.totalLogisticsFriction).toBeCloseTo(0.038, 3);
    expect(result.compositeChainScore).toBe(87);
  });

  it('should enforce non-compensatory scoring when an intermediate bottleneck fails', () => {
    // Catastrophic failure at stage 3 (e.g. S3 = 0)
    const stageScores = [88, 94, 0, 86];
    const weights = [1.0, 2.0, 1.5, 1.2];

    const result = computeCompositeChainScore(stageScores, weights, [0.01, 0.01, 0.01]);
    // A single 0 must reduce the composite chain score to 0 (non-compensatory)
    expect(result.compositeChainScore).toBe(0);
  });

  it('should calculate Total Landed Cost (TLC) including tooling, cycle times, freight, and scrap buffer', () => {
    const stages = [
      {
        id: 'stage-1',
        op_number: 1,
        process_id: 'raw_stock_prep',
        title: 'Raw Stock Prep',
        direct_stage_cost_ngn: 450000,
        tooling_cost_ngn: 20000,
        estimated_cycle_time_min: 20,
        setup_hours: 1,
      },
      {
        id: 'stage-2',
        op_number: 2,
        process_id: '5-axis_cnc_milling',
        title: '5-Axis CNC Milling',
        direct_stage_cost_ngn: 1200000,
        tooling_cost_ngn: 80000,
        estimated_cycle_time_min: 60,
        setup_hours: 2,
      },
    ];

    const edges = [
      {
        edge_id: 'edge-1-2',
        from_stage_id: 'stage-1',
        to_stage_id: 'stage-2',
        from_factory_name: 'Abeokuta',
        to_factory_name: 'Ikeja',
        distance_km: 78,
        transit_hours: 3,
        freight_cost_ngn: 46200,
        preservation_cost_ngn: 25000,
        preservation_applied: true,
        roughness_friction: 0.002,
        oxidation_friction: 0.001,
        delay_friction: 0.0,
        distance_friction: 0.015,
        total_edge_friction: 0.018,
      },
    ];

    const tlc = calculateTotalLandedCost(stages, edges, 100);

    expect(tlc.directMachiningCostNgn).toBe(1650000);
    expect(tlc.toolingCostNgn).toBe(100000);
    expect(tlc.freightCostNgn).toBe(46200);
    expect(tlc.preservationCostNgn).toBe(25000);
    expect(tlc.totalLandedCostNgn).toBeGreaterThan(1800000);
    expect(tlc.totalLeadDays).toBeGreaterThan(5);
  });

  it('should route a 4-stage manufacturing DAG and recommend the top multi-factory cluster chain', async () => {
    const job: Partial<Job> = {
      id: 'job-multi-1',
      product_name: 'Complex Oilfield Valve Body',
      material_type: 'aluminum_6061',
      metadata: {
        bop: {
          operations: [
            { op_number: 1, process_id: 'casting', title: 'Raw Ingot Casting' },
            { op_number: 2, process_id: '5-axis_cnc_milling', title: '5-Axis CNC Milling' },
            { op_number: 3, process_id: 'vacuum_heat_treatment', title: 'Vacuum Heat Treatment' },
            { op_number: 4, process_id: 'hard_anodize', title: 'Type III Hard Anodize' },
          ],
        },
      },
    };

    const routing = await routeManufacturingDAG(job, candidateFactories);

    expect(routing.dag.stages.length).toBe(4);
    expect(routing.recommendations.length).toBeGreaterThan(0);

    const topRec = routing.recommendations[0];
    expect(topRec.composite_chain_score).toBeGreaterThan(75);
    expect(topRec.stages.length).toBe(4);
    expect(topRec.edges.length).toBe(3);
    expect(topRec.total_landed_cost_ngn).toBeGreaterThan(0);
    expect(topRec.total_lead_time_days).toBeGreaterThan(0);

    // Verify stage assignments
    expect(topRec.stages[0].factory_id).toBe(foundryAbeokuta.id);
    expect(topRec.stages[1].factory_id).toBe(cncIkeja.id);
    expect(topRec.stages[2].factory_id).toBe(thermalAgbara.id);
    expect(topRec.stages[3].factory_id).toBe(anodizeOshodi.id);
  });
});
