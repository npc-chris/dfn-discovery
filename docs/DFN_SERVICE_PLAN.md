# DFN Discovery Service Plan

## Product Wedge

The product should answer one question first: can a Nigerian factory or multi-factory supply chain cluster realistically take this manufacturing job, at what cost, in what time, with what standard compliance, and with what operational risk?

Everything else should support that decision.

## Keep, Split, Or Drop

### Keep As Core

1. **Multi-Stage Process Routing & Cluster Analysis**: Deconstructing manufacturing jobs into Directed Acyclic Graphs (DAGs) to route complex multi-operation jobs across specialized factory clusters (forming, CNC machining, heat treat, surface finishing).
2. **Standards & SDO Compliance Engine**: Ingesting metadata across 25 open SDOs (ISO, SON/NIS, ARSO, ASTM, ASME, API, etc.) and verifying active accreditations via IAF CertSearch.
3. **Survey and research-backed insights**: Data provenance and verified facility profiles.
4. **Market metrics and demand/access signals**: Aggregated trade and capacity data.
5. **Mapping for factory, supplier, and inter-fab logistics context**: HERE provider adapters for matrix routing, road condition risk, and WIP preservation during transit.
6. **Structured AI analysis and recommendation layer**: Deterministic scoring augmented by structured extraction and evidence explanation.

These are the spine of the product. They directly help a product team, operator, or investor decide where work should go.

### Keep, But Split Into Separate Modules

1. **Logistics route optimization & Inter-Fab WIP matrices**: Separatable HERE provider adapters.
2. **Real estate briefs & Field Auditing Proxies**: UpKeep CMMS and SafetyCulture integration layer.
3. **Access and network intelligence**: Cluster density and regional manufacturing gap analysis.

These are decision-support modules that consume core data and should not pollute core matching.

### Defer For Later Phases

1. Partner dashboards.
2. Automated outreach and CRM-like workflows.
3. Advanced scenario planning and predictive forecasting.
4. Deep operational workflow management (MES) for internal factory floors.
5. Commercial full-text standard aggregators (Accuris, Total Materia) until scale mandates them.

### Drop Or Avoid For Now

1. Generic chat that does not feed a decision.
2. Broad marketplace features with no scoring or verification.
3. Unrelated admin tooling.
4. Social/community features that do not improve matching, routing, or site selection.

---

## Proposed Service Boundaries

### 1. Core Intelligence Service
The central decision engine.
- Owns: Manufacturing process taxonomy, material compatibility rules, capability scoring, confidence scoring, single-factory and multi-factory recommendation ranking.

### 2. Standards & SDO Ingestion Service
Maintains the engineering specifications and trust baseline.
- Owns: Ingestion pipelines for 25 open SDOs, SON OPAC automated scraper (`library.son.gov.ng`), administrative bulk NIS imports, cross-reference mapping (e.g., NIS 102 $\leftrightarrow$ ASTM A36), and real-time IAF CertSearch validation.

### 3. Multi-Stage Process Routing Service
Orchestrates complex manufacturing workflows.
- Owns: Process DAG parsing, substrate/temper constraints, tooling & feed/speed limits, thermal/surface treatment rules, inter-stage WIP transitions, Maximum Allowable Queue Times (MQT), and tropical humidity preservation rules.

### 4. Data Ingestion Service
- Owns: Survey collection, research imports, partner uploads, normalization, and source provenance.

### 5. Geo And Logistics Service
- Owns: Provider adapters for HERE Routing, Matrix Routing, Geocoding & Search, and Isoline APIs; inter-fab transit matrix calculation; road vibration risk scoring; buffer warehouse sizing; logistics policy.

### 6. Market Intelligence Service
- Owns: Demand metrics, pricing signals, capacity signals, access-to-market scoring (UN Comtrade / World Bank).

### 7. Site And Real-Estate Intelligence Service
- Owns: Location briefs, facility fit analysis, field audit webhook ingestion (UpKeep & SafetyCulture).

### 8. Software Batch Coordination Service
- Owns: Batch manifests, API bulk submission splitting, async queue worker fan-out/fan-in, idempotency keys, progress rollups (software execution control plane).

### 9. Presentation And Workflow Layer
- Owns: Dashboards, reports, exports, saved comparisons, multi-stage DAG chain visualizers.

---

## Recommended Build Order

1. **Core Intelligence Service & Canonical Schemas**: Establish deterministic scoring for single-stage and multi-stage DAG jobs.
2. **Standards & SDO Ingestion Engine**: Index open SDO metadata (ISO, SON OPAC, ASTM, API) and IAF CertSearch factory verification.
3. **Data Ingestion & Provenance**: Canonical job and factory profile intake.
4. **Geo & Logistics Service with HERE Adapters**: Single-route and multi-stop inter-fab matrix transit calculation.
5. **Multi-Stage Process Routing & Cluster Matching**: Solve end-to-end multi-factory production chains with WIP logistics penalties.
6. **Market & Site Intelligence**: Ingest UN Comtrade signals and SafetyCulture/UpKeep audit webhooks.
7. **Presentation Layer & Reports**: Render headline chain fit scores, stage-by-stage engineering breakdowns, and exportable briefs.

---

## Integration Decision

DFN Discovery is implemented as a standalone application and service boundary.

It integrates with the main DFN repository only through explicit contracts:
- shared authentication identity and role claims (JWT via JWKS)
- versioned API clients and type definitions
- webhook or event payloads for async updates
- optional shared UI tokens or primitives if packaged separately

---

## AI Strategy

AI is not the product surface; it is the worker that turns messy technical documents and drawings into structured fields:
1. Classify manufacturing requests into process, material, and complexity buckets.
2. Extract technical clauses and tolerances from drawings and specifications.
3. Summarize factory capabilities and site briefs into decision briefs.
4. Explain multi-factory chain tradeoffs in plain engineering language.
5. Generate recommendations only after the deterministic scoring and standards gating layers have evaluated the data.
