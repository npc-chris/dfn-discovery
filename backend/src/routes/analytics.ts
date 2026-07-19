/**
 * Analytics Sub-Application (Phase 6.9)
 *
 * Provides aggregate manufacturing market intelligence across Nigerian regions,
 * clusters, and process categories. Mounted as a separate Express app at
 * /api/v1/analytics to allow independent versioning and rate-limiting.
 *
 * All endpoints run real database aggregations using Drizzle against the
 * existing jobs, factories, and recommendations tables. No materialized views
 * are required for MVP; add hourly-refresh materialized views in Phase 6.9+
 * for performance optimization.
 *
 * Endpoints:
 *   GET /api/v1/analytics/regions               — all regions with coverage stats
 *   GET /api/v1/analytics/regions/:regionId/processes — process capability by region
 *   GET /api/v1/analytics/regions/:regionId/gaps     — process gaps in a region
 *   GET /api/v1/analytics/clusters               — LGA-level aggregation
 *   GET /api/v1/analytics/process-coverage       — national process map
 *   GET /api/v1/analytics/gaps                   — top-level national gap analysis
 */

import express, { Request, Response, Express } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { jobs, factories, recommendations } from '../db/schema';

const analyticsApp: Express = express();
analyticsApp.use(express.json());

// ---------------------------------------------------------------------------
// Helper: extract region from location JSONB
// ---------------------------------------------------------------------------
// The location field is stored as JSONB: { state, lga, region, country, ... }
// We use Drizzle's sql`` template for JSON path access.

const regionExpr = sql<string>`(${jobs.location}->>'region')`;
const stateExpr  = sql<string>`(${jobs.location}->>'state')`;

// ---------------------------------------------------------------------------
// GET /api/v1/analytics/regions
// ---------------------------------------------------------------------------
/**
 * Returns all distinct regions with manufacturing coverage statistics.
 *
 * Response shape:
 * [
 *   {
 *     "region": "Southwest",
 *     "jobCount": 142,
 *     "factoryCount": 18,
 *     "avgFitScore": 74.3,
 *     "processTypes": ["injection-molding", "extrusion", ...]
 *   },
 *   ...
 * ]
 */
analyticsApp.get('/regions', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Aggregate job counts and average fit scores by region
    const rows = await db
      .select({
        region: regionExpr,
        jobCount: sql<number>`cast(count(${jobs.id}) as int)`,
        avgFitScore: sql<number | null>`avg(${recommendations.fit_score})`,
      })
      .from(jobs)
      .leftJoin(recommendations, sql`${recommendations.job_id} = ${jobs.id}`)
      .groupBy(regionExpr)
      .orderBy(sql`count(${jobs.id}) DESC`);

    // Get distinct active factory counts per region
    const factoryRows = await db
      .select({
        region: sql<string>`(${factories.locations}->0->>'region')`,
        factoryCount: sql<number>`cast(count(distinct ${factories.id}) as int)`,
      })
      .from(factories)
      .where(sql`${factories.active} = true`)
      .groupBy(sql`(${factories.locations}->0->>'region')`);

    const factoryMap = new Map(factoryRows.map((r) => [r.region, r.factoryCount]));

    const result = rows
      .filter((r) => r.region)
      .map((r) => ({
        region: r.region,
        jobCount: Number(r.jobCount),
        factoryCount: Number(factoryMap.get(r.region) ?? 0),
        avgFitScore: r.avgFitScore ? Math.round(Number(r.avgFitScore) * 10) / 10 : null,
      }));

    res.json({ data: result, count: result.length });
  } catch (err) {
    console.error('[analytics/regions]', err);
    res.status(500).json({ error: 'Failed to aggregate regional data' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/analytics/regions/:regionId/processes
// ---------------------------------------------------------------------------
/**
 * Returns process type coverage for a specific region.
 * :regionId is the URL-encoded region name (e.g. "Southwest", "Northwest").
 *
 * Response shape:
 * {
 *   "region": "Southwest",
 *   "processes": [
 *     { "processType": "injection-molding", "jobCount": 42, "factoryCount": 7, "avgFitScore": 81.2 },
 *     ...
 *   ]
 * }
 */
analyticsApp.get('/regions/:regionId/processes', async (req: Request, res: Response): Promise<void> => {
  const region = decodeURIComponent(req.params.regionId);

  try {
    const rows = await db
      .select({
        processType: jobs.process_type,
        jobCount: sql<number>`cast(count(${jobs.id}) as int)`,
        avgFitScore: sql<number | null>`avg(${recommendations.fit_score})`,
      })
      .from(jobs)
      .leftJoin(recommendations, sql`${recommendations.job_id} = ${jobs.id}`)
      .where(sql`(${jobs.location}->>'region') = ${region}`)
      .groupBy(jobs.process_type)
      .orderBy(sql`count(${jobs.id}) DESC`);

    const result = rows
      .filter((r) => r.processType)
      .map((r) => ({
        processType: r.processType,
        jobCount: Number(r.jobCount),
        avgFitScore: r.avgFitScore ? Math.round(Number(r.avgFitScore) * 10) / 10 : null,
      }));

    res.json({ region, processes: result });
  } catch (err) {
    console.error('[analytics/regions/:regionId/processes]', err);
    res.status(500).json({ error: 'Failed to aggregate process data for region' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/analytics/regions/:regionId/gaps
// ---------------------------------------------------------------------------
/**
 * Returns process types with weak or no factory coverage in the given region.
 * A process is "gap" when fewer than 2 distinct factories are matched for it.
 *
 * Response shape:
 * {
 *   "region": "Northwest",
 *   "gaps": [
 *     { "processType": "pcb-assembly", "jobCount": 12, "matchedFactories": 0, "severity": "critical" },
 *     ...
 *   ]
 * }
 */
analyticsApp.get('/regions/:regionId/gaps', async (req: Request, res: Response): Promise<void> => {
  const region = decodeURIComponent(req.params.regionId);
  const GAP_THRESHOLD = Number(req.query.threshold ?? 2);

  try {
    const rows = await db
      .select({
        processType: jobs.process_type,
        jobCount: sql<number>`cast(count(${jobs.id}) as int)`,
        matchedFactories: sql<number>`cast(count(distinct ${recommendations.factory_id}) as int)`,
      })
      .from(jobs)
      .leftJoin(recommendations, sql`${recommendations.job_id} = ${jobs.id}`)
      .where(sql`(${jobs.location}->>'region') = ${region}`)
      .groupBy(jobs.process_type)
      .having(sql`count(distinct ${recommendations.factory_id}) < ${GAP_THRESHOLD}`);

    const result = rows
      .filter((r) => r.processType)
      .map((r) => {
        const matched = Number(r.matchedFactories);
        return {
          processType: r.processType,
          jobCount: Number(r.jobCount),
          matchedFactories: matched,
          severity: matched === 0 ? 'critical' : 'moderate',
        };
      })
      .sort((a, b) => a.matchedFactories - b.matchedFactories);

    res.json({ region, gapThreshold: GAP_THRESHOLD, gaps: result });
  } catch (err) {
    console.error('[analytics/regions/:regionId/gaps]', err);
    res.status(500).json({ error: 'Failed to compute gap analysis for region' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/analytics/clusters
// ---------------------------------------------------------------------------
/**
 * Returns LGA-level aggregation statistics.
 *
 * Response shape:
 * [
 *   { "lga": "Ikoyi", "state": "Lagos", "jobCount": 34, "avgFitScore": 78 },
 *   ...
 * ]
 */
analyticsApp.get('/clusters', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select({
        lga: sql<string>`(${jobs.location}->>'lga')`,
        state: stateExpr,
        jobCount: sql<number>`cast(count(${jobs.id}) as int)`,
        avgFitScore: sql<number | null>`avg(${recommendations.fit_score})`,
      })
      .from(jobs)
      .leftJoin(recommendations, sql`${recommendations.job_id} = ${jobs.id}`)
      .groupBy(sql`(${jobs.location}->>'lga')`, stateExpr)
      .orderBy(sql`count(${jobs.id}) DESC`);

    const result = rows
      .filter((r) => r.lga)
      .map((r) => ({
        lga: r.lga,
        state: r.state,
        jobCount: Number(r.jobCount),
        avgFitScore: r.avgFitScore ? Math.round(Number(r.avgFitScore) * 10) / 10 : null,
      }));

    res.json({ data: result, count: result.length });
  } catch (err) {
    console.error('[analytics/clusters]', err);
    res.status(500).json({ error: 'Failed to aggregate cluster data' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/analytics/process-coverage
// ---------------------------------------------------------------------------
/**
 * National process coverage map — groups by process type across all regions.
 *
 * Response shape:
 * [
 *   {
 *     "processType": "injection-molding",
 *     "totalJobs": 189,
 *     "totalFactories": 22,
 *     "avgFitScore": 79.4,
 *     "coverageStrength": "strong"  // "strong" ≥6, "moderate" 3–5, "weak" 1–2, "none" 0
 *   },
 *   ...
 * ]
 */
analyticsApp.get('/process-coverage', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select({
        processType: jobs.process_type,
        totalJobs: sql<number>`cast(count(${jobs.id}) as int)`,
        totalFactories: sql<number>`cast(count(distinct ${recommendations.factory_id}) as int)`,
        avgFitScore: sql<number | null>`avg(${recommendations.fit_score})`,
      })
      .from(jobs)
      .leftJoin(recommendations, sql`${recommendations.job_id} = ${jobs.id}`)
      .groupBy(jobs.process_type)
      .orderBy(sql`count(${jobs.id}) DESC`);

    const result = rows
      .filter((r) => r.processType)
      .map((r) => {
        const factoryCount = Number(r.totalFactories);
        const strength =
          factoryCount === 0 ? 'none'
          : factoryCount <= 2 ? 'weak'
          : factoryCount <= 5 ? 'moderate'
          : 'strong';

        return {
          processType: r.processType,
          totalJobs: Number(r.totalJobs),
          totalFactories: factoryCount,
          avgFitScore: r.avgFitScore ? Math.round(Number(r.avgFitScore) * 10) / 10 : null,
          coverageStrength: strength,
        };
      });

    res.json({ data: result, count: result.length });
  } catch (err) {
    console.error('[analytics/process-coverage]', err);
    res.status(500).json({ error: 'Failed to compute national process coverage' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/analytics/gaps
// ---------------------------------------------------------------------------
/**
 * National gap analysis — identifies process types with critical or moderate
 * supply gaps across all regions.
 *
 * Query params:
 *   threshold (number, default 2) — factories below this count are flagged
 *   limit     (number, default 20) — max gaps to return
 *
 * Response shape:
 * {
 *   "threshold": 2,
 *   "gaps": [
 *     {
 *       "processType": "pcb-assembly",
 *       "totalJobs": 47,
 *       "matchedFactories": 0,
 *       "severity": "critical",
 *       "topRegions": ["Southwest", "Northcentral"]
 *     },
 *     ...
 *   ]
 * }
 */
analyticsApp.get('/gaps', async (req: Request, res: Response): Promise<void> => {
  const GAP_THRESHOLD = Number(req.query.threshold ?? 2);
  const LIMIT = Math.min(Number(req.query.limit ?? 20), 100);

  try {
    const rows = await db
      .select({
        processType: jobs.process_type,
        totalJobs: sql<number>`cast(count(${jobs.id}) as int)`,
        matchedFactories: sql<number>`cast(count(distinct ${recommendations.factory_id}) as int)`,
      })
      .from(jobs)
      .leftJoin(recommendations, sql`${recommendations.job_id} = ${jobs.id}`)
      .groupBy(jobs.process_type)
      .having(sql`count(distinct ${recommendations.factory_id}) < ${GAP_THRESHOLD}`)
      .orderBy(sql`count(${jobs.id}) DESC`)
      .limit(LIMIT);

    const result = rows
      .filter((r) => r.processType)
      .map((r) => ({
        processType: r.processType,
        totalJobs: Number(r.totalJobs),
        matchedFactories: Number(r.matchedFactories),
        severity: Number(r.matchedFactories) === 0 ? 'critical' : 'moderate',
      }));

    res.json({ threshold: GAP_THRESHOLD, gapCount: result.length, gaps: result });
  } catch (err) {
    console.error('[analytics/gaps]', err);
    res.status(500).json({ error: 'Failed to compute national gap analysis' });
  }
});

export default analyticsApp;
