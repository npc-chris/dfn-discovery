# DFN Discovery - Implementation Checklist

**Status:** Phase 6 Complete ✅ - Ready for Phase 7 Security Hardening  
**Last Updated:** July 4, 2026  

---

## Phase 0: Scaffolding Complete ✅

- [x] 7 Service boundaries defined with interfaces
- [x] 5 Database tables with Drizzle ORM schema
- [x] 26 API routes scaffolded with stubs
- [x] 7 Queue job types configured
- [x] Job Intake service fully implemented
- [x] AI Provider abstraction with factory pattern
- [x] Type system frozen
- [x] Design Freeze documentation complete
- [x] Implementation Validation complete

**Status: PASS** - Ready to proceed to Phase 1

---

## Phase 1: AI Provider Adapters (Week 1)

**Goal:** Enable AI extraction, summarization, and explanation for all three providers

### Task 1.1: Install Dependencies

- [x] `npm install openai` (OpenAI SDK)
- [x] `npm install @anthropic-ai/sdk` (Anthropic SDK)
- [x] `npm install @google/genai` (Google SDK)
- [x] Verify all SDKs import correctly in TypeScript
- [x] Add SDK types to tsconfig
- [x] Document SDK versions in package.json

**Files:** backend/package.json

**Acceptance Criteria:**

- All SDKs install without conflicts
- TypeScript compilation succeeds
- No import errors

---

### Task 1.2: OpenAI Adapter Implementation

- [x] Implement `OpenAIAdapter.extract()`
  - [x] Call gpt-4o endpoint
  - [x] Handle auth with OPENAI_API_KEY
  - [x] Parse JSON response
  - [x] Return AIExtractionResponse
  - [x] Include token usage metrics
- [x] Implement `OpenAIAdapter.summarize()`
  - [x] Call gpt-4o endpoint
  - [x] Respect maxLength parameter
  - [x] Return AISummarizationResponse
  - [x] Track token usage
- [x] Implement `OpenAIAdapter.explain()`
  - [x] Call gpt-4o endpoint
  - [x] Generate key points array
  - [x] Return AIExplanationResponse
  - [x] Include confidence scoring
- [x] Implement `OpenAIAdapter.validateApiKey()`
  - [x] Make test API call
  - [ ] Cache result with 1-hour TTL
  - [x] Return boolean
- [x] Add error handling
  - [x] Handle rate limits (retry with backoff)
  - [x] Handle auth errors
  - [x] Handle timeout errors
  - [x] Throw AppError with proper statusCode

**Files:** backend/src/services/ai-providers/adapter.ts

**Acceptance Criteria:**

- All 4 methods implemented and throw no errors
- Token counting working
- Rate limit handling implemented
- Tests pass with mock API responses

---

### Task 1.3: Anthropic Adapter Implementation

- [x] Implement `AnthropicAdapter.extract()`
  - [x] Call claude-3-5-sonnet endpoint
  - [x] Handle auth with ANTHROPIC_API_KEY
  - [x] Parse JSON response
  - [x] Return AIExtractionResponse
  - [x] Include token usage metrics
- [x] Implement `AnthropicAdapter.summarize()`
  - [x] Call claude endpoint
  - [x] Respect maxLength parameter
  - [x] Return AISummarizationResponse
  - [x] Track token usage
- [x] Implement `AnthropicAdapter.explain()`
  - [x] Call claude endpoint
  - [x] Generate key points array
  - [x] Return AIExplanationResponse
  - [x] Include confidence scoring
- [x] Implement `AnthropicAdapter.validateApiKey()`
  - [x] Make test API call
  - [ ] Cache result with 1-hour TTL
  - [x] Return boolean
- [x] Add error handling
  - [x] Handle rate limits
  - [x] Handle auth errors
  - [x] Handle timeout errors

**Files:** backend/src/services/ai-providers/adapter.ts

**Acceptance Criteria:**

- All 4 methods implemented
- Token counting working
- Compatible with Anthropic API v1 format
- Tests pass

---

### Task 1.4: Google Adapter Implementation

- [x] Implement `GoogleAdapter.extract()`
  - [x] Call gemini-3.1-flash endpoint
  - [x] Handle auth with GOOGLE_API_KEY
  - [x] Parse JSON response
  - [x] Return AIExtractionResponse
  - [x] Include token usage metrics
- [x] Implement `GoogleAdapter.summarize()`
  - [x] Call gemini endpoint
  - [x] Respect maxLength parameter
  - [x] Return AISummarizationResponse
  - [x] Track token usage
- [x] Implement `GoogleAdapter.explain()`
  - [x] Call gemini endpoint
  - [x] Generate key points array
  - [x] Return AIExplanationResponse
  - [x] Include confidence scoring
- [x] Implement `GoogleAdapter.validateApiKey()`
  - [x] Make test API call
  - [ ] Cache result with 1-hour TTL
  - [x] Return boolean
- [x] Add error handling
  - [x] Handle rate limits
  - [x] Handle auth errors
  - [x] Handle timeout errors

**Files:** backend/src/services/ai-providers/adapter.ts

**Acceptance Criteria:**

- All 4 methods implemented
- Token counting working
- Compatible with Google Generative AI format
- Tests pass

---

### Task 1.5: AI Analysis Workers Implementation

- [x] Implement extraction worker method
  - [x] Dispatch to adapter based on AI_PROVIDER env var
  - [x] Pass sanitized job payload
  - [x] Return structured extraction response
  - [x] Handle provider-specific errors
- [x] Implement summarization worker method
  - [x] Dispatch to selected provider
  - [x] Handle length constraints
  - [x] Return summary response
- [x] Implement explanation worker method
  - [x] Dispatch to selected provider
  - [x] Generate human-readable narrative
  - [x] Include key points
  - [x] Return explanation response
- [x] Implement usage metrics tracking
  - [x] Aggregate tokens across all operations
  - [x] Calculate costs based on provider pricing
  - [x] Support cost forecasting

**Files:** backend/src/services/ai-analysis-workers.ts

**Acceptance Criteria:**

- All methods implemented
- Adapter dispatch working
- Error handling in place
- Unit tests pass

---

### Task 1.6: Extraction Routes Implementation

- [x] POST /extraction/extract-job-data
  - [x] Parse request body (jobId, jobData, instructions)
  - [x] Call AI Analysis Workers
  - [x] Return AIExtractionResponse
  - [x] Handle errors
- [x] POST /extraction/summarize-evidence
  - [x] Parse request (content, maxLength)
  - [x] Call AI Analysis Workers
  - [x] Return AISummarizationResponse
- [x] POST /extraction/explain-recommendation
  - [x] Parse request (scenario, context)
  - [x] Call AI Analysis Workers
  - [x] Return AIExplanationResponse
- [x] GET /extraction/validate-api-key
  - [x] Call AI Analysis Workers
  - [x] Return { valid: boolean; provider: string; }

**Files:** backend/src/routes/extraction.ts

**Acceptance Criteria:**

- All routes implemented
- Request validation working
- Error responses proper HTTP status
- Integration tests pass

---

### Phase 1 Validation

- [x] All AI adapters implemented and tested (manual validation)
- [x] All extraction routes working
- [x] Token usage tracking enabled
- [x] Error handling comprehensive (retry/backoff implemented)
- [x] Costs per provider calculable
- [x] Fallback between providers available via adapter factory
- [x] Rate limit handling robust (retry/backoff)
- [x] Zero unimplemented methods in AI services (Phase 1 heuristics in core intelligence are intentional)

**Acceptance:** Can call any AI provider to extract/summarize/explain without errors

---

## Phase 2: Core Intelligence Scoring (Week 2)

**Goal:** Implement scoring logic, ranking, and recommendation gate rules

### Task 2.1: Component Scoring Implementation

- [x] Implement ProcessMatch scoring (0-100)
  - [x] Compare job.process_type with factory.capabilities.processes
  - [x] Deterministic matching logic
  - [x] Return normalized score
- [x] Implement MaterialMatch scoring (0-100)
  - [x] Compare job.material_type with factory.materials
  - [x] Deterministic matching logic
- [x] Implement CapacityMatch scoring (0-100)
  - [x] Compare job.volume_band with factory.capacity_band
  - [x] Deterministic matching logic
- [x] Implement GeographyAndLogistics scoring (0-100)
  - [x] Call Geo/Logistics service.assessLogistics() (heuristic placeholder in Phase 2)
  - [x] Use feasibility score from logistics assessment
  - [x] Return 0-100 score
- [x] Implement MarketAccess scoring (0-100)
  - [x] Call Market Intelligence service.getMarketSignals() (heuristic placeholder in Phase 2)
  - [x] Use market access score
  - [x] Return 0-100 score
- [x] Implement EvidenceConfidence scoring (0-100)
  - [x] Aggregate confidence of all evidence items
  - [x] Weight by evidence count and freshness
  - [x] Return 0-100 score

**Files:** backend/src/services/core-intelligence.ts

**Acceptance Criteria:**

- All 6 components return 0-100
- Deterministic for same inputs
- Integration with other services working
- Unit tests pass

---

### Task 2.2: Scoring Formula Implementation

- [x] Implement weighted sum calculation
  - [x] Load SCORING_WEIGHTS from constants
  - [x] Apply weights: ProcessMatch(0.25) + MaterialMatch(0.20) + ...
  - [x] Normalize to 0-100
- [x] Implement confidence penalty logic
  - [x] Count missing or low-confidence components
  - [x] Apply 15% penalty per missing component
  - [x] Floor at 0, cap at 100
- [x] Implement feasibility score computation
  - [x] Combine CapacityMatch + GeographyAndLogistics
  - [x] Average or weighted average
  - [x] Return 0-100
- [x] Implement provenance tracking
  - [x] Store component scores for debugging
  - [ ] Log why each component scored as it did
  - [x] Enable component analysis endpoint

**Files:** backend/src/services/core-intelligence.ts

**Acceptance Criteria:**

- Scoring formula working correctly
- Confidence penalty applied properly
- Provenance tracked and queryable
- Deterministic outputs
- Tests validate weights sum to 1.0

---

### Task 2.3: Gate Rules Implementation

- [x] Implement gate rule checking
  - [x] Check: at least 1 factory in results
  - [x] Check: at least 1 evidence item per factory
  - [x] Check: confidence ≥ 30 for draft recommendations
  - [x] Check: confidence ≥ 60 for final recommendations
- [x] Implement fallback recommendation
  - [x] If confidence weak, generate draft with caveats
  - [x] Include warning in recommendation
  - [x] Never show recommendation if evidence too sparse

**Files:** backend/src/services/core-intelligence.ts

**Acceptance Criteria:**

- Gate rules enforced
- Draft and final recommendations properly gated
- Fallback recommendations generated appropriately
- Tests verify gate logic

---

### Task 2.4: Ranking Implementation

- [x] Implement scoreJob() method
  - [x] Load job, factories, evidence from database
  - [x] Call computeComponentScore for each component
  - [x] Calculate fit score using weighted sum
  - [x] Apply confidence penalty
  - [x] Return array of ScoringResult
- [x] Implement rankRecommendations() method
  - [x] Sort by fit score (descending)
  - [x] Within same score, sort by confidence
  - [x] Apply gate rules
  - [x] Assign ranks 1, 2, 3, etc.
  - [x] Return top N (default 5)
- [x] Implement caching
  - [x] Cache component scores for debugging
  - [x] Cache final recommendations with TTL
  - [x] Invalidate on job or factory changes

**Files:** backend/src/services/core-intelligence.ts

**Acceptance Criteria:**

- Scoring working end-to-end
- Ranking deterministic
- Gate rules properly applied
- Top N recommendations returned
- Caching functional

---

### Task 2.5: Scoring Routes Implementation

- [x] POST /scoring/score-job
  - [x] Parse jobId, optional factoryIds
  - [x] Fetch job and factories from database
  - [x] Call Core Intelligence scoring
  - [x] Return array of ScoringResult
- [x] POST /scoring/rank-recommendations
  - [x] Fetch all scores for job
  - [x] Call ranking method
  - [x] Apply gate rules
  - [x] Return top N
- [x] GET /scoring/job-score/:jobId
  - [x] Query recommendations table
  - [x] Return current scores or 404
- [x] GET /scoring/component-analysis/:jobId/:factoryId
  - [x] Fetch recommendation
  - [x] Return component breakdown with explanations
  - [x] Include confidence penalties applied

**Files:** backend/src/routes/scoring.ts

**Acceptance Criteria:**

- All routes working
- Database queries working
- Error handling complete
- Integration tests pass

---

### Task 2.6: Database Operations

- [x] Implement getJob() and getFactories()
- [x] Implement getRecommendations()
- [x] Implement createRecommendation()
- [x] Implement updateRecommendation()
- [x] Add query methods to recommendations table

**Files:** backend/src/db/client.ts (or new queries file)

**Acceptance Criteria:**

- All CRUD operations working
- Queries efficient
- Transactions handled properly

---

### Phase 2 Validation

- [x] Scoring formula correct
- [x] All 6 components implemented
- [x] Confidence penalty working
- [x] Gate rules enforced
- [x] Ranking deterministic
- [x] Caching functional (Redis-backed, 5-min TTL with job version invalidation)
- [x] Database operations working (query helpers in db/queries.ts)
- [x] All tests pass (core smoke test, adapter tests, routing tests)
- [x] Zero unimplemented methods

**Acceptance:** ✅ Can score a job against factories and return ranked recommendations with confidence gates

**Phase 2 Status:** COMPLETE - All acceptance criteria met. Ready for Phase 3 (Queue Worker).

---

## Phase 3: Queue Worker (Week 2)

**Goal:** Implement async job processing with retry logic and state management

### Task 3.1: Queue Database Operations

- [x] Implement enqueueJob()
  - [x] Insert into job_queue table
  - [x] Check for duplicates (jobId, type, version)
  - [x] Set retries=0, maxRetries from config
  - [x] Set priority based on job type
  - [x] Return queue job ID
- [x] Implement getQueueJobStatus()
  - [x] Query job_queue by ID
  - [x] Return full QueueJob object
- [x] Implement getJobQueueStatus()
  - [x] Query all queue jobs for jobId
  - [x] Return in creation order
  - [x] Include status and results
- [x] Implement markQueueJobComplete()
  - [x] Update status to 'completed'
  - [x] Store result data
  - [x] Set completedAt timestamp
  - [x] Enqueue next job if applicable
- [x] Implement markQueueJobFailed()
  - [x] Update status to 'failed'
  - [x] Store error message
  - [x] Increment retries counter
  - [x] If retries < maxRetries, schedule retry with backoff
  - [x] If maxRetries exceeded, update job status to 'analysis_failed'

**Files:** backend/src/services/queue-worker.ts

**Acceptance Criteria:**

- [x] All database operations working
- [x] Idempotency check working
- [x] No duplicate enqueueing
- [x] Retries properly incremented
- [x] Exponential backoff calculating correctly

---

### Task 3.2: Worker Dispatch Implementation

- [x] Implement processQueueJob()
  - [x] Fetch queue job from database
  - [x] Route to appropriate handler based on type
  - [x] Execute with timeout (getJobTimeout)
  - [x] Catch errors and decide retry vs fail
  - [x] Call markQueueJobComplete or markQueueJobFailed
- [x] Implement job timeout handling
  - [x] Set timeout per job type
  - [x] Throw error if timeout exceeded
  - [x] Treat timeout as retryable error
- [x] Implement concurrency control
  - [x] Respect CONCURRENCY limits per job type
  - [x] Queue jobs if at limit
  - [x] Process highest priority first

**Files:** backend/src/services/queue-worker.ts

**Acceptance Criteria:**

- [x] Worker dispatch working
- [x] Timeouts enforced
- [x] Concurrency limits respected
- [x] Priority queue working

---

### Task 3.3: Queue Worker Handlers

- [x] Implement classifyJobWorker()
  - [x] Fetch job from database
  - [x] Call AI extraction to classify process/material (Phase 3 stub, ready for Phase 4)
  - [x] Update job with classification
  - [x] Return success
- [x] Implement extractEvidenceWorker()
  - [x] Fetch job and attachments
  - [x] Call AI extraction for each attachment (Phase 3 stub, ready for Phase 4)
  - [x] Store extracted content
  - [x] Create evidence items
  - [x] Return success
- [x] Implement scoreFitWorker()
  - [x] Fetch job, factories, evidence
  - [x] Call Core Intelligence scoring
  - [x] Store recommendations
  - [x] Return success
- [x] Implement enrichLogisticsWorker()
  - [x] Fetch job and recommended factories
  - [x] Call Geo/Logistics service (Phase 4 stub)
  - [x] Update logistics context
  - [x] Return success
- [x] Implement refreshMarketSignalsWorker()
  - [x] Fetch job and recommended factories
  - [x] Call Market Intelligence service (Phase 4 stub)
  - [x] Update market signals
  - [x] Return success
- [x] Implement refreshSiteBriefWorker()
  - [x] Fetch recommended factories
  - [x] Call Site/Real Estate service (Phase 4 stub)
  - [x] Generate facility briefs
  - [x] Return success
- [x] Implement generateRecommendationBriefWorker()
  - [x] Fetch all recommendations and context
  - [x] Call Presentation Layer
  - [x] Format for UI display
  - [x] Update job status to 'recommended'
  - [x] Return success

**Files:** backend/src/services/queue-worker.ts

**Acceptance Criteria:**

- [x] All 7 handlers implemented
- [x] Each handler calls correct service
- [x] Error handling and retries working
- [x] State transitions correct

---

### Task 3.4: Job State Transitions

- [x] Implement validateStateTransition()
  - [x] Check current job status
  - [x] Validate allowed transitions
  - [x] Throw error if invalid
- [x] Track state transitions in logs
  - [x] Log every status change with timestamp
  - [x] Include who/what triggered change
  - [x] Enable audit trail
- [x] Handle failure states
  - [x] Update job to validation_failed if validation fails
  - [x] Update job to analysis_failed if analysis fails
  - [x] Update job to scoring_failed if scoring fails
  - [x] Update job to stale_data if context ages

**Files:** backend/src/services/job-intake.ts (and others)

**Acceptance Criteria:**

- [x] State transitions validated
- [x] All failure states reachable
- [x] Audit trail complete

---

### Task 3.5: Queue Routes Implementation

- [x] GET /queue/job/:jobId
  - [x] Fetch all queue jobs for job
  - [x] Return with status and progress
- [x] GET /queue/job/:jobId/progress
  - [x] Calculate overall progress percentage
  - [x] Return current stage, remaining time estimate
- [x] GET /queue/:queueJobId
  - [x] Fetch specific queue job
  - [x] Return full details with results/errors
- [x] POST /queue/:queueJobId/replay
  - [x] Create new queue job with incremented version
  - [x] Reset status to queued
  - [x] Support payload override
- [x] GET /queue/stats
  - [x] Count queued, processing, completed, failed jobs
  - [x] Calculate average processing times
  - [x] Return queue health metrics

**Files:** backend/src/routes/queue.ts

**Acceptance Criteria:**

- [x] All routes implemented
- [x] Progress calculation accurate
- [x] Statistics correct
- [x] Manual replay working

---

### Task 3.6: Polling and Webhooks

- [x] Implement long-polling support
  - [x] GET /queue/job/:jobId/progress returns quickly
  - [x] Client can poll with backoff
- [x] Optional: Implement webhooks
  - [x] Job completion webhooks
  - [x] Job failure webhooks
  - [x] POST to registered URLs

**Files:** backend/src/routes/queue.ts (optional)

**Acceptance Criteria:**

- [x] Polling working smoothly
- [x] Webhooks functional (if implemented)

---

### Phase 3 Validation

- [x] Queue database operations working
- [x] Worker dispatch routing correctly
- [x] All 7 handlers implemented
- [x] Timeouts enforced
- [x] Concurrency limits respected
- [x] Retries with backoff working
- [x] State transitions correct
- [x] All queue routes working
- [x] Progress tracking accurate
- [x] Zero unimplemented methods

**Acceptance:** ✅ Can submit a job and watch it progress through all 7 queue stages to completion

**Phase 3 Status:** COMPLETE - All acceptance criteria met. Backend test suite passed May 24, 2026. Ready for Phase 4 (Enrichment Services).

---

## Phase 4: Enrichment Services (Week 3)

**Goal:** Implement Geo/Logistics, Market Intelligence, and Site/Real Estate services

### Task 4.1: Geo Provider Adapters & Logistics Policy (HERE)

- [x] Implement assessLogistics()
  - [x] Integrate HERE Routing API v8 via adapter
  - [x] Integrate HERE Matrix Routing API v8 for multi-origin comparisons via adapter layer
  - [x] Integrate HERE Geocoding & Search API v7 via adapter
  - [x] Integrate HERE Isoline Routing API v8 for reachability and service areas via adapter
  - [x] Determine primary transport mode through logistics policy
  - [x] Estimate lead time through logistics policy
  - [x] Calculate routing cost from provider outputs
  - [x] Identify border crossings through policy rules
  - [x] Flag regulatory constraints through policy rules
  - [x] Return LogisticsAssessment
- [x] Implement computeLogisticsFeasibilityScore()
  - [x] Apply scoring formula from frozen design
  - [x] Return 0-100
- [x] Implement estimateLeadTime()
  - [x] Calculate based on transport mode
  - [x] Add customs processing time if border crossing
  - [x] Add factory processing time
  - [x] Return business days
- [x] Add caching
  - [x] Cache route matrices with 1-hour TTL via Redis
  - [x] Cache geocoding with 24-hour TTL
  - [x] Invalidate on factory data changes

- [x] Add HERE adapter unit tests
  - [x] Routing normalization and 4xx failure behavior
  - [x] Matrix flattening for candidate comparisons
  - [x] Geocode search and reverse lookup normalization
  - [x] Isoline polygon normalization

**Files:** backend/src/services/geo-logistics.ts

**Acceptance Criteria:**

- All methods implemented
- HERE provider adapters and policy layer working
- Transport mode selection logical
- Lead time estimates reasonable
- Caching functional
- Adapter tests passing

---

### Task 4.2: Market Intelligence Implementation (UN Comtrade / World Bank)

- [x] Implement getMarketSignals()
  - [x] Query UN Comtrade & World Bank APIs for demand/macro datasets
  - [x] Add optional SerpApi/GDELT high-frequency ingest
  - [x] Retrieve factory order frequency
  - [x] Calculate market share
  - [x] Get pricing data
  - [x] Assess reputation
  - [x] Return MarketSignals
- [x] Implement computeMarketAccessScore()
  - [x] Apply scoring formula from frozen design
  - [x] Return 0-100
- [x] Implement getMarketOutlook()
  - [x] Trend analysis over time
  - [x] Return natural language outlook
  - [x] Include confidence
- [x] Add caching
  - [x] Cache market signals with 24-hour to 7-day TTL

**Files:** backend/src/services/market-intelligence.ts

**Acceptance Criteria:**

- All methods implemented
- UN Comtrade & World Bank data accessible
- Trend analysis working
- Caching with appropriate TTL

---

### Task 4.3: Site & Real Estate Implementation (UpKeep + SafetyCulture)

- [x] Define shared integration schema
  - [x] Implement `AssetManagerInterface` to abstract CMMS providers (UpKeep/Airtable/etc.)
  - [x] Define strictly typed enums/numbers for capacity (no open-ended text fields)
- [x] Implement generateSiteBrief()
  - [x] Query UpKeep CMMS for asset and work-order history (via abstraction)
  - [x] Query SafetyCulture for inspections, checklists, pass/fail reports
  - [x] Get certification status
  - [x] Retrieve site visit report
  - [x] Calculate equipment age
  - [x] Assess capacity utilization
  - [x] Check planned expansions
  - [x] Return SiteBrief
- [x] Implement webhook receiver for SafetyCulture
  - [x] Map SafetyCulture inspections to site briefs
  - [x] Strictly validate type units (e.g., metric tons, runtime hours)
  - [x] Enqueue `sync-audit-webhook` job into the async worker queue
  - [x] Create UpKeep work order on failed inspections
- [x] Implement assessFacilityCondition()
  - [x] Apply facility scoring formula
  - [x] Return score and risk level
- [x] Implement getSiteVisitReport()
  - [x] Download latest SafetyCulture findings/red flags
  - [x] Calculate days since visit
  - [x] Return findings
- [x] Implement checkFacilityAvailability()
  - [x] Check current capacity
  - [x] Verify lead time availability
  - [x] Return availability assessment

**Files:**

- backend/src/services/site-realestate.ts
- backend/src/services/integrations/upkeep.ts
- backend/src/services/integrations/safetyculture.ts

**Acceptance Criteria:**

- All methods implemented
- Facility data accessible
- Availability checks working
- Data freshness validated

---

### Task 4.4: Enrichment Routes Implementation

- [x] POST /enrichment/logistics-assessment
- [x] GET /enrichment/market-signals/:factoryId
- [x] GET /enrichment/market-outlook
- [x] GET /enrichment/site-brief/:factoryId
- [x] GET /enrichment/site-visit-report/:factoryId
- [x] POST /enrichment/check-availability

**Files:** backend/src/routes/enrichment.ts

**Acceptance Criteria:**

- All routes working
- Database queries efficient
- Error handling complete

---

### Phase 4 Validation

- [x] Geo/Logistics implemented and tested
- [x] HERE adapters implemented and tested
- [x] Market Intelligence implemented and tested
- [x] Site/Real Estate implemented and tested
- [x] All enrichment routes working
- [x] Caching functional with appropriate TTLs
- [x] External API failures handled gracefully
- [x] Fallback data available for failures
- [x] Zero unimplemented methods

**Acceptance:** Can fetch logistics, market, and site context for factories and integrate into scoring and recommendations

---

## Phase 5: Batch Coordination (Week 4)

**Goal:** Orchestrate bulk requests, grouped calculations, and fan-out/fan-in batch processing.

### Task 5.1: Batch Manifest Model

- [x] Define batch request payload
  - [x] Batch ID
  - [x] Child job definitions
  - [x] Correlation metadata
  - [x] Idempotency key
- [x] Persist batch manifest state
  - [x] Track pending, processing, completed, failed counts
  - [x] Link child queue jobs to batch ID

**Files:** backend/src/services/batch-coordination.ts

**Acceptance Criteria:**

- Batch manifests persist cleanly
- Child jobs remain traceable
- Duplicate batch submission prevented

### Task 5.2: Batch Orchestration Engine

- [x] Implement fan-out/fan-in coordination
  - [x] Split bulk checks into child jobs
  - [x] Dispatch existing queue jobs per item
  - [x] Aggregate child results
- [x] Implement grouped retry semantics
  - [x] Retry only failed children when possible
  - [x] Preserve batch-level state across retries

**Files:** backend/src/services/batch-coordination.ts

**Acceptance Criteria:**

- Bulk requests can be coordinated without changing Phase 3 queue behavior
- Partial failures are visible and recoverable
- Aggregate outputs are deterministic

### Task 5.3: Batch Status Routes

- [x] GET /batch/:batchId
  - [x] Return manifest, child job statuses, and rollup counts
- [x] GET /batch/:batchId/progress
  - [x] Return progress percentage and current stage
- [x] POST /batch/:batchId/replay
  - [x] Replay failed child jobs only

**Files:** backend/src/routes/batch.ts

**Acceptance Criteria:**

- Batch status is visible
- Progress is queryable
- Replay behavior is safe and scoped

### Phase 5 Validation

- [x] Batch manifests created and tracked
- [x] Bulk requests split into child jobs
- [x] Aggregate progress correct
- [x] Partial failures handled cleanly
- [x] Zero unimplemented batch methods

**Acceptance:** Can submit a bulk request, monitor child jobs, and receive one aggregated result bundle

## Phase 6: Presentation Layer (Week 5)

**Goal:** Format recommendations and generate reports for UI

### Task 6.1: Recommendation Formatting

- [x] Implement formatRecommendation()
  - [x] Map fit scores to descriptions
  - [x] Map confidence scores to levels
  - [x] Generate key strengths narrative
  - [x] Generate key risks narrative
  - [x] Call Geo/Logistics for lead time
  - [x] Call Market Intelligence for cost
  - [x] Call Site/Real Estate for facility quality
  - [x] Call AI service for explanations
  - [x] Return RecommendationPresentation
- [x] Implement mapConfidenceLevel()
  - [x] 0-30: low
  - [x] 30-60: medium
  - [x] 60-100: high
- [x] Implement mapFitDescription()
  - [x] 0-40: poor fit
  - [x] 40-60: fair fit
  - [x] 60-80: good fit
  - [x] 80-100: excellent fit

**Files:** backend/src/services/presentation-layer.ts

**Acceptance Criteria:**

- All recommendations formatted correctly
- Confidence and fit descriptions accurate
- Narratives clear and user-friendly

---

### Task 6.2: Summary and Report Generation

- [x] Implement formatRecommendationSummary()
  - [x] Show total recommendation count
  - [x] Highlight top 3-5 recommendations
  - [x] Show job metadata and status
  - [x] Display gate status with explanations
  - [x] Show analysis timestamp
- [x] Implement generateExplanation()
  - [x] Support multiple styles (executive, technical, detailed)
  - [x] Highlight top 3 factors
  - [x] Flag weak areas
  - [x] Mention confidence level
  - [x] Suggest confidence improvement actions
- [x] Implement generateDetailedReport()
  - [x] Header with job details
  - [x] Executive summary
  - [x] Detailed recommendation tables
  - [x] Evidence citations
  - [x] Methodology section
  - [x] Risk assessment
  - [x] Appendices with factory profiles
  - [x] HTML ready for PDF

**Files:** backend/src/services/presentation-layer.ts

**Acceptance Criteria:**

- All formatting methods working
- Explanations clear and helpful
- Reports professional and complete
- HTML ready for PDF conversion

---

### Task 6.3: Recommendations Routes Implementation

- [x] GET /recommendations/:jobId
  - [x] Fetch recommendations and format
  - [x] Support topN and format parameters
  - [x] Return JobRecommendationSummary
- [x] GET /recommendations/:jobId/top
  - [x] Return top recommendation only
- [x] GET /recommendations/:jobId/:factoryId/explanation
  - [x] Support different explanation styles
  - [x] Return natural language explanation
- [x] GET /recommendations/:jobId/report
  - [x] Support HTML and JSON formats
  - [x] Generate complete report
- [x] GET /recommendations/:jobId/comparison
  - [x] Compare top N factories
  - [x] Return table data for UI

**Files:** backend/src/routes/recommendations.ts

**Acceptance Criteria:**

- All routes working
- Formatting consistent
- Reports complete and professional

---

### Phase 6 Validation

- [x] Recommendation formatting working
- [x] Explanations generated
- [x] Reports complete
- [x] All routes implemented
- [x] Zero unimplemented methods

**Acceptance:** Can retrieve formatted recommendations and reports ready for user display

---

## Phase 7: Security Hardening (Week 6)

**Goal:** Implement auth middleware, org-level data isolation, quota enforcement, and the hardening checklist from [DFN_SECURITY.md](DFN_SECURITY.md) before any public-facing deployment.

> This phase gates production readiness. It must be completed before Phase 8 (Frontend) goes live or any external user touches the system.

### Task 7.1: Database Schema — Multi-Tenancy Columns

- [ ] Add `org_id TEXT NOT NULL` to `jobs` table
- [ ] Add `created_by TEXT NOT NULL` to `jobs` table
- [ ] Add `org_id TEXT NOT NULL` to `factories` table
- [ ] Add `org_id TEXT NOT NULL` to `recommendations` table (denormalised for query perf)
- [ ] Add `org_id TEXT NOT NULL` to `attachments` table
- [ ] Add `org_id TEXT NOT NULL` to `batch_manifests` table
- [ ] Add database-level index on `org_id` for all tables above
- [ ] Write and test migration scripts
- [ ] Verify no existing query runs without `org_id` scope

**Files:** `backend/src/db/schema.ts`, migration files

**Acceptance Criteria:**

- Migrations run cleanly on a fresh and existing database
- All columns carry `NOT NULL` constraint
- Indexes present and used by query planner

---

### Task 7.2: Auth Middleware

- [ ] Install JWT/JWKS validation library (e.g. `jose`)
- [ ] Implement `authMiddleware`
  - [ ] Extract `Authorization: Bearer <token>` header
  - [ ] Fetch and cache JWKS from `AUTH_ISSUER_URL/.well-known/jwks.json` (24h TTL)
  - [ ] Rotate JWKS cache on key ID (`kid`) mismatch
  - [ ] Verify JWT signature, `iss`, `aud`, and `exp`
  - [ ] Attach decoded claims to `res.locals.auth` as `AuthContext`
  - [ ] Return `401 Unauthorized` on any failure — never `403`
- [ ] Apply `authMiddleware` to all routes except `/health` and `POST /webhooks/safetyculture`
- [ ] Write unit tests: valid token, expired token, wrong audience, tampered signature

**Files:** `backend/src/middleware/auth.ts`, `backend/src/app.ts`

**Acceptance Criteria:**

- Protected routes return `401` without a valid token
- Health check and webhook endpoint remain public
- JWKS key rotation works without restart
- Tests cover all failure cases

---

### Task 7.3: Quota Middleware

- [ ] Implement `quotaMiddleware` for job submission routes
  - [ ] Read `quotas.jobsRemaining` from `res.locals.auth`
  - [ ] If `> 0` — allow (fast path, no network call)
  - [ ] If `<= 0` — call platform billing API for live verification
  - [ ] Return `402 Payment Required` with upgrade prompt if over limit
- [ ] Implement feature flag gate middleware
  - [ ] Check `res.locals.auth.features` for required flag per route
  - [ ] Return `403 Forbidden` with required plan name if flag missing
- [ ] Apply feature flags to plan-gated routes:
  - [ ] `POST /batch` — requires `discovery:batch`
  - [ ] `POST /jobs` (with PrismReport body) — requires `discovery:prism-import`
  - [ ] `GET /recommendations/:jobId/report` — requires `discovery:export-report`
  - [ ] `GET /analytics/*` — requires `discovery:analytics`

**Files:** `backend/src/middleware/quota.ts`, `backend/src/middleware/feature-flag.ts`

**Acceptance Criteria:**

- Fast-path quota check adds < 1ms overhead
- Live check only triggers when token claim is exhausted
- Feature-gated routes return clear `403` with plan name
- Tests cover free, team, business, enterprise plan scenarios

---

### Task 7.4: org_id Scoping on All Queries

- [ ] Audit every database query in `backend/src/services/` and `backend/src/db/`
- [ ] Add `org_id = res.locals.auth.orgId` scope to every `SELECT`, `UPDATE`, and `DELETE`
- [ ] Ensure `org_id` is written on every `INSERT` from the authenticated context
- [ ] Return `404` (not `403`) for resources that belong to a different org
- [ ] Write integration tests: user A cannot read user B's org data

**Files:** All query files in `backend/src/db/` and `backend/src/services/`

**Acceptance Criteria:**

- Zero queries without `org_id` scope (automated grep check in CI)
- Cross-org access attempts return `404`
- Tests verify org isolation end-to-end

---

### Task 7.5: HMAC Webhook Signature Verification

- [ ] Implement HMAC-SHA256 verification for `POST /webhooks/safetyculture`
  - [ ] Read `x-iauditor-signature` header
  - [ ] Compute `HMAC-SHA256(rawBody, SAFETYCULTURE_WEBHOOK_SECRET)`
  - [ ] Compare using `crypto.timingSafeEqual` (prevent timing attacks)
  - [ ] Return `401` immediately if signature does not match — do not enqueue
- [ ] Implement HMAC-SHA256 verification for `POST /webhooks/upkeep`
  - [ ] Read `x-upkeep-signature` header (confirm exact header name in UpKeep docs)
  - [ ] Compute `HMAC-SHA256(rawBody, UPKEEP_WEBHOOK_SECRET)`
  - [ ] Compare using `crypto.timingSafeEqual`
  - [ ] Return `401` immediately if signature does not match — do not enqueue
- [ ] Extract shared `verifyHmacSignature(rawBody, secret, receivedSignature)` utility used by both routes
- [ ] Write tests for each route: valid signature, tampered body, missing header

**Files:** `backend/src/routes/webhooks.ts`, `backend/src/middleware/webhook-auth.ts`

**Acceptance Criteria:**

- Both webhook endpoints reject invalid signatures before any processing
- `crypto.timingSafeEqual` used in both — no string equality comparison
- Tests cover all tamper scenarios for both SafetyCulture and UpKeep

---

### Task 7.6: Audit Event Emission

- [ ] Install Kafka client library (e.g. `kafkajs`)
- [ ] Implement `emitAuditEvent(event: AuditEvent)` helper
  - [ ] Fire-and-forget — produces to Kafka topic `dfn.audit.events`, does not block response
  - [ ] Partition key: `actorOrgId`
  - [ ] Idempotent producer enabled
  - [ ] Serialise as JSON
  - [ ] Swallow errors — log the failure but never throw to the route handler
  - [ ] Include: `eventName`, `actorUserId`, `actorOrgId`, `resourceType`, `resourceId`, `plan`, `timestamp`
- [ ] Emit audit events from routes:
  - [ ] `discovery.job.created` on `POST /jobs`
  - [ ] `discovery.job.submitted` on `POST /jobs/:id/submit`
  - [ ] `discovery.job.deleted` on `DELETE /jobs/:id`
  - [ ] `discovery.recommendation.exported` on `GET /recommendations/:id/report`
  - [ ] `discovery.batch.created` on `POST /batch`
  - [ ] `discovery.prism.imported` on job creation with PrismReport body
- [ ] Write tests: audit events fire asynchronously, Kafka failures do not affect response

**Files:** `backend/src/lib/audit.ts`, `backend/src/lib/kafka.ts`, applied across route handlers

**Acceptance Criteria:**

- Audit events emitted on all required actions
- Event emission does not add latency to response path
- Audit bus unavailability does not cause route failures

---

### Task 7.7: Security Hardening Checklist (from DFN_SECURITY.md §10)

**Transport**

- [ ] All traffic uses HTTPS / TLS 1.2+. HTTP redirected or rejected.
- [ ] HSTS header (`Strict-Transport-Security`) on all responses
- [ ] `POST /webhooks/safetyculture` verifies HMAC-SHA256 (`x-iauditor-signature`) before processing (Task 7.5)
- [ ] `POST /webhooks/upkeep` verifies HMAC-SHA256 (`x-upkeep-signature`) before processing (Task 7.5)
- [ ] Both webhook handlers use `crypto.timingSafeEqual` — no string equality comparison

**Auth**

- [ ] Auth middleware applied to all non-public routes (Task 7.2)
- [ ] JWKS cached locally (24h), rotated on `kid` mismatch (Task 7.2)
- [ ] Token expiry validated before any handler runs
- [ ] `iss` and `aud` validated against env config — not hardcoded

**Data**

- [ ] Every database query includes `org_id` scope (Task 7.4)
- [ ] Attachment URLs are signed and short-lived (≤ 15 min TTL)
- [ ] No raw secrets in application logs
- [ ] External API keys in secrets manager, not in `.env` on production

**Input**

- [ ] All request bodies validated against strict TypeScript schemas
- [ ] SQL via parameterised queries (Drizzle ORM)
- [ ] File upload MIME types validated server-side
- [ ] Maximum file size enforced server-side

**Dependencies**

- [ ] `npm audit` runs in CI and blocks on critical/high severity
- [ ] Node.js version pinned in `.nvmrc` and Docker image

**Headers**

- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `Content-Security-Policy` configured for frontend
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`

**Files:** `backend/src/app.ts` (helmet or manual headers), CI config

**Acceptance Criteria:**

- All checklist items passing
- Security headers verified via automated scan (e.g. `npx helmet-csp-generator` or equivalent)

---

### Phase 7 Validation

- [ ] `org_id` columns added and indexed on all tables
- [ ] Auth middleware applied and tested (unit + integration)
- [ ] Quota middleware blocking over-limit submissions
- [ ] Feature flags gating plan-restricted routes
- [ ] All queries include `org_id` scope
- [ ] Cross-org access returns `404` (not `403`)
- [ ] Webhook HMAC verification rejecting tampered payloads
- [ ] Audit events emitting on all required actions
- [ ] All hardening checklist items passing
- [ ] `npm audit` clean in CI
- [ ] Open questions in `DFN_SECURITY.md §12` answered and resolved

**Acceptance:** System is safe for external users. No route is accessible without a valid, scoped token. No user can access another org's data.

---

## Phase 8: Frontend Development (Week 7)

**Goal:** Build UI for job submission, recommendations, and status tracking

### Task 8.1: Job Submission Form

- [ ] Create JobSubmissionForm component
  - [ ] Fields for company_name, product_name, process_type, material_type, volume_band, location
  - [ ] File upload for attachments
  - [ ] Form validation
  - [ ] Error display
- [ ] Implement form submission
  - [ ] Call API createJob()
  - [ ] Handle success and errors
  - [ ] Redirect to job status page

**Files:** frontend/src/components/JobSubmissionForm.tsx

**Acceptance Criteria:**

- Form renders correctly
- Validation working
- API integration working
- Error messages clear

---

### Task 8.2: Job Status Page

- [ ] Create JobStatusPage component
  - [ ] Display job metadata (company, product, status)
  - [ ] Show analysis progress percentage
  - [ ] List queue jobs with status
  - [ ] Poll progress at 2-second interval
  - [ ] Auto-refresh when complete

**Files:** frontend/src/pages/jobs/[jobId].tsx

**Acceptance Criteria:**

- Status page rendering
- Progress tracking working
- Auto-refresh functional
- Polling efficient

---

### Task 8.3: Recommendations Display

- [ ] Create RecommendationCard component
  - [ ] Display factory name and rank
  - [ ] Show fit score with visual indicator
  - [ ] Show feasibility score
  - [ ] List key strengths
  - [ ] List key risks
  - [ ] Show lead time and cost estimates
  - [ ] Include confidence level

**Files:** frontend/src/components/RecommendationCard.tsx

**Acceptance Criteria:**

- Component renders recommendations
- Scores displayed with visual styling
- All information visible and readable

---

### Task 8.4: Recommendation Details Page

- [ ] Create RecommendationDetailsPage
  - [ ] Show full recommendation
  - [ ] Display detailed explanation
  - [ ] Show all evidence items
  - [ ] Component score breakdown
  - [ ] Action buttons (share, export, contact factory)

**Files:** frontend/src/pages/recommendations/[jobId]/[factoryId].tsx

**Acceptance Criteria:**

- Details page complete
- All information displayed
- User actions available

---

### Task 8.5: Dashboard

- [ ] Create Dashboard component
  - [ ] List recent jobs
  - [ ] Show job status (draft, analyzing, recommended, published)
  - [ ] Quick links to create new job
  - [ ] Search and filter jobs
  - [ ] Sort by date, status, fit score

**Files:** frontend/src/pages/dashboard.tsx

**Acceptance Criteria:**

- Dashboard displaying jobs
- Filtering and sorting working
- Navigation functional

---

### Phase 8 Validation

- [ ] Job form working
- [ ] Status tracking working
- [ ] Recommendations displaying correctly
- [ ] Details pages complete
- [ ] Dashboard functional
- [ ] All routes working
- [ ] No TypeScript errors

**Acceptance:** User can submit a job, watch analysis progress, view recommendations, and drill into details

---

## Phase 9: Testing & Polish (Week 8)

**Goal:** Comprehensive testing, error handling refinement, and deployment preparation

### Task 8.1: Backend Tests

- [ ] Unit tests for all services
  - [ ] Job Intake validation and normalization
  - [ ] Core Intelligence scoring and ranking
  - [ ] Queue worker dispatch and retry logic
  - [ ] Enrichment services (geo, market, site)
  - [ ] Presentation formatting
- [ ] Integration tests
  - [ ] End-to-end job submission to recommendation
  - [ ] API routes with database
  - [ ] AI provider adapters (mock API calls)
  - [ ] Queue job processing
- [ ] Test coverage target: >80%

**Files:** backend/src/**/**tests**/*.test.ts

**Acceptance Criteria:**

- Unit tests passing
- Integration tests passing
- Coverage >80%
- No flaky tests

---

### Task 9.2: Frontend Tests

- [ ] Component tests (React Testing Library)
  - [ ] Job form validation
  - [ ] Status tracking page
  - [ ] Recommendation cards
  - [ ] Dashboard
- [ ] E2E tests (Playwright or Cypress)
  - [ ] Submit job to completion
  - [ ] View recommendations
  - [ ] Navigate UI
- [ ] Test coverage target: >70%

**Files:** frontend/src/**/**tests**/*.test.tsx

**Acceptance Criteria:**

- Component tests passing
- E2E tests passing
- Coverage >70%

---

### Task 9.3: Error Handling Polish

- [ ] Improve error messages
  - [ ] Validation errors clear and actionable
  - [ ] API errors with retry suggestions
  - [ ] Timeout errors with user guidance
  - [ ] External provider failures with fallbacks
- [ ] Add loading states
  - [ ] Loading spinners on long operations
  - [ ] Skeleton screens on data fetch
  - [ ] Progress bars on analysis
- [ ] Add toast notifications
  - [ ] Success confirmations
  - [ ] Error alerts
  - [ ] Status updates

**Files:** backend + frontend throughout

**Acceptance Criteria:**

- All errors handled gracefully
- User always knows what's happening
- No silent failures

---

### Task 9.4: Performance Optimization

- [ ] Backend optimization
  - [ ] Database query optimization
  - [ ] Caching strategy review
  - [ ] API response time <200ms (non-AI)
  - [ ] Queue processing <2min average
- [ ] Frontend optimization
  - [ ] Code splitting
  - [ ] Image optimization
  - [ ] Bundle size <500KB
  - [ ] Page load <2s
- [ ] Load testing
  - [ ] 10 concurrent job submissions
  - [ ] 100 parallel queue jobs

**Files:** Throughout

**Acceptance Criteria:**

- Response times acceptable
- Bundle size <500KB
- Load test passing

---

### Task 9.5: Documentation

- [ ] API documentation
  - [ ] Endpoint descriptions
  - [ ] Request/response schemas
  - [ ] Error codes
  - [ ] Authentication requirements
- [ ] Deployment guide
  - [ ] Environment setup
  - [ ] Database migrations
  - [ ] Running locally
  - [ ] Deploying to production
- [ ] User guide
  - [ ] Submitting a job
  - [ ] Interpreting results
  - [ ] Exporting reports
  - [ ] FAQ

**Files:** docs/ and README updates

**Acceptance Criteria:**

- Documentation complete
- Setup guide tested
- User guide clear

---

### Task 9.6: Deployment Setup

- [ ] Environment configuration
  - [ ] .env.example updated with all vars
  - [ ] Secrets management defined
  - [ ] Configuration validation
- [ ] Docker setup (optional)
  - [ ] Dockerfile for backend
  - [ ] Dockerfile for frontend
  - [ ] docker-compose for local dev
- [ ] CI/CD pipeline
  - [ ] GitHub Actions for testing
  - [ ] Linting checks
  - [ ] Type checking
  - [ ] Build verification
- [ ] Deployment scripts
  - [ ] Database migration scripts
  - [ ] Vercel deployment (frontend)
  - [ ] Railway deployment (backend)

**Files:** Dockerfile, docker-compose.yml, .github/workflows/

**Acceptance Criteria:**

- Environment fully configured
- CI/CD pipeline working
- Deployment scripts tested

---

### Phase 9 Validation

- [ ] All tests passing
- [ ] Error handling comprehensive
- [ ] Performance acceptable
- [ ] Documentation complete
- [ ] Deployment tested
- [ ] No critical bugs
- [ ] Ready for production

**Acceptance:** System ready for deployment to production

---

## Implementation Summary

| Phase | Duration | Focus | Status |
|-------|----------|-------|--------|
| 0: Scaffolding | Complete | Services, types, routes | ✅ DONE |
| 1: AI Adapters | Week 1 | Extract, summarize, explain | ✅ DONE |
| 2: Scoring | Week 1 | Fit scores, ranking, gates | ✅ DONE |
| 3: Queue | Week 2 | Async processing, workers | ✅ DONE |
| 4: Enrichment | Week 3 | Geo, market, site services | ✅ DONE |
| 5: Batch Coordination | Week 4 | Bulk orchestration, aggregation | ✅ DONE |
| 6: Presentation | Week 5 | Formatting, reports | 🔄 |
| 7: Security Hardening | Week 6 | Auth, org isolation, hardening | 🔄 |
| 8: Frontend | Week 7 | UI components, pages | 🔄 |
| 9: Testing & Polish | Week 8 | Tests, errors, deploy | 🔄 |

**Total Timeline:** 8 weeks from Phase 1 start to production-ready

> **Security gate:** Phase 7 must be fully validated before Phase 8 (Frontend) is deployed to any environment accessible by external users. See [DFN_SECURITY.md](DFN_SECURITY.md) for the full requirements.

---

## Notes for Implementers

- Follow the frozen design documents as the source of truth
- Run validation checks after each phase (see checklist)
- Keep all TODO comments as implementation guidance
- Write tests as you implement
- Commit frequently with clear messages
- Update documentation as you go
- Flag any deviations from design immediately

---

**Created:** May 8, 2026  
**Last Updated:** June 27, 2026  
**Status:** Phase 5 Complete - Ready for Phase 6 Presentation Layer
