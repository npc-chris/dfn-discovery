/**
 * Live Database Integration Test Suite for Phase 6.9 Analytics Sub-App
 *
 * Runs real SQL queries against PostgreSQL initialized by Vitest setup hook.
 * Seeds fresh dataset in beforeEach to align with vitest.setup.ts truncation.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Server } from 'http';
import analyticsApp from './analytics.ts';
import { db } from '../db/client.ts';
import { jobs, factories, recommendations } from '../db/schema.ts';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // Start HTTP listener for sub-app
  await new Promise<void>((resolve) => {
    server = analyticsApp.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
});

beforeEach(async () => {
  // Seed live database tables before each test
  const [f1] = await db
    .insert(factories)
    .values({
      factory_name: 'Southwest Plastics Ltd',
      capabilities: { processes: ['injection-molding', 'extrusion'] },
      materials: ['polyethylene'],
      capacity_band: 'large',
      locations: [{ country: 'NG', state: 'Lagos', lga: 'Ikeja', region: 'Southwest' }],
      verified_sources: ['field_audit'],
      active: true,
    })
    .returning();

  const [j1] = await db
    .insert(jobs)
    .values({
      company_name: 'Lagos Consumer Goods',
      product_name: 'Bottles Batch A',
      process_type: 'injection-molding',
      material_type: 'polyethylene',
      volume_band: '50k-100k',
      location: { country: 'NG', state: 'Lagos', lga: 'Ikeja', region: 'Southwest' },
      status: 'recommended',
    })
    .returning();

  await db.insert(recommendations).values([
    {
      job_id: j1.id,
      factory_id: f1.id,
      fit_score: 88,
      feasibility_score: 90,
      confidence_score: 85,
      rank: 1,
      evidence: [{ source: 'capability_match', weight: 1.0 }],
    },
  ]);
});

describe('Live Postgres Analytics Integration Tests', () => {
  it('GET /regions — returns live aggregated stats from Postgres', async () => {
    const res = await fetch(`${baseUrl}/regions`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);

    const southwest = json.data.find((r: any) => r.region === 'Southwest');
    expect(southwest).toBeDefined();
    expect(southwest.jobCount).toBe(1);
    expect(southwest.factoryCount).toBe(1);
    expect(southwest.avgFitScore).toBe(88.0);
  });

  it('GET /regions/Southwest/processes — returns live process capability breakdown', async () => {
    const res = await fetch(`${baseUrl}/regions/Southwest/processes`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.region).toBe('Southwest');
    expect(json.processes.length).toBeGreaterThan(0);

    const molding = json.processes.find((p: any) => p.processType === 'injection-molding');
    expect(molding).toBeDefined();
    expect(molding.jobCount).toBe(1);
    expect(molding.avgFitScore).toBe(88.0);
  });

  it('GET /process-coverage — returns live national coverage map', async () => {
    const res = await fetch(`${baseUrl}/process-coverage`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.length).toBeGreaterThan(0);

    const item = json.data.find((p: any) => p.processType === 'injection-molding');
    expect(item).toBeDefined();
    expect(item.totalJobs).toBe(1);
  });
});
