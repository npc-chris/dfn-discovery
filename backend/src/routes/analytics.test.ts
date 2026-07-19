/**
 * Analytics Sub-App Tests (Phase 6.9)
 *
 * Validates all 6 analytics endpoints served by the `/api/v1/analytics` sub-app.
 * Uses mocked database client to test route logic and response transformations
 * without requiring a live Postgres daemon during unit testing.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'http';

// Mock DB client before importing analyticsApp
vi.mock('../db/client.ts', () => {
  const createThenable = (data: any) => ({
    from() {
      return this;
    },
    leftJoin() {
      return this;
    },
    where() {
      return this;
    },
    groupBy() {
      return this;
    },
    having() {
      return this;
    },
    orderBy() {
      return this;
    },
    limit() {
      return this;
    },
    then(resolve: (val: any) => void) {
      return Promise.resolve(data).then(resolve);
    },
  });

  return {
    db: {
      select(fields: any) {
        // Inspect target fields to simulate real DB aggregate responses
        const keys = Object.keys(fields || {});

        if (keys.includes('region') && keys.includes('jobCount')) {
          // GET /regions
          return createThenable([
            { region: 'Southwest', jobCount: 142, avgFitScore: 74.3 },
            { region: 'Northwest', jobCount: 85, avgFitScore: 71.0 },
          ]);
        }

        if (keys.includes('processType') && keys.includes('jobCount') && !keys.includes('matchedFactories')) {
          // GET /regions/:id/processes
          return createThenable([
            { processType: 'injection-molding', jobCount: 42, avgFitScore: 81.2 },
            { processType: 'extrusion', jobCount: 18, avgFitScore: 68.5 },
          ]);
        }

        if (keys.includes('processType') && keys.includes('matchedFactories')) {
          // GET /regions/:id/gaps or GET /gaps
          return createThenable([
            { processType: 'pcb-assembly', jobCount: 12, matchedFactories: 0 },
            { processType: 'heat-treatment', jobCount: 5, matchedFactories: 1 },
          ]);
        }

        if (keys.includes('lga') && keys.includes('state')) {
          // GET /clusters
          return createThenable([
            { lga: 'Ikeja', state: 'Lagos', jobCount: 34, avgFitScore: 78.0 },
            { lga: 'Kano Municipal', state: 'Kano', jobCount: 22, avgFitScore: 72.5 },
          ]);
        }

        if (keys.includes('processType') && keys.includes('totalJobs')) {
          // GET /process-coverage
          return createThenable([
            { processType: 'injection-molding', totalJobs: 189, totalFactories: 8, avgFitScore: 79.4 },
            { processType: 'pcb-assembly', totalJobs: 47, totalFactories: 0, avgFitScore: null },
          ]);
        }

        if (keys.includes('factoryCount')) {
          // Subquery for factories per region
          return createThenable([
            { region: 'Southwest', factoryCount: 18 },
            { region: 'Northwest', factoryCount: 10 },
          ]);
        }

        return createThenable([]);
      },
    },
  };
});

import analyticsApp from './analytics.ts';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
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

describe('Phase 6.9 Analytics Sub-App Routes', () => {
  it('GET /regions — returns regional coverage stats', async () => {
    const res = await fetch(`${baseUrl}/regions`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.count).toBe(2);

    const item = json.data[0];
    expect(item.region).toBe('Southwest');
    expect(item.jobCount).toBe(142);
    expect(item.factoryCount).toBe(18);
    expect(item.avgFitScore).toBe(74.3);
  });

  it('GET /regions/:regionId/processes — returns process breakdown for region', async () => {
    const res = await fetch(`${baseUrl}/regions/Southwest/processes`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.region).toBe('Southwest');
    expect(Array.isArray(json.processes)).toBe(true);
    expect(json.processes.length).toBe(2);

    const proc = json.processes[0];
    expect(proc.processType).toBe('injection-molding');
    expect(proc.jobCount).toBe(42);
    expect(proc.avgFitScore).toBe(81.2);
  });

  it('GET /regions/:regionId/gaps — returns processes with factories under threshold', async () => {
    const res = await fetch(`${baseUrl}/regions/Northcentral/gaps?threshold=2`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.region).toBe('Northcentral');
    expect(json.gapThreshold).toBe(2);
    expect(Array.isArray(json.gaps)).toBe(true);

    const pcbGap = json.gaps.find((g: any) => g.processType === 'pcb-assembly');
    expect(pcbGap).toBeDefined();
    expect(pcbGap.matchedFactories).toBe(0);
    expect(pcbGap.severity).toBe('critical');

    const heatGap = json.gaps.find((g: any) => g.processType === 'heat-treatment');
    expect(heatGap).toBeDefined();
    expect(heatGap.matchedFactories).toBe(1);
    expect(heatGap.severity).toBe('moderate');
  });

  it('GET /clusters — returns LGA and state aggregations', async () => {
    const res = await fetch(`${baseUrl}/clusters`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.count).toBe(2);

    const cluster = json.data[0];
    expect(cluster.lga).toBe('Ikeja');
    expect(cluster.state).toBe('Lagos');
    expect(cluster.jobCount).toBe(34);
    expect(cluster.avgFitScore).toBe(78.0);
  });

  it('GET /process-coverage — returns national process map with strength scale', async () => {
    const res = await fetch(`${baseUrl}/process-coverage`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.count).toBe(2);

    const strongItem = json.data[0];
    expect(strongItem.processType).toBe('injection-molding');
    expect(strongItem.coverageStrength).toBe('strong');

    const noneItem = json.data[1];
    expect(noneItem.processType).toBe('pcb-assembly');
    expect(noneItem.coverageStrength).toBe('none');
  });

  it('GET /gaps — returns national gap analysis with limit and threshold', async () => {
    const res = await fetch(`${baseUrl}/gaps?threshold=2&limit=10`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.threshold).toBe(2);
    expect(json.gapCount).toBe(2);
    expect(Array.isArray(json.gaps)).toBe(true);
    expect(json.gaps[0].processType).toBe('pcb-assembly');
    expect(json.gaps[0].severity).toBe('critical');
  });
});
