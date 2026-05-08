# DFN Low-Level Design

## Purpose

This document defines the first implementation slices for the frozen DFN architecture.

## Canonical Entities

### Job

| Field | Type | Notes |
|---|---|---|
| id | string | UUID or equivalent |
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

## API Surface

### Public APIs

| Method | Route | Purpose |
|---|---|---|
| POST | /jobs | Create a job |
| GET | /jobs/:id | Fetch a job and current status |
| POST | /jobs/:id/submit | Submit a draft job for intake |
| POST | /jobs/:id/analyze | Start analysis and scoring |
| GET | /jobs/:id/recommendation | Fetch the recommendation bundle |
| GET | /factories/:id | Fetch a factory profile |
| POST | /factories | Create or import a factory profile |

### Internal Worker APIs

| Method | Route | Purpose |
|---|---|---|
| POST | /internal/jobs/:id/extract | Run AI extraction |
| POST | /internal/jobs/:id/score | Run scoring |
| POST | /internal/jobs/:id/enrich | Run context enrichment |

## Queue Jobs

1. classify-job
2. extract-evidence
3. score-fit
4. enrich-logistics
5. refresh-market-signals
6. refresh-site-brief
7. generate-recommendation-brief

Rules:

- every job must be idempotent
- retries must preserve the same job version
- queue messages must carry source provenance
- failed jobs must be visible in the job state

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

- canonical job and factory schemas are stable
- state machine is approved
- scoring components are named and ordered
- AI worker input and output contracts are fixed
- queue job list is fixed
