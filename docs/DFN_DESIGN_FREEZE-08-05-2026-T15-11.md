# DFN Discovery - Design Freeze Checkpoint
**Date: May 8, 2026**
**Status: Scaffolding Complete - Ready for Full Service Implementation**

---

## Executive Summary

This document captures the scaffolded architectural freeze for the DFN Discovery system as of the scaffolding phase. All service boundaries, API contracts, database schemas, and implementation specifications are frozen. The codebase has complete type definitions, interface contracts, route stubs, and TODO markers for implementation.

**What's Frozen:**
- ✅ 7 service boundaries and responsibilities
- ✅ 5 database tables and Drizzle ORM schema
- ✅ AI provider abstraction with 3 implementations (OpenAI, Anthropic, Google)
- ✅ 15+ API routes with full route stubs
- ✅ 7 queue job types with payloads and configuration
- ✅ All TypeScript interfaces and types
- ✅ All service class definitions with method signatures

**What's Next (Full Implementation):**
- 🔄 Implement all service methods (currently throwing "Not implemented")
- 🔄 Implement all API route handlers
- 🔄 Implement queue worker handlers
- 🔄 Implement database persistence and queries
- 🔄 Add comprehensive error handling and validation
- 🔄 Add authentication/authorization middleware
- 🔄 Add monitoring, logging, and observability

---

## Architecture Overview

```
Request Flow:
Job Submission → Job Intake → Queue Enqueue → Worker Dispatch → Analysis Workers → Intelligence Services → Presentation → Response

Service Layers:
1. Job Intake (Sync) - Validates, normalizes, creates job
2. Queue Worker (Async Orchestrator) - Manages job queue and worker dispatch
3. AI Analysis Workers - Extraction, summarization, explanation
4. Core Intelligence - Scoring and recommendation ranking
5. Enrichment Services (Parallel):
   - Geo & Logistics - Distance, routing, lead time
   - Market Intelligence - Demand, pricing, reputation
   - Site & Real Estate - Facility specs, certification, availability
6. Presentation Layer - Formats recommendations for UI
7. Shared Infrastructure - Database, Redis, Types, Constants
```

---

## Service Boundaries & Implementations

### 1. **Job Intake Service** ✅ FULLY IMPLEMENTED
**File:** `backend/src/services/job-intake.ts`

**Status:** Scaffolded with validation, normalization, and database operations

**Methods:**
- `validateJobInput(input)` - Validates required fields (company_name, product_name, location)
- `normalizeJobInput(input)` - Trims strings, prepares for database
- `createJob(input)` - Inserts to jobs table, returns Job with UUID, status='draft'
- `submitJob(jobId)` - Transitions to 'submitted', validates data, increments version
- `getJob(jobId)` - Queries jobs table, returns full Job
- `updateJobStatus(jobId, status)` - Updates status and version

**Database:** Uses Drizzle ORM with jobs table

**API Route:** [backend/src/routes/jobs.ts](backend/src/routes/jobs.ts)
- `POST /jobs` - Create job
- `GET /jobs/:jobId` - Get job
- `POST /jobs/:jobId/submit` - Submit job
- `GET /jobs/:jobId/recommendation` - Placeholder for recommendation retrieval

**Next Implementation:** On submit, enqueue 'classify-job' queue item

---

### 2. **AI Analysis Workers Service** 🔄 SCAFFOLDED
**File:** `backend/src/services/ai-analysis-workers.ts`

**Status:** Interface defined, 3 adapter classes stubbed, methods need implementation

**Methods:**
- `extractJobData(request)` - Extract structured data from attachments, confidence scoring
- `summarizeEvidence(request)` - Summarize findings, respect max length
- `explainRecommendation(request)` - Generate detailed explanations with key points
- `validateApiKey()` - Verify API credentials work
- `getUsageMetrics()` - Return token usage and cost data

**AI Provider Adapters:** [backend/src/services/ai-providers/adapter.ts](backend/src/services/ai-providers/adapter.ts)
- `OpenAIAdapter` - Calls gpt-4o/gpt-4-turbo/gpt-3.5-turbo
- `AnthropicAdapter` - Calls claude-3-5-sonnet/claude-3-opus/claude-3-sonnet/claude-3-haiku
- `GoogleAdapter` - Calls gemini-2.0-flash/gemini-1.5-pro/gemini-1.5-flash

**Model Registry:** [backend/src/services/ai-providers/model-registry.ts](backend/src/services/ai-providers/model-registry.ts)
- 9 models with metadata (context window, pricing, release date)
- `getModelsByProvider(provider)` - Filter by provider
- `getModelById(id)` - Lookup single model
- `getDefaultModelForProvider(provider)` - Recommended model per provider

**Model Discovery API:** [backend/src/routes/models.ts](backend/src/routes/models.ts)
- `GET /providers` - List all providers
- `GET /models` - List all models or filter by provider
- `GET /models/:modelId` - Get specific model details
- `GET /providers/:provider/default-model` - Get recommended model
- `POST /models/filter` - Advanced filtering (context window, cost, deprecated)

**Implementation TODOs:**
1. Install SDK packages: `openai`, `@anthropic-ai/sdk`, `@google/generativeai`
2. Implement `extract()` - Prompt engineering for consistent JSON output
3. Implement `summarize()` - Respect max length constraints
4. Implement `explain()` - Attribution to evidence, key points
5. Implement `validateApiKey()` - Make test API call, cache result
6. Add retry logic with exponential backoff
7. Add token tracking for cost optimization

**API Route:** [backend/src/routes/extraction.ts](backend/src/routes/extraction.ts)
- `POST /extraction/extract-job-data` - Extract from job
- `POST /extraction/summarize-evidence` - Summarize findings
- `POST /extraction/explain-recommendation` - Generate explanation
- `GET /extraction/validate-api-key` - Validate credentials

---

### 3. **Core Intelligence Service** 🔄 SCAFFOLDED
**File:** `backend/src/services/core-intelligence.ts`

**Status:** Class interface defined, methods stubbed

**Methods:**
- `scoreJob(input)` - Compute fit/feasibility scores with component breakdown
- `rankRecommendations(results)` - Sort by fit, apply gate rules
- `computeComponentScore(component, job, factory, evidence)` - Individual component scoring
- `applyConfidencePenalty(score, missingCount)` - Reduce score for incomplete data
- `checkGateRules(result, stage)` - Validate against gate rules

**Scoring Formula:**
```
Fit Score = Weighted sum of components (0-100)
  ProcessMatch: 0.25
  MaterialMatch: 0.20
  CapacityMatch: 0.15
  GeographyAndLogistics: 0.20
  MarketAccess: 0.10
  EvidenceConfidence: 0.10

Confidence Penalty: baseScore * (1 - 0.15 * missingComponentCount)
Feasibility Score: CapacityMatch + GeographyAndLogistics
```

**Gate Rules:**
- Draft stage: confidence ≥ 30
- Final stage: confidence ≥ 60
- Always: ≥ 1 factory, ≥ 1 evidence item per factory

**Output Types:**
```typescript
ScoringResult {
  recommendationId: string;
  jobId: string;
  factoryId: string;
  fitScore: number; // 0-100
  feasibilityScore: number; // 0-100
  confidenceScore: number;
  componentScores: {...};
  evidenceCount: number;
  confidencePenalty: number;
  gatePassed: boolean;
  gateFailureReason?: string;
  rank: number;
}
```

**Implementation TODOs:**
1. Implement component scoring deterministic logic
2. Implement confidence penalty calculation
3. Implement gate rule checking
4. Integrate with Geo/Logistics for geography component
5. Integrate with Market Intelligence for market access component
6. Add provenance tracking (why each component scored as it did)
7. Cache component scores for debugging

**API Route:** [backend/src/routes/scoring.ts](backend/src/routes/scoring.ts)
- `POST /scoring/score-job` - Score against all or specified factories
- `POST /scoring/rank-recommendations` - Rank and filter results
- `GET /scoring/job-score/:jobId` - Get current scores
- `GET /scoring/component-analysis/:jobId/:factoryId` - Debug component breakdown

---

### 4. **Geo & Logistics Service** 🔄 SCAFFOLDED
**File:** `backend/src/services/geo-logistics.ts`

**Status:** Interface defined, methods stubbed

**Methods:**
- `assessLogistics(job, factory)` - Calculate distance, lead time, transport mode, cost
- `computeLogisticsFeasibilityScore(job, assessment)` - Score 0-100
- `estimateLeadTime(assessment)` - Return business days

**Output Types:**
```typescript
LogisticsAssessment {
  distance_km: number;
  estimated_lead_days: number;
  transport_modes: string[]; // 'road', 'rail', 'air', 'sea'
  primary_mode: string;
  routing_cost_estimate_ngn: number;
  border_crossings: number;
  regulatory_constraints: string[];
  feasible: boolean;
  feasibility_confidence: number; // 0-100
}
```

**Implementation TODOs:**
1. Implement distance calculation (Google Maps API or deterministic formula based on lat/long)
2. Determine transport mode based on distance and volume
3. Calculate lead time: distance/mode_speed + customs_processing + factory_time
4. Estimate routing cost based on volume, distance, mode
5. Identify border crossings (state/country boundaries)
6. Flag regulatory constraints (import duties, documentation)
7. Cache results with TTL to avoid repeated API calls
8. Integrate with external mapping provider (optional)

**Feasibility Score Formula:**
```
Base: 100 - (distance_km / 1000) * 10
Penalty for lead time > 14 days: -15 points
Penalty for high cost (>15% of manufacturing): -10 points
Bonus for no border crossing: +5 points
Normalize to 0-100
```

**API Route:** [backend/src/routes/enrichment.ts](backend/src/routes/enrichment.ts)
- `POST /enrichment/logistics-assessment` - Assess logistics

---

### 5. **Market Intelligence Service** 🔄 SCAFFOLDED
**File:** `backend/src/services/market-intelligence.ts`

**Status:** Interface defined, methods stubbed

**Methods:**
- `getMarketSignals(factory, productType)` - Demand, pricing, reputation, order frequency
- `computeMarketAccessScore(signals)` - Score 0-100
- `getMarketOutlook(productType)` - Trend narrative and confidence

**Output Types:**
```typescript
MarketSignals {
  product_demand_trend: 'increasing' | 'stable' | 'decreasing';
  demand_confidence: number; // 0-100
  estimated_market_size_annual_ngn: number;
  estimated_price_range_per_unit_ngn: [min, max];
  factory_market_share_percent: number; // 0-100
  factory_order_frequency_per_month: number;
  factory_reputation_score: number; // 0-100
  recent_price_trend: 'up' | 'stable' | 'down';
}
```

**Implementation TODOs:**
1. Query market database or API for product demand
2. Retrieve factory historical order frequency
3. Calculate factory market share (orders / market total)
4. Get pricing data for product category
5. Assess factory reputation from reviews/feedback
6. Cache market data with 24-hour TTL
7. Support trend analysis over time
8. Handle missing data gracefully (defaults)

**Market Access Score Formula:**
```
Base: 50 + demand_trend * 20
Bonus for high frequency (>5/month): +15 points
Bonus for strong reputation (>75): +10 points
Penalty for declining price: -10 points
Bonus for market leader (>10% share): +10 points
Normalize to 0-100
```

**API Route:** [backend/src/routes/enrichment.ts](backend/src/routes/enrichment.ts)
- `GET /enrichment/market-signals/:factoryId` - Get market signals
- `GET /enrichment/market-outlook` - Get product outlook

---

### 6. **Site & Real Estate Service** 🔄 SCAFFOLDED
**File:** `backend/src/services/site-realestate.ts`

**Status:** Interface defined, methods stubbed

**Methods:**
- `generateSiteBrief(factory)` - Comprehensive facility brief
- `assessFacilityCondition(brief)` - Condition score and risk level
- `getSiteVisitReport(factory)` - Most recent visit summary
- `checkFacilityAvailability(factory, requiredCapacity, requiredLead)` - Availability assessment

**Output Types:**
```typescript
SiteBrief {
  facility_id: string;
  facility_name: string;
  facility_size_sqft: number;
  facility_age_years: number;
  facility_condition: 'excellent' | 'good' | 'fair' | 'poor';
  equipment_age_years: number;
  certifications: string[];
  compliance_status: 'fully_compliant' | 'mostly_compliant' | 'non_compliant';
  capacity_utilization_percent: number;
  expansion_planned: boolean;
  expansion_timeline_months?: number;
  last_site_visit_date: string;
  site_visit_confidence: number;
  environmental_permits: boolean;
  labor_availability_assessment: string;
}
```

**Implementation TODOs:**
1. Query facility database for specifications
2. Get certification status from compliance tracking
3. Retrieve most recent site visit report
4. Calculate equipment depreciation (age)
5. Assess capacity utilization from production logs
6. Check for planned expansions from capital projects
7. Validate data freshness (warn if visit >12 months old)
8. Handle missing data (use last-known or placeholder)

**Facility Condition Score Formula:**
```
Base: 50 + condition_score * 10
Bonus for modern equipment (age < 5 years): +15 points
Bonus for full compliance: +10 points
Penalty for non-compliance: -20 points
Bonus for low utilization (<60%): +10 points
Bonus for planned expansion: +10 points
Normalize to 0-100
```

**API Route:** [backend/src/routes/enrichment.ts](backend/src/routes/enrichment.ts)
- `GET /enrichment/site-brief/:factoryId` - Get facility brief
- `GET /enrichment/site-visit-report/:factoryId` - Get visit report
- `POST /enrichment/check-availability` - Check availability

---

### 7. **Presentation Layer Service** 🔄 SCAFFOLDED
**File:** `backend/src/services/presentation-layer.ts`

**Status:** Interface defined, methods stubbed

**Methods:**
- `formatRecommendation(scoringResult, job)` - Format for UI display
- `formatRecommendationSummary(job, recommendations)` - Dashboard summary
- `generateExplanation(result, job, style)` - Natural language explanation
- `generateDetailedReport(summary, recommendations)` - HTML/PDF report
- `mapConfidenceLevel(score)` - Map to 'low' | 'medium' | 'high'
- `mapFitDescription(score)` - Map to fit level description

**Output Types:**
```typescript
RecommendationPresentation {
  recommendationId: string;
  jobId: string;
  rank: number;
  factoryName: string;
  fitScore: number;
  feasibilityScore: number;
  confidenceLevel: 'low' | 'medium' | 'high';
  fitDescription: string;
  keyStrengths: string[];
  keyRisks: string[];
  leadTimeEstimate: string;
  costAssessment: string;
  nextSteps: string[];
  detailedExplanation: string;
  evidenceHighlights: { source, claim, confidence }[];
}
```

**Implementation TODOs:**
1. Map fit scores to descriptions (0-40: poor, 40-60: fair, 60-80: good, 80-100: excellent)
2. Map confidence scores to levels (0-30: low, 30-60: medium, 60-100: high)
3. Generate strengths narrative from high component scores
4. Generate risks narrative from low scores
5. Call Geo/Logistics for lead time
6. Call Market Intelligence for cost positioning
7. Call Site/Real Estate for facility quality
8. Call AI service for detailed explanations
9. Format for responsive UI (mobile + desktop)
10. Include actionable next steps
11. Generate comparative analysis across factories
12. Support multiple explanation styles (executive, technical, detailed)
13. Generate HTML reports ready for PDF conversion

**API Route:** [backend/src/routes/recommendations.ts](backend/src/routes/recommendations.ts)
- `GET /recommendations/:jobId` - Get formatted recommendations
- `GET /recommendations/:jobId/top` - Get top recommendation
- `GET /recommendations/:jobId/:factoryId/explanation` - Get detailed explanation
- `GET /recommendations/:jobId/report` - Generate report
- `GET /recommendations/:jobId/comparison` - Compare top factories

---

## Queue System (Async Job Processing)

**File:** `backend/src/types/queue.ts` & `backend/src/services/queue-worker.ts`

**Status:** Types defined, queue constants configured, worker service scaffolded

**Job Types (7 Total):**
1. `classify-job` - Classify and normalize job data
2. `extract-evidence` - Extract structured data from attachments
3. `score-fit` - Score job against factories
4. `enrich-logistics` - Calculate distance and logistics
5. `refresh-market-signals` - Get market data
6. `refresh-site-brief` - Get facility data
7. `generate-recommendation-brief` - Format recommendations

**Processing Flow:**
```
submit-job
  ↓
enqueue: classify-job
  ↓ (on complete)
enqueue: extract-evidence
  ↓ (on complete)
enqueue: score-fit
  ↓ (on complete)
enqueue (parallel): enrich-logistics, refresh-market-signals, refresh-site-brief
  ↓ (all complete)
enqueue: generate-recommendation-brief
  ↓ (on complete)
job status = 'recommended'
```

**Queue Configuration:**
```typescript
QUEUE_CONFIG {
  DEFAULT_MAX_RETRIES: 3
  DEFAULT_RETRY_DELAY_MS: 1000
  EXPONENTIAL_BACKOFF_MULTIPLIER: 2
  
  Job timeouts:
    classify-job: 30s
    extract-evidence: 2min (AI can be slow)
    score-fit: 1min
    enrich-*: 30s
    generate-brief: 1min
  
  Concurrency limits:
    classify-job: 4 workers
    extract-evidence: 2 workers (AI rate limits)
    score-fit: 4 workers
    enrich-*: 4 workers each
    generate-brief: 4 workers
  
  Priorities:
    classify-job: 10 (highest)
    extract-evidence: 8
    score-fit: 5
    enrich-*: 3
    generate-brief: 2 (lowest)
}
```

**Queue Worker Methods:**
- `enqueueJob(type, jobId, payload, version)` - Idempotent enqueue with versioning
- `processQueueJob(queueJobId)` - Dispatch to handler
- `markQueueJobComplete(queueJobId, result)` - Mark done, enqueue next
- `markQueueJobFailed(queueJobId, error)` - Retry or fail
- `getQueueJobStatus(queueJobId)` - Get job details
- `getJobQueueStatus(jobId)` - Get all jobs for DFN job
- `replayQueueJob(queueJobId, resetPayload)` - Manual replay

**Worker Handlers (Stubs):**
- `classifyJobWorker(payload)`
- `extractEvidenceWorker(payload)`
- `scoreFitWorker(payload)`
- `enrichLogisticsWorker(payload)`
- `refreshMarketSignalsWorker(payload)`
- `refreshSiteBriefWorker(payload)`
- `generateRecommendationBriefWorker(payload)`

**API Route:** [backend/src/routes/queue.ts](backend/src/routes/queue.ts)
- `GET /queue/job/:jobId` - Get all queue jobs for job
- `GET /queue/job/:jobId/progress` - Get overall progress
- `GET /queue/:queueJobId` - Get specific queue job status
- `POST /queue/:queueJobId/replay` - Replay a job
- `GET /queue/stats` - Queue health metrics

---

## Database Schema (Frozen)

**File:** `backend/src/db/schema.ts`

**Tables:**

### `jobs` Table
```typescript
{
  id: uuid, primary key
  company_name: string
  product_name: string
  process_type: string
  material_type: string
  volume_band: string
  location: string
  status: enum (draft, submitted, normalized, analyzing, scored, recommended, published, archived, validation_failed, analysis_failed, scoring_failed, stale_data)
  version: integer (incremented on each update)
  metadata: json (extensible)
  created_at: timestamp
  updated_at: timestamp
}
```

### `factories` Table
```typescript
{
  id: uuid, primary key
  name: string
  location: string
  capabilities: json (processes[], materials[], capacity_band)
  certifications: string[]
  contact_email: string
  metadata: json
  created_at: timestamp
  updated_at: timestamp
}
```

### `recommendations` Table
```typescript
{
  id: uuid, primary key
  job_id: uuid, foreign key → jobs
  factory_id: uuid, foreign key → factories
  fit_score: float (0-100)
  feasibility_score: float (0-100)
  confidence_score: float (0-100)
  rank: integer
  evidence: json (EvidenceItem[])
  component_scores: json
  status: enum (draft, final, archived)
  created_at: timestamp
  updated_at: timestamp
}
```

### `attachments` Table
```typescript
{
  id: uuid, primary key
  job_id: uuid, foreign key → jobs
  file_name: string
  file_type: string
  file_size_bytes: integer
  storage_path: string
  extracted_content: json
  created_at: timestamp
}
```

### `job_queue` Table
```typescript
{
  id: uuid, primary key
  job_id: uuid, foreign key → jobs
  type: enum (classify-job, extract-evidence, score-fit, enrich-logistics, refresh-market-signals, refresh-site-brief, generate-recommendation-brief)
  payload: json
  status: enum (queued, processing, completed, failed)
  result: json
  error: string
  retries: integer
  max_retries: integer
  created_at: timestamp
  started_at: timestamp
  completed_at: timestamp
  failed_at: timestamp
  version: integer (for idempotency)
}
```

---

## API Route Map (Complete)

### Job Management (`/jobs`)
- `POST /jobs` - Create job
- `GET /jobs/:jobId` - Get job
- `POST /jobs/:jobId/submit` - Submit job
- `GET /jobs/:jobId/recommendation` - Get recommendations

### Model Discovery (`/models`)
- `GET /models/providers` - List providers
- `GET /models` - List all models
- `GET /models/:modelId` - Get model details
- `GET /models/providers/:provider/default-model` - Get default
- `POST /models/filter` - Advanced filtering

### AI Extraction (`/extraction`)
- `POST /extraction/extract-job-data` - Extract structured data
- `POST /extraction/summarize-evidence` - Summarize findings
- `POST /extraction/explain-recommendation` - Generate explanation
- `GET /extraction/validate-api-key` - Validate credentials

### Scoring (`/scoring`)
- `POST /scoring/score-job` - Score job against factories
- `POST /scoring/rank-recommendations` - Rank results
- `GET /scoring/job-score/:jobId` - Get current scores
- `GET /scoring/component-analysis/:jobId/:factoryId` - Debug component breakdown

### Enrichment (`/enrichment`)
- `POST /enrichment/logistics-assessment` - Assess logistics
- `GET /enrichment/market-signals/:factoryId` - Get market data
- `GET /enrichment/market-outlook` - Get product outlook
- `GET /enrichment/site-brief/:factoryId` - Get facility brief
- `GET /enrichment/site-visit-report/:factoryId` - Get visit report
- `POST /enrichment/check-availability` - Check capacity/lead time

### Recommendations (`/recommendations`)
- `GET /recommendations/:jobId` - Get all recommendations
- `GET /recommendations/:jobId/top` - Get top recommendation
- `GET /recommendations/:jobId/:factoryId/explanation` - Get explanation
- `GET /recommendations/:jobId/report` - Generate report
- `GET /recommendations/:jobId/comparison` - Compare factories

### Queue Management (`/queue`)
- `GET /queue/job/:jobId` - Get all queue jobs for job
- `GET /queue/job/:jobId/progress` - Get progress
- `GET /queue/:queueJobId` - Get queue job status
- `POST /queue/:queueJobId/replay` - Replay job
- `GET /queue/stats` - Queue health

---

## Implementation Priority

### Phase 1 (Critical Path)
1. ✅ Job Intake - COMPLETE
2. 🔄 AI Provider Adapters - Extract, summarize, explain methods
3. 🔄 Core Intelligence - Scoring and ranking
4. 🔄 Queue Worker - Job dispatch and retry logic

### Phase 2 (Enrichment Services)
5. 🔄 Geo & Logistics - Distance and routing
6. 🔄 Market Intelligence - Demand and pricing
7. 🔄 Site & Real Estate - Facility data

### Phase 3 (Presentation & Polish)
8. 🔄 Presentation Layer - Format and reports
9. 🔄 Frontend UI - Job submission, recommendations display
10. 🔄 Testing & Integration - E2E tests, deployment pipeline

---

## Known Gaps & Future Enhancements

**Out of Scope (Phase 1):**
- [ ] Authentication & authorization middleware
- [ ] API rate limiting and DDoS protection
- [ ] Database backup and disaster recovery
- [ ] Data encryption at rest
- [ ] Audit logging and compliance
- [ ] Multi-tenant support
- [ ] Advanced analytics and reporting
- [ ] Mobile app support

**External Integrations (TBD):**
- [ ] Google Maps API for distance calculation
- [ ] Market data feeds (optional, can use deterministic data)
- [ ] Satellite imagery for facility verification (optional)
- [ ] Integration with main DFN repo (auth and contracts defined in [DFN_MAIN_REPO_INTEGRATION.md](DFN_MAIN_REPO_INTEGRATION.md))

---

## Deployment Checklist

- [ ] Environment variables configured (.env file)
- [ ] Database migrations applied
- [ ] Redis configured for queue
- [ ] AI provider API keys set
- [ ] Backend server listening on port 5000
- [ ] Frontend pointing to correct API_URL
- [ ] Error handling middleware active
- [ ] Health check endpoint responding
- [ ] All routes returning "Not implemented" until methods coded

---

## Next Steps: Full Service Implementation

1. **Implement AI Adapters** (Week 1)
   - Install SDK packages
   - Implement extract/summarize/explain for each provider
   - Add retry logic and token tracking

2. **Implement Core Intelligence** (Week 2)
   - Scoring formula with component calculation
   - Confidence penalty logic
   - Gate rule validation

3. **Implement Queue Worker** (Week 2)
   - Database persistence for queue jobs
   - Worker dispatch and handler routing
   - Retry logic with exponential backoff

4. **Implement Enrichment Services** (Week 3)
   - Geo/Logistics calculations
   - Market Intelligence queries
   - Site/Real Estate lookups

5. **Implement Presentation Layer** (Week 3)
   - Format scoring results for UI
   - Generate explanations and reports
   - Build recommendation cards

6. **Frontend Development** (Week 4)
   - Job submission form
   - Recommendations display
   - Status tracking

7. **Testing & Polish** (Week 4)
   - E2E tests
   - Performance optimization
   - Error handling refinement

---

**Document Version:** 1.0  
**Last Updated:** May 8, 2026  
**Reviewed By:** Architecture Team  
**Status:** FROZEN - Ready for Implementation
