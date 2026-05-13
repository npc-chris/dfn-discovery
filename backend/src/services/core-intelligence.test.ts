import { getCoreIntelligence } from './core-intelligence.ts';
import { CONFIDENCE_PENALTY_FACTOR, SCORING_WEIGHTS } from '@dfn/shared/constants/scoring';

// Deterministic test harness for Phase 2 scoring and ranking
async function run() {
  const scorer = getCoreIntelligence();

  const job = {
    id: 'job-1',
    company_name: 'ACME',
    product_name: 'Widget',
    process_type: 'injection-molding',
    material_type: 'plastic',
    volume_band: '10k-50k',
    location: { country: 'US' },
    attachments: [],
    status: 'submitted',
    version: 1,
    created_at: new Date(),
    updated_at: new Date(),
  } as any;

  const factories = [
    {
      id: 'f1',
      factory_name: 'Factory One',
      capabilities: [{ process: 'injection-molding' }],
      materials: ['plastic'],
      capacity_band: '10k-50k',
      locations: [{ country: 'US' }],
      verified_sources: [],
      active: true,
    },
    {
      id: 'f2',
      factory_name: 'Factory Two',
      capabilities: [{ process: 'casting' }],
      materials: ['metal'],
      capacity_band: '1k-5k',
      locations: [{ country: 'CN' }],
      verified_sources: [],
      active: false,
    },
  ] as any[];

  const evidence: Record<string, any[]> = { f1: [{ id: 'e1', confidence: 80 }], f2: [] };

  const scored = await scorer.scoreJob({ jobId: job.id, job, factories, evidence });
  const scoredAgain = await scorer.scoreJob({ jobId: job.id, job, factories, evidence });

  const expectedFit = Math.round(
    ((100 * SCORING_WEIGHTS.process_match) +
      (100 * SCORING_WEIGHTS.material_match) +
      (100 * SCORING_WEIGHTS.capacity_match) +
      (100 * SCORING_WEIGHTS.geography_and_logistics) +
      (80 * SCORING_WEIGHTS.market_access) +
      (80 * SCORING_WEIGHTS.evidence_confidence)) /
      (SCORING_WEIGHTS.process_match +
        SCORING_WEIGHTS.material_match +
        SCORING_WEIGHTS.capacity_match +
        SCORING_WEIGHTS.geography_and_logistics +
        SCORING_WEIGHTS.market_access +
        SCORING_WEIGHTS.evidence_confidence) *
      (1 - CONFIDENCE_PENALTY_FACTOR * 0),
  );

  const expectedSecondFit = Math.round(
    ((0 * SCORING_WEIGHTS.process_match) +
      (0 * SCORING_WEIGHTS.material_match) +
      (50 * SCORING_WEIGHTS.capacity_match) +
      (50 * SCORING_WEIGHTS.geography_and_logistics) +
      (20 * SCORING_WEIGHTS.market_access) +
      (0 * SCORING_WEIGHTS.evidence_confidence)) /
      (SCORING_WEIGHTS.process_match +
        SCORING_WEIGHTS.material_match +
        SCORING_WEIGHTS.capacity_match +
        SCORING_WEIGHTS.geography_and_logistics +
        SCORING_WEIGHTS.market_access +
        SCORING_WEIGHTS.evidence_confidence) *
      (1 - CONFIDENCE_PENALTY_FACTOR * 0),
  );

  const ranked = await scorer.rankRecommendations(scored);

  console.log(
    JSON.stringify(
      {
        deterministic: JSON.stringify(scored) === JSON.stringify(scoredAgain),
        expectedFit,
        actualFit: scored[0]?.fitScore,
        expectedSecondFit,
        actualSecondFit: scored[1]?.fitScore,
        rankOrder: ranked.map((entry) => ({ factoryId: entry.factoryId, rank: entry.rank, gatePassed: entry.gatePassed })),
      },
      null,
      2,
    ),
  );

  console.log('Core intelligence Phase 2 smoke test completed');
}

run().catch(e => {
  console.error('Test failed', e);
  process.exit(1);
});
