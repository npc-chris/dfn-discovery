# Phase 6.9 — Analytics & Persona Gap Closure

**Phase Status:** Specification Complete  
**Implementation Status:** Routes deployed (MVP), Materialized Views pending  
**Depends on:** Phase 6 (Enrichment) complete  
**Precedes:** Phase 7 (Security Hardening)  
**Last Updated:** 2026-07-14

---

## Overview

Phase 6.9 is a formal pre-freeze phase that closes the gap between the product's stated analytics persona commitments and what is actually queryable from the backend. It introduces:

1. **Six analytics endpoints** as a separate Express sub-app (`/api/v1/analytics/*`)
2. **Four target persona mappings** — each group of users gets specific analytics they care about
3. **Frontend component inventory** — what the `dfn-ui` open-source codebase will consume
4. **Materialized view strategy** — upgrade path for the MVP aggregation queries

---

## Design Rationale

Discovery's analytics dimension serves a different audience from the per-job recommendation flow. Rather than "find me a factory for this job," analytics answers "where are the structural gaps in Nigerian manufacturing?" This distinction is why analytics is a separate Express sub-app:

- It can be rate-limited independently from the recommendation core
- It can be open-sourced as part of `dfn-ui` without exposing job-level PII
- It is a natural seam for a future read-replica database connection
- It can be versioned (`/api/v1`, `/api/v2`) without touching recommendation routes

---

## Persona-to-Endpoint Mapping

| Persona | Primary Question | Key Endpoints |
|---|---|---|
| **Industrial Designer / Engineer** | "Which processes are available near me?" | `/regions/:id/processes`, `/process-coverage` |
| **Factory Owner / Operator** | "What jobs are coming to my region?" | `/regions`, `/clusters` |
| **Government / Policy Maker** | "Where are the critical gaps I should invest in?" | `/gaps`, `/regions/:id/gaps` |
| **DFN Executive / Investor** | "How deep is the market?" | `/regions`, `/process-coverage`, `/gaps` |

---

## API Contract

All endpoints are served by the Express sub-app at `backend/src/routes/analytics.ts`, mounted at `/api/v1/analytics`.

### `GET /api/v1/analytics/regions`

Returns all Nigerian manufacturing regions with coverage statistics.

**Response**
```json
{
  "data": [
    {
      "region": "Southwest",
      "jobCount": 142,
      "factoryCount": 18,
      "avgFitScore": 74.3
    }
  ],
  "count": 6
}
```

---

### `GET /api/v1/analytics/regions/:regionId/processes`

Returns process type breakdown for a specific region.

**Parameters:** `:regionId` — URL-encoded region name (e.g. `Southwest`)

**Response**
```json
{
  "region": "Southwest",
  "processes": [
    { "processType": "injection-molding", "jobCount": 42, "avgFitScore": 81.2 }
  ]
}
```

---

### `GET /api/v1/analytics/regions/:regionId/gaps`

Returns process types with fewer than `threshold` matched factories in a region.

**Query Params:** `threshold` (default: 2)

**Response**
```json
{
  "region": "Northwest",
  "gapThreshold": 2,
  "gaps": [
    { "processType": "pcb-assembly", "jobCount": 12, "matchedFactories": 0, "severity": "critical" },
    { "processType": "heat-treatment", "jobCount": 5, "matchedFactories": 1, "severity": "moderate" }
  ]
}
```

**Severity scale:**
- `critical` — zero factories matched (complete gap)
- `moderate` — fewer than threshold (partial gap)

---

### `GET /api/v1/analytics/clusters`

LGA-level aggregation. Useful for cluster maps and heatmaps.

**Response**
```json
{
  "data": [
    { "lga": "Ikoyi", "state": "Lagos", "jobCount": 34, "avgFitScore": 78 }
  ],
  "count": 48
}
```

---

### `GET /api/v1/analytics/process-coverage`

National process map — all process types with coverage strength classification.

**Coverage strength scale:**
- `none` — 0 matched factories
- `weak` — 1–2 factories
- `moderate` — 3–5 factories
- `strong` — 6+ factories

**Response**
```json
{
  "data": [
    { "processType": "injection-molding", "totalJobs": 189, "totalFactories": 22, "avgFitScore": 79.4, "coverageStrength": "strong" }
  ],
  "count": 34
}
```

---

### `GET /api/v1/analytics/gaps`

National gap analysis — top N processes with critical/moderate supply gaps.

**Query Params:** `threshold` (default: 2), `limit` (default: 20, max: 100)

**Response**
```json
{
  "threshold": 2,
  "gapCount": 7,
  "gaps": [
    { "processType": "pcb-assembly", "totalJobs": 47, "matchedFactories": 0, "severity": "critical" }
  ]
}
```

---

## Data Model Notes

No schema changes are required for the MVP implementation. All analytics endpoints query the existing tables:

| Table | Analytics usage |
|---|---|
| `jobs` | Source of process types and location JSONB (`location->>'region'`, `location->>'state'`, `location->>'lga'`) |
| `factories` | Factory count by region via `locations->0->>'region'` |
| `recommendations` | Fit score aggregation, matched factory counts |

> [!NOTE]
> The `location` JSONB column is expected to contain at minimum: `{ country, state, region, lga }`. Jobs missing a `region` field will be excluded from regional aggregations. Ensure the job intake validation checks for `region` in Phase 7.

---

## Materialized View Upgrade Path

For production scale (>10k jobs), replace the inline aggregations with PostgreSQL materialized views refreshed on a schedule.

### View: `region_process_coverage`

```sql
CREATE MATERIALIZED VIEW region_process_coverage AS
SELECT
  j.location->>'region'   AS region,
  j.location->>'state'    AS state,
  j.process_type,
  COUNT(DISTINCT j.id)                AS job_count,
  COUNT(DISTINCT r.factory_id)        AS matched_factories,
  ROUND(AVG(r.fit_score)::numeric, 1) AS avg_fit_score
FROM jobs j
LEFT JOIN recommendations r ON r.job_id = j.id
WHERE j.location->>'region' IS NOT NULL
GROUP BY j.location->>'region', j.location->>'state', j.process_type;

CREATE UNIQUE INDEX ON region_process_coverage (region, process_type);
```

**Refresh schedule:** `REFRESH MATERIALIZED VIEW CONCURRENTLY region_process_coverage;` — run hourly via a `pg_cron` job or a scheduled queue task of type `refresh-analytics`.

### View: `factory_regional_dominance`

```sql
CREATE MATERIALIZED VIEW factory_regional_dominance AS
SELECT
  f.locations->0->>'region' AS region,
  f.id                      AS factory_id,
  f.factory_name,
  COUNT(r.job_id)           AS total_recommendations,
  ROUND(AVG(r.fit_score)::numeric, 1) AS avg_fit_score,
  ROUND(AVG(r.rank)::numeric, 1)      AS avg_rank
FROM factories f
LEFT JOIN recommendations r ON r.factory_id = f.id
WHERE f.active = true
GROUP BY f.locations->0->>'region', f.id, f.factory_name;
```

**Upgrade trigger:** When `GET /api/v1/analytics/*` p99 latency exceeds 500ms in production, migrate to materialized views and update the route handlers to query the views instead.

---

## Frontend Component Inventory (dfn-ui)

The analytics sub-app feeds the following components in the `dfn-ui` open-source frontend:

| Component | Page | Data Source |
|---|---|---|
| `RegionalHeatmap` | `/analytics` | `GET /api/v1/analytics/regions` |
| `RegionalProcessBreakdown` | `/analytics/regions/:id` | `GET /api/v1/analytics/regions/:id/processes` |
| `GapAnalysisTable` | `/analytics/gaps` | `GET /api/v1/analytics/gaps` |
| `RegionalGapList` | `/analytics/regions/:id/gaps` | `GET /api/v1/analytics/regions/:id/gaps` |
| `ClusterMap` | `/analytics/clusters` | `GET /api/v1/analytics/clusters` |
| `ProcessCoverageChart` | `/analytics/process-coverage` | `GET /api/v1/analytics/process-coverage` |

See `DFN_FRONTEND_ARCHITECTURE.md` for the full component tree, data-fetching strategy, and feature flag gates.

---

## Phase 6.9 Acceptance Criteria

- [ ] All six analytics endpoints return real database aggregations (no mock returns `{}`)
- [ ] `GET /api/v1/analytics/regions` query < 200ms on staging dataset
- [ ] `GET /api/v1/analytics/gaps` correctly identifies processes with 0 matched factories
- [ ] `threshold` query parameter respected for gap endpoints
- [ ] No `org_id` filtering leakage (analytics are cross-org aggregate views — no PII)
- [ ] Error responses follow the standard `{ error: string }` contract
- [ ] TypeScript compilation passes with zero errors
- [ ] Analytics sub-app is independently mountable (no circular dependency on recommendation core)
