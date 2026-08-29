# DFN Low-Level Design

## Purpose

This document defines the first implementation slices for the frozen DFN architecture.

## Canonical Entities

### Job

| Field | Type | Notes |
|---|---|---|
| id | string | UUID or equivalent |
| org_id | string | Owning organisation — from JWT on create, indexed, NOT NULL |
| created_by | string | userId from JWT — NOT NULL |
| company_name | string | Product company submitting the job |
| product_name | string | Product being manufactured |
| process_type | string | Derived or entered manufacturing process |
| material_type | string | Primary material or material family |
| volume_band | string | Low-volume range bucket |
| location | object | Job origin or delivery context |
| attachments | array | Files, notes, survey artifacts |
| status | string | Current workflow state |
| version | number | Monotonic version for updates |
| created_at | timestamp | Audit metadata |
| updated_at | timestamp | Audit metadata |

### Factory Profile

| Field | Type | Notes |
|---|---|---|
| id | string | UUID or equivalent |
| org_id | string | NULL = platform-managed (visible to all orgs); set = org-private |
| factory_name | string | Display name |
| capabilities | array | Supported processes and machine classes |
| materials | array | Supported materials |
| capacity_band | string | Practical production range |
| locations | array | Site locations and access data |
| certifications | array | Optional trust signals |
| verified_sources | array | Provenance and timestamps |
| active | boolean | Available for scoring |

### Recommendation

| Field | Type | Notes |
|---|---|---|
| job_id | string | Linked job |
| factory_id | string | Linked factory |
| org_id | string | Denormalised from job for fast org-scoped queries, NOT NULL |
| fit_score | number | Primary score, 0 to 100 |
| feasibility_score | number | Supporting score, 0 to 100 |
| confidence_score | number | How trusted the result is |
| rank | number | Position among alternatives |
| evidence | array | Supporting facts and source links |
| caveats | array | Missing data or risks |
| generated_at | timestamp | Audit metadata |

### Evidence Item

| Field | Type | Notes |
|---|---|---|
| id | string | UUID or equivalent |
| source_type | string | Survey, file, database, external feed |
| source_ref | string | Pointer to the origin |
| claim | string | What the evidence supports |
| confidence | number | Weight or trust level |
| created_at | timestamp | Audit metadata |

### Process Stage (DAG Node)

| Field | Type | Notes |
|---|---|---|
| id | string | UUID or equivalent |
| job_id | string | Linked job |
| stage_order | number | Sequential index or topological order |
| operation_type | string | Forming, 3/5-axis CNC, vacuum heat treat, anodizing, NDT, etc. |
| substrate_spec | object | Alloy grade, temper (e.g. 6061-T6), form factor, MTC requirement |
| tooling_spec | object | Machine kinematics, feeds, speeds, custom fixtures |
| tolerances | object | Dimensional limits (e.g. ±0.012mm), surface roughness Ra |
| standard_ids | array | Linked mandatory standard UUIDs from `standards_catalog` |

### Process Transition (DAG Edge / WIP Transfer)

| Field | Type | Notes |
|---|---|---|
| id | string | UUID or equivalent |
| job_id | string | Linked job |
| from_stage_id | string | Source stage UUID |
| to_stage_id | string | Destination stage UUID |
| transition_type | string | `internal_transfer`, `inter_fab_transit` |
| preservation_rule | string | VCI wrap, oil dip, nitrogen blanket, desiccant crating |
| max_queue_time_hours | number | Maximum allowable delay before material degradation |

### Standard Reference

| Field | Type | Notes |
|---|---|---|
| id | string | UUID or equivalent |
| sdo | string | ISO, SON, ASTM, ASME, API, DIN, BSI, NACE, AWS, etc. |
| standard_code | string | Official identifier (e.g., NIS 102:2006, API 5L, ASTM A36) |
| title | string | Full title of standard |
| category | string | Materials, welding, quality, piping, coatings |
| status | string | active, withdrawn, under_revision |

### Factory Cluster Recommendation (Multi-Fab Chain)

| Field | Type | Notes |
|---|---|---|
| id | string | UUID or equivalent |
| job_id | string | Linked job |
| org_id | string | Owning organisation |
| headline_fit_score | number | Weighted geometric mean of stage fit scores penalised by logistics friction (0-100) |
| chain_feasibility_score | number | Combined operational feasibility (0-100) |
| total_landed_cost_ngn | number | Cumulative operation costs + freight + preservation + buffer storage |
| total_lead_time_days | number | Cumulative processing days + inter-fab transit latency |
| stage_assignments | array | Array of stage UUIDs mapped to selected factory UUIDs and individual stage scores |
| inter_fab_logistics | array | Breakdown of transit legs (distance, travel time, route risk, preservation cost) |
| generated_at | timestamp | Audit metadata |

## State Machine

Job lifecycle:

1. draft
2. submitted
3. normalized
4. analyzing
5. scored
6. recommended
7. published
8. archived

Failure states:

- validation_failed
- analysis_failed
- scoring_failed
- stale_data

Rules:

- draft can move to submitted only after validation passes.
- submitted can move to normalized after intake succeeds.
- normalized can move to analyzing when AI extraction starts.
- analyzing can move to scored when scoring succeeds.
- scored can move to recommended when confidence is acceptable.
- recommended can move to published when the user accepts or exports the result.

## Auth and Security

### Middleware Chain (Protected Routes)

Every request to a protected route passes through this chain before its handler runs:

```
authMiddleware     → validate JWT via JWKS, attach AuthContext to res.locals.auth
quotaMiddleware    → enforce plan limits (fast path via token, live check if exhausted)
featureFlagGate    → enforce plan-gated features (per-route, checks dfn/features claim)
routeHandler       → enforce resource-level authorization, scope all queries by org_id
```

### Unauthenticated Endpoints

| Route | Auth method |
|---|---|
| `GET /health` | None (public) |
| `POST /webhooks/safetyculture` | HMAC-SHA256 signature verification |

All other routes require a valid JWT.

### org_id Scoping Rule

Every `SELECT`, `UPDATE`, and `DELETE` query must include `org_id = res.locals.auth.orgId`.
Resources belonging to a different org return `404` — never `403`.

See [Security Architecture](DFN_SECURITY.md) for the full specification.

## API Surface

### Public APIs

| Method | Route | Purpose |
|---|---|---|
| POST | /jobs | Create a job (supports flat or multi-stage DAG payload) |
| GET | /jobs/:id | Fetch a job and current status |
| POST | /jobs/:id/submit | Submit a draft job for intake |
| POST | /jobs/:id/analyze | Start analysis and scoring |
| GET | /jobs/:id/recommendation | Fetch single-factory recommendations |
| GET | /jobs/:id/cluster-recommendations | Fetch multi-factory cluster chain recommendations |
| GET | /factories/:id | Fetch a factory profile |
| POST | /factories | Create or import a factory profile |
| GET | /standards | Search standards catalog (ISO, SON, ASTM, API, etc.) |
| GET | /standards/:id/cross-references | Get international/local equivalent standards |
| POST | /admin/standards/bulk-import | Bulk upload verified NIS/NCP standards (admin role) |
| POST | /webhooks/safetyculture | Receive site audit webhook (enqueues processing) |

### Enrichment API contract

- `POST /enrichment/logistics-assessment` — Accepts `{ jobId?, factoryId?, prismReport? }`. If `jobId`/`factoryId` are provided the service will resolve canonical records; if not, callers may POST full `job` and `factory` shapes. Optional `prismReport` (JSON) is accepted and passed to the logistics policy for transport/profile selection. Returns `LogisticsAssessment`.
- `POST /enrichment/inter-fab-logistics` — Accepts `{ stageFromFactoryId, stageToFactoryId, preservationRule, maxQueueTimeHours }`. Computes point-to-point transit matrix, road quality risk, and preservation cost. Returns `InterFabLogisticsAssessment`.

Enrich-logistics handler specifics:

- The `enrich-logistics` job should call the Geo/Logistics service which in turn invokes the HERE adapters (matrix -> routing -> isoline as needed). The handler may accept an optional `prismReport` payload; when present it must be forwarded to the logistics policy to influence transportMode, packaging assumptions, and customs flags.
- Adapter calls must be idempotent and cache-aware: matrix results cached (1h), route results cached shorter (15–60m), geocoding cached longer (24h).

### Internal Worker APIs

| Method | Route | Purpose |
|---|---|---|
| POST | /internal/jobs/:id/extract | Run AI extraction |
| POST | /internal/jobs/:id/score | Run scoring |
| POST | /internal/jobs/:id/score-clusters | Run multi-factory cluster chain solver |
| POST | /internal/jobs/:id/enrich | Run context enrichment |

## Queue Jobs

1. classify-job
2. extract-evidence
3. score-fit
4. score-process-chain (orchestrates multi-stage DAG cluster matching)
5. enrich-logistics
6. refresh-market-signals
7. refresh-site-brief
8. generate-recommendation-brief
9. sync-audit-webhook (handles inbound SafetyCulture/UpKeep state mutations)
10. sync-son-standards (periodic scheduled crawler for `library.son.gov.ng`)
11. sync-sdo-catalog (periodic open data sync for ISO, IEC, etc.)
12. verify-iaf-certifications (real-time validation against IAF CertSearch API)

Rules:

- every job must be idempotent
- retries must preserve the same job version
- queue messages must carry source provenance
- failed jobs must be visible in the job state
- heavily rely on the queue to handle webhook deliveries. If UpKeep/SafetyCulture APIs go down or rate-limit us, rely on the queue's exponential backoff instead of dropping the site survey.

## Batch Coordination Contract

Batch Coordination operates above the queue and below the presentation layer.

It should define:

- batch request and manifest schema
- child job correlation and idempotency rules
- aggregate progress and status rules
- partial-failure and retry semantics
- consolidated result schema for bulk checks and calculations

Batch Coordination may split a bulk request into multiple child jobs, wait for their completion, and publish one normalized batch result for downstream consumers.

## Scoring Contract

The default scoring model is weighted and normalized to 0 to 100.

Suggested components:

- process match
- material match
- capacity match
- geography and logistics
- market access
- evidence confidence

Suggested rule:

Fit Score = weighted sum of components, then adjusted by confidence penalty when evidence is weak.

The actual weights should be configurable, but the score output shape should remain stable.

## AI Worker Contract

Input:

- sanitized job payload
- known factory profile data
- relevant evidence context

Output:

- structured fields
- summary text
- explanation text
- missing-data flags
- confidence metadata

Guardrails:

- no freeform user chat loop
- no invented facts
- no hidden tool calls outside the worker boundary
- refusal when the evidence is too sparse to produce a safe answer

## Error Handling

### Validation Errors

- return field-level errors
- keep the job in validation_failed until corrected

### Analysis Errors

- retry transient extraction failures
- mark source artifacts and worker attempt count
- keep partial outputs if they are valid and provenance-safe

### Scoring Errors

- fall back to draft recommendation only if enough deterministic data exists
- otherwise keep the result in scoring_failed

### External Provider Failures

- cache known routing and market data where possible
- degrade to stale-but-labeled context instead of silent failure

## Security Implementation

This section defines the LLD-level security contracts. See [DFN_SECURITY.md](DFN_SECURITY.md) for the full specification.

### Auth Middleware Contract

- Installed on every route except `/health` and `POST /webhooks/safetyculture`
- Validates JWT: signature (JWKS), `iss`, `aud`, `exp`
- JWKS keys cached 24h, rotated on `kid` mismatch (no restart needed)
- Attaches `AuthContext` to `res.locals.auth`
- Returns `401` on any validation failure — never `403`

### Quota Middleware Contract

- Reads `res.locals.auth.quotas.jobsRemaining`
- Fast path: if `> 0`, allow without network call
- Slow path: if `<= 0`, call platform billing API for live check
- Returns `402 Payment Required` if over limit

### Webhook Auth Contract

- `POST /webhooks/safetyculture` reads `x-iauditor-signature`
- Computes `HMAC-SHA256(rawBody, SAFETYCULTURE_WEBHOOK_SECRET)`
- Uses constant-time comparison
- Returns `401` and does not enqueue if signature does not match

### Audit Events

Fire-and-forget audit events emitted on: job created, job submitted, job deleted, recommendation exported, batch created, Prism import.
Events must not block the response path.

## Observability

Log these events for every job:

- job created
- job submitted
- normalization completed
- AI extraction completed
- scoring completed
- recommendation published
- job failed

Each event should include:

- job id
- version
- actor or worker name
- timestamp
- source trace id

## LLD Freeze Check

Before implementation starts, confirm:

- canonical job and factory schemas are stable (including org_id and created_by columns)
- state machine is approved
- scoring components are named and ordered
- AI worker input and output contracts are fixed
- queue job list is fixed
- auth middleware contract agreed and IdP choice confirmed
- org_id scoping rule confirmed for all tables
- quota and feature flag middleware contracts agreed
- audit event list agreed and bus endpoint confirmed
