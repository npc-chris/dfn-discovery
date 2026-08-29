# DFN High-Level Design

## Purpose

This document freezes the high-level shape of DFN Discovery for product companies.

The product answers one question: can this manufacturing job be routed to a Nigerian factory with acceptable fit, cost, lead time, and risk?

## Scope

In scope:

- job intake and normalization
- capability and fit scoring
- AI-assisted extraction and explanation
- market, logistics, and site context
- recommendation briefs and reports

Out of scope for the first freeze:

- open-ended chatbot behavior
- marketplace browsing without scoring
- workflow automation for factories
- community and social features

## Design Principles

1. Structured over conversational.
2. Deterministic over speculative.
3. Evidence-backed over opinionated.
4. Async where external data or AI is involved.
5. Thin presentation layer, no business logic in the UI.

## Architectural Overview

The system is made of a small set of services that cooperate through explicit contracts.

### Service Responsibilities

| Service | Responsibility | Interaction Style |
| --- | --- | --- |
| Job Intake | Validate, normalize, version job submissions (single-stage and multi-stage DAGs) | Mostly synchronous |
| Core Intelligence | Compute fit, feasibility, multi-stage chain routing, and recommendation ranking | Mostly synchronous |
| Standards & SDO Engine | Ingest open SDO metadata (ISO, SON, ASTM, API, etc.), map cross-references, and verify factory accreditations | Asynchronous ingestion & sync |
| Multi-Stage Process Routing | Orchestrate manufacturing DAGs, tooling parameters, substrate constraints, and factory cluster formation | Mixed (Sync graph solver + async matrix lookups) |
| AI Analysis Workers | Extract structure, summarize, explain, flag anomalies | Asynchronous jobs |
| Geo and Logistics | Produce provider-backed distance, routing, reachability, and inter-fab WIP transit context | Mixed, provider-adapter driven |
| Market Intelligence | Produce demand, pricing, and capacity signals | Mostly asynchronous ingestion |
| Site and Real Estate Intelligence | Produce site briefs and fit context | Mixed |
| Batch Coordination | Orchestrate software bulk requests, grouped calculations, and fan-out/fan-in queue sets | Asynchronous control plane |
| Presentation Layer | Render dashboards, exports, and reports | Synchronous read path |

## Primary Decisions

These are frozen in the HLD.

### 1. Primary Score

The primary score is the Fit Score.

Feasibility Score is a supporting dimension that can lower or raise confidence, but it does not replace Fit Score as the headline output.

### 2. Recommendation Gate

A recommendation may be shown when there is:

- one canonical job record
- at least one factory or candidate profile to compare against
- enough evidence to calculate a non-placeholder score
- confidence metadata attached to the result

If evidence is weak, the product should return a tentative recommendation with explicit caveats instead of guessing.

### 3. AI Role

AI is a worker, not a user interface.

AI may:

- extract fields from messy input
- summarize verified data
- explain ranking outcomes
- flag missing or conflicting evidence

AI may not:

- improvise facts
- replace deterministic scoring
- become the main conversation surface

### 4. Sync Versus Async

Synchronous path:

- submit job
- validate request
- fetch known profile data
- score when enough data is available
- return a draft or final recommendation

Asynchronous path:

- OCR or text extraction from files
- AI field extraction
- market feed refresh
- site brief refresh
- logistics enrichment when external providers are slow
- provider adapter calls for routing, matrix, geocoding, and isoline lookups
- integration state syncing (UpKeep and SafetyCulture webhooks via the job queue)
- batch coordination for bulk submissions, grouped calculations, and aggregate retries

### 5. Multi-Tenant SaaS Integration (Proxy Architecture)

External third-party SaaS tools (e.g., UpKeep and SafetyCulture) will NOT be given independent tenant accounts per third-party user, as this violates our financial and data-isolation constraints. Instead:

- **Headless Proxy:** DFN Discovery serves as the single gatekeeper and authentication layer for all third-party interactions.
- **Provider Account Structure:** We maintain a single master corporate/admin seat on providers like UpKeep and SafetyCulture.
- **Data Isolation:** All inbound and outbound payloads are strictly tagged with our internal `external_factory_id`. Users only see data securely filtered by our backend; they never log in to native vendor tools directly.
- **Abstraction Layer:** Due to API tier limitations (e.g., UpKeep Enterprise tiers), all external CMMS or field-auditing SaaS integration will sit behind an abstraction layer (e.g., `AssetManagerInterface`). If SaaS pricing makes API calls prohibitive, the adapter can be hot-swapped to an open-source or Airtable-backed database without rewriting core business logic.

### 6. Security Architecture

Discovery does not own identity. Discovery trusts identity.

Three decisions are frozen at the HLD level:

**Authentication:** All user-facing routes require a signed JWT issued by the DFN platform identity provider. Discovery validates the token signature via the IdP's JWKS endpoint — stateless, no round-trip per request. Discovery never stores passwords, sessions, or its own tokens.

**Multi-tenancy:** Every resource in Discovery's database is owned by an `org_id`. The `org_id` is derived from the JWT on every request and applied to every database query as a mandatory scope. Cross-org data access is architecturally impossible, not just policy.

**Billing and quotas:** Discovery enforces plan limits but does not own billing logic. Plan tier, feature flags, and quota headroom are carried in the JWT and verified live against the platform billing service only when the token claim is exhausted. Discovery emits usage events to the platform — it never calculates what a user owes.

See [Security Architecture](DFN_SECURITY.md) for the full specification.

### 7. Multi-Stage Process DAGs vs Point-to-Point Matching

Manufacturing in physical reality is rarely a single-shot operation. A complex part (e.g. machined casting or fabricated pressure vessel) requires a multi-stage sequence of discrete operations:

- **Substrate & Raw Material Prep**: Alloy tempers, form factors, Mill Test Certificates (MTCs), etc.
- **Subtractive / Forming Machining**: 3/5-axis CNC, tooling, feeds, speeds, cycle times.
- **Thermal & Surface Treatments**: Vacuum heat treatment, stress relief, anodizing, plating, passivation.
- **Inter-Fab Work-In-Progress (WIP) Logistics**: Environmental degradation risks (corrosion, oxidation in tropical climates), maximum allowable queue times (MQT), intermediate buffer storage, and inter-facility transit routing via HERE services.

Discovery supports both simple point-to-point single-stage matching and **Multi-Stage Process Directed Acyclic Graphs (DAGs)**. Recommendations can be generated for single facilities or **Multi-Factory Clusters** where specialized fabs handle specific stages in the production graph.

See [Multi-Stage Process Routing Architecture](DFN_MULTI_STAGE_PROCESS_ROUTING.md) for the full specification.

### 8. Software Async Batching vs Manufacturing Batch / Lot Planning

To prevent domain confusion:

- **Batch Coordination (`batch_manifests`)**: Operates as a software control-plane and async queuing mechanism (fan-out/fan-in) for bulk API job submissions, worker idempotency, and aggregate progress rollups.
- **Manufacturing Batch / Lot Planning**: Operates inside the Core Intelligence and Process Routing engines to model physical production batching: Minimum Order Quantities (MOQs), machine changeover hours, tooling amortisation, and raw material stock yield optimization.

### 9. Standards & SDO Compliance Engine

Compliance with Standards Development Organizations (SDOs) is a primary gating dimension in manufacturing feasibility:

- **Open SDO Catalog Ingestion**: Indexing metadata across 25 open sources (ISO, IEC, SON/NIS, ARSO, ASTM, ASME, API, DIN, BSI, NACE/AMPP, AWS, etc.).
- **Dual-Track Nigerian Ingestion**: Automated scraping of the Standards Organisation of Nigeria (SON) OPAC catalog (`library.son.gov.ng`) combined with administrative bulk CSV/JSON imports of verified NIS and NCP standards.
- **Commercial Aggregator Roadmap**: Phased integration of paid APIs (Total Materia for materials equivalence across 74 SDOs, Nimonik for EHS compliance, Accuris Engineering Workbench for full-text standards).
- **IAF CertSearch Validation**: Real-time verification of active factory accreditations (ISO 9001, ISO 14001).

See [Standards & SDO Architecture](DFN_STANDARDS_AND_SDO_ARCHITECTURE.md) for the full specification.

## Data Ownership

### Job Intake Owns

- canonical job record
- multi-stage process graph definitions (DAG nodes and transition edges)
- attachments and source metadata
- validation status

### Core Intelligence Owns

- scoring outputs (single-facility and multi-facility cluster scores)
- fit, feasibility, and confidence models
- ranking and chain optimization results

### Standards & SDO Engine Owns

- standards catalog metadata (ISO, SON, ASTM, ASME, API, etc.)
- standard equivalence and cross-reference mappings
- factory certification verification state (IAF CertSearch data)

### Multi-Stage Process Routing Owns

- manufacturing DAG resolution and stage decomposition
- tooling, substrate, feed, and thermal/surface constraint models
- inter-fab WIP transfer rules, environmental preservation constraints, and queue time limits
- cluster chain composition and total landed cost rollups

### AI Workers Own

- structured extraction outputs
- summaries
- explanation drafts
- anomaly flags

### Context Services Own

- logistics estimates
- market signals
- site context

### Geo And Logistics Service Own

- provider adapters for HERE Routing, Matrix Routing, Geocoding & Search, and Isoline APIs
- map layers and route overlays for the presentation layer
- route optimization inputs and outputs
- travel time and distance estimates
- reachability and service-area analysis
- facility proximity analysis
- logistics policy that translates provider outputs into DFN Discovery scoring context

### Market Intelligence Service Own

- demand metrics
- pricing signals
- capacity signals
- access-to-market scoring
- API Integrations: UN Comtrade & World Bank (preferred), SerpApi/GDELT (fallback)

### Batch Coordination Owns

- batch manifests and correlation IDs
- bulk request splitting and child job grouping
- aggregate progress and status rollups
- partial-failure handling and retry grouping
- consolidated batch results for downstream consumers

### Presentation Layer Owns

- user views
- exports
- saved comparisons

## Risks

1. If the canonical schema changes too often, the scoring layer will churn.
2. If AI is allowed to invent missing data, trust collapses fast.
3. If the presentation layer accumulates business logic, the system becomes hard to freeze.
4. If market and logistics data are treated as optional, recommendation quality drops sharply.
5. If auth and multi-tenancy are deferred past the Presentation Layer, retrofitting org scoping across all services and queries becomes high-risk and expensive.

## HLD Freeze Check

Before LLD starts, confirm:

- job schema is stable
- factory profile schema is stable
- Fit Score is the primary score
- AI only runs as a worker
- async boundaries are agreed
- batch coordination boundaries are agreed
- authentication boundary agreed: Discovery trusts the platform IdP, does not own identity
- multi-tenancy model agreed: org_id on every resource, enforced at query level
- billing boundary agreed: Discovery enforces quotas, platform owns billing logic
