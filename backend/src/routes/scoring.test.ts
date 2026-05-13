import assert from 'assert';
import { getCoreIntelligence } from '../services/core-intelligence.ts';
import { factories, recommendations } from '../db/schema.ts';
import {
  buildEvidenceMap,
  getComponentAnalysis,
  getStoredRecommendations,
  loadFactories,
  persistRecommendations,
  scoreJobAgainstFactories,
} from './scoring.ts';

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

const factoryRows = [
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

const recommendationRows: any[] = [];
const callLog: string[] = [];

function createThenableRows(rows: any[]) {
  return {
    where() {
      return createThenableRows(rows);
    },
    orderBy() {
      return createThenableRows(rows);
    },
    limit(max: number) {
      return createThenableRows(rows.slice(0, max));
    },
    then(resolve: (value: any) => void, reject: (reason?: any) => void) {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
}

const fakeDb: any = {
  select() {
    callLog.push('select');
    return {
      from(table: any) {
        if (table === factories) {
          return createThenableRows(factoryRows);
        }

        if (table === recommendations) {
          return createThenableRows(recommendationRows);
        }

        return createThenableRows([]);
      },
    };
  },
  delete() {
    callLog.push('delete');
    return {
      where() {
        recommendationRows.length = 0;
        return Promise.resolve();
      },
    };
  },
  insert() {
    callLog.push('insert');
    return {
      values(values: any[]) {
        recommendationRows.splice(0, recommendationRows.length, ...values);
        return Promise.resolve(values);
      },
    };
  },
};

async function run() {
  const scorer = getCoreIntelligence();
  const jobLoader = async () => job;

  const loadedFactories = await loadFactories(undefined, fakeDb);
  assert.strictEqual(loadedFactories.length, 2, 'should load both factories');

  const evidenceMap = await buildEvidenceMap(loadedFactories);
  assert.deepStrictEqual(Object.keys(evidenceMap).sort(), ['f1', 'f2']);

  const scored = await scoreJobAgainstFactories('job-1', undefined, jobLoader as any, fakeDb, scorer);
  assert.strictEqual(scored.length, 2, 'should score both factories');
  assert.strictEqual(scored[0].factoryId, 'f1', 'best factory should be f1');

  const analysis = await getComponentAnalysis('job-1', 'f1', jobLoader as any, fakeDb, scorer);
  assert.strictEqual(analysis.factoryId, 'f1', 'analysis should target f1');
  assert.strictEqual(analysis.componentScores.processMatch, 100, 'process match should be deterministic');

  const ranked = await scorer.rankRecommendations(scored);
  await persistRecommendations('job-1', ranked, fakeDb);
  assert.strictEqual(recommendationRows.length, ranked.length, 'should persist ranked rows');

  const stored = await getStoredRecommendations('job-1', fakeDb);
  assert.strictEqual(stored.length, ranked.length, 'should load stored rows');
  assert.ok(callLog.includes('insert'), 'should insert recommendations');
  assert.ok(callLog.includes('delete'), 'should clear stale recommendations before insert');

  console.log('Scoring route tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
