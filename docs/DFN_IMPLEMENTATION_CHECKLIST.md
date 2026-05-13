# DFN Discovery - Implementation Checklist

**Status:** Ready for Phase 1 - Full Service Implementation  
**Created:** May 8, 2026  
**Scaffolding Validation:** ✅ PASSED (see DFN_IMPLEMENTATION_VALIDATION.md)

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
  - [x] Call gemini-2.0-flash endpoint
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

- [ ] Implement enqueueJob()
  - [ ] Insert into job_queue table
  - [ ] Check for duplicates (jobId, type, version)
  - [ ] Set retries=0, maxRetries from config
  - [ ] Set priority based on job type
  - [ ] Return queue job ID
- [ ] Implement getQueueJobStatus()
  - [ ] Query job_queue by ID
  - [ ] Return full QueueJob object
- [ ] Implement getJobQueueStatus()
  - [ ] Query all queue jobs for jobId
  - [ ] Return in creation order
  - [ ] Include status and results
- [ ] Implement markQueueJobComplete()
  - [ ] Update status to 'completed'
  - [ ] Store result data
  - [ ] Set completedAt timestamp
  - [ ] Enqueue next job if applicable
- [ ] Implement markQueueJobFailed()
  - [ ] Update status to 'failed'
  - [ ] Store error message
  - [ ] Increment retries counter
  - [ ] If retries < maxRetries, schedule retry with backoff
  - [ ] If maxRetries exceeded, update job status to 'analysis_failed'

**Files:** backend/src/services/queue-worker.ts

**Acceptance Criteria:**

- All database operations working
- Idempotency check working
- No duplicate enqueueing
- Retries properly incremented
- Exponential backoff calculating correctly

---

### Task 3.2: Worker Dispatch Implementation

- [ ] Implement processQueueJob()
  - [ ] Fetch queue job from database
  - [ ] Route to appropriate handler based on type
  - [ ] Execute with timeout (getJobTimeout)
  - [ ] Catch errors and decide retry vs fail
  - [ ] Call markQueueJobComplete or markQueueJobFailed
- [ ] Implement job timeout handling
  - [ ] Set timeout per job type
  - [ ] Throw error if timeout exceeded
  - [ ] Treat timeout as retryable error
- [ ] Implement concurrency control
  - [ ] Respect CONCURRENCY limits per job type
  - [ ] Queue jobs if at limit
  - [ ] Process highest priority first

**Files:** backend/src/services/queue-worker.ts

**Acceptance Criteria:**

- Worker dispatch working
- Timeouts enforced
- Concurrency limits respected
- Priority queue working

---

### Task 3.3: Queue Worker Handlers

- [ ] Implement classifyJobWorker()
  - [ ] Fetch job from database
  - [ ] Call AI extraction to classify process/material
  - [ ] Update job with classification
  - [ ] Return success
- [ ] Implement extractEvidenceWorker()
  - [ ] Fetch job and attachments
  - [ ] Call AI extraction for each attachment
  - [ ] Store extracted content
  - [ ] Create evidence items
  - [ ] Return success
- [ ] Implement scoreFitWorker()
  - [ ] Fetch job, factories, evidence
  - [ ] Call Core Intelligence scoring
  - [ ] Store recommendations
  - [ ] Return success
- [ ] Implement enrichLogisticsWorker()
  - [ ] Fetch job and recommended factories
  - [ ] Call Geo/Logistics service
  - [ ] Update logistics context
  - [ ] Return success
- [ ] Implement refreshMarketSignalsWorker()
  - [ ] Fetch job and recommended factories
  - [ ] Call Market Intelligence service
  - [ ] Update market signals
  - [ ] Return success
- [ ] Implement refreshSiteBriefWorker()
  - [ ] Fetch recommended factories
  - [ ] Call Site/Real Estate service
  - [ ] Generate facility briefs
  - [ ] Return success
- [ ] Implement generateRecommendationBriefWorker()
  - [ ] Fetch all recommendations and context
  - [ ] Call Presentation Layer
  - [ ] Format for UI display
  - [ ] Update job status to 'recommended'
  - [ ] Return success

**Files:** backend/src/services/queue-worker.ts

**Acceptance Criteria:**

- All 7 handlers implemented
- Each handler calls correct service
- Error handling and retries working
- State transitions correct

---

### Task 3.4: Job State Transitions

- [ ] Implement validateStateTransition()
  - [ ] Check current job status
  - [ ] Validate allowed transitions
  - [ ] Throw error if invalid
- [ ] Track state transitions in logs
  - [ ] Log every status change with timestamp
  - [ ] Include who/what triggered change
  - [ ] Enable audit trail
- [ ] Handle failure states
  - [ ] Update job to validation_failed if validation fails
  - [ ] Update job to analysis_failed if analysis fails
  - [ ] Update job to scoring_failed if scoring fails
  - [ ] Update job to stale_data if context ages

**Files:** backend/src/services/job-intake.ts (and others)

**Acceptance Criteria:**

- State transitions validated
- All failure states reachable
- Audit trail complete

---

### Task 3.5: Queue Routes Implementation

- [ ] GET /queue/job/:jobId
  - [ ] Fetch all queue jobs for job
  - [ ] Return with status and progress
- [ ] GET /queue/job/:jobId/progress
  - [ ] Calculate overall progress percentage
  - [ ] Return current stage, remaining time estimate
- [ ] GET /queue/:queueJobId
  - [ ] Fetch specific queue job
  - [ ] Return full details with results/errors
- [ ] POST /queue/:queueJobId/replay
  - [ ] Create new queue job with incremented version
  - [ ] Reset status to queued
  - [ ] Support payload override
- [ ] GET /queue/stats
  - [ ] Count queued, processing, completed, failed jobs
  - [ ] Calculate average processing times
  - [ ] Return queue health metrics

**Files:** backend/src/routes/queue.ts

**Acceptance Criteria:**

- All routes implemented
- Progress calculation accurate
- Statistics correct
- Manual replay working

---

### Task 3.6: Polling and Webhooks

- [ ] Implement long-polling support
  - [ ] GET /queue/job/:jobId/progress returns quickly
  - [ ] Client can poll with backoff
- [ ] Optional: Implement webhooks
  - [ ] Job completion webhooks
  - [ ] Job failure webhooks
  - [ ] POST to registered URLs

**Files:** backend/src/routes/queue.ts (optional)

**Acceptance Criteria:**

- Polling working smoothly
- Webhooks functional (if implemented)

---

### Phase 3 Validation

- [ ] Queue database operations working
- [ ] Worker dispatch routing correctly
- [ ] All 7 handlers implemented
- [ ] Timeouts enforced
- [ ] Concurrency limits respected
- [ ] Retries with backoff working
- [ ] State transitions correct
- [ ] All queue routes working
- [ ] Progress tracking accurate
- [ ] Zero unimplemented methods

**Acceptance:** Can submit a job and watch it progress through all 7 queue stages to completion

---

## Phase 4: Enrichment Services (Week 3)

**Goal:** Implement Geo/Logistics, Market Intelligence, and Site/Real Estate services

### Task 4.1: Geo & Logistics Implementation

- [ ] Implement assessLogistics()
  - [ ] Calculate distance (API or deterministic formula)
  - [ ] Determine primary transport mode
  - [ ] Estimate lead time
  - [ ] Calculate routing cost
  - [ ] Identify border crossings
  - [ ] Flag regulatory constraints
  - [ ] Return LogisticsAssessment
- [ ] Implement computeLogisticsFeasibilityScore()
  - [ ] Apply scoring formula from frozen design
  - [ ] Return 0-100
- [ ] Implement estimateLeadTime()
  - [ ] Calculate based on transport mode
  - [ ] Add customs processing time if border crossing
  - [ ] Add factory processing time
  - [ ] Return business days
- [ ] Add caching
  - [ ] Cache assessments with location-based TTL
  - [ ] Invalidate on factory data changes

**Files:** backend/src/services/geo-logistics.ts

**Acceptance Criteria:**

- All methods implemented
- Distance calculation working
- Transport mode selection logical
- Lead time estimates reasonable
- Caching functional

---

### Task 4.2: Market Intelligence Implementation

- [ ] Implement getMarketSignals()
  - [ ] Query market database or API for demand
  - [ ] Retrieve factory order frequency
  - [ ] Calculate market share
  - [ ] Get pricing data
  - [ ] Assess reputation
  - [ ] Return MarketSignals
- [ ] Implement computeMarketAccessScore()
  - [ ] Apply scoring formula from frozen design
  - [ ] Return 0-100
- [ ] Implement getMarketOutlook()
  - [ ] Trend analysis over time
  - [ ] Return natural language outlook
  - [ ] Include confidence
- [ ] Add caching
  - [ ] Cache market signals with 24-hour TTL
  - [ ] Invalidate on market data changes

**Files:** backend/src/services/market-intelligence.ts

**Acceptance Criteria:**

- All methods implemented
- Market data accessible
- Trend analysis working
- Caching with appropriate TTL

---

### Task 4.3: Site & Real Estate Implementation

- [ ] Implement generateSiteBrief()
  - [ ] Query facility database
  - [ ] Get certification status
  - [ ] Retrieve site visit report
  - [ ] Calculate equipment age
  - [ ] Assess capacity utilization
  - [ ] Check planned expansions
  - [ ] Return SiteBrief
- [ ] Implement assessFacilityCondition()
  - [ ] Apply facility scoring formula
  - [ ] Return score and risk level
- [ ] Implement getSiteVisitReport()
  - [ ] Fetch most recent visit
  - [ ] Calculate days since visit
  - [ ] Return findings and red flags
- [ ] Implement checkFacilityAvailability()
  - [ ] Check current capacity
  - [ ] Verify lead time availability
  - [ ] Return availability assessment

**Files:** backend/src/services/site-realestate.ts

**Acceptance Criteria:**

- All methods implemented
- Facility data accessible
- Availability checks working
- Data freshness validated

---

### Task 4.4: Enrichment Routes Implementation

- [ ] POST /enrichment/logistics-assessment
- [ ] GET /enrichment/market-signals/:factoryId
- [ ] GET /enrichment/market-outlook
- [ ] GET /enrichment/site-brief/:factoryId
- [ ] GET /enrichment/site-visit-report/:factoryId
- [ ] POST /enrichment/check-availability

**Files:** backend/src/routes/enrichment.ts

**Acceptance Criteria:**

- All routes working
- Database queries efficient
- Error handling complete

---

### Phase 4 Validation

- [ ] Geo/Logistics implemented and tested
- [ ] Market Intelligence implemented and tested
- [ ] Site/Real Estate implemented and tested
- [ ] All enrichment routes working
- [ ] Caching functional with appropriate TTLs
- [ ] External API failures handled gracefully
- [ ] Fallback data available for failures
- [ ] Zero unimplemented methods

**Acceptance:** Can fetch logistics, market, and site context for factories and integrate into scoring

---

## Phase 5: Presentation Layer (Week 3)

**Goal:** Format recommendations and generate reports for UI

### Task 5.1: Recommendation Formatting

- [ ] Implement formatRecommendation()
  - [ ] Map fit scores to descriptions
  - [ ] Map confidence scores to levels
  - [ ] Generate key strengths narrative
  - [ ] Generate key risks narrative
  - [ ] Call Geo/Logistics for lead time
  - [ ] Call Market Intelligence for cost
  - [ ] Call Site/Real Estate for facility quality
  - [ ] Call AI service for explanations
  - [ ] Return RecommendationPresentation
- [ ] Implement mapConfidenceLevel()
  - [ ] 0-30: low
  - [ ] 30-60: medium
  - [ ] 60-100: high
- [ ] Implement mapFitDescription()
  - [ ] 0-40: poor fit
  - [ ] 40-60: fair fit
  - [ ] 60-80: good fit
  - [ ] 80-100: excellent fit

**Files:** backend/src/services/presentation-layer.ts

**Acceptance Criteria:**

- All recommendations formatted correctly
- Confidence and fit descriptions accurate
- Narratives clear and user-friendly

---

### Task 5.2: Summary and Report Generation

- [ ] Implement formatRecommendationSummary()
  - [ ] Show total recommendation count
  - [ ] Highlight top 3-5 recommendations
  - [ ] Show job metadata and status
  - [ ] Display gate status with explanations
  - [ ] Show analysis timestamp
- [ ] Implement generateExplanation()
  - [ ] Support multiple styles (executive, technical, detailed)
  - [ ] Highlight top 3 factors
  - [ ] Flag weak areas
  - [ ] Mention confidence level
  - [ ] Suggest confidence improvement actions
- [ ] Implement generateDetailedReport()
  - [ ] Header with job details
  - [ ] Executive summary
  - [ ] Detailed recommendation tables
  - [ ] Evidence citations
  - [ ] Methodology section
  - [ ] Risk assessment
  - [ ] Appendices with factory profiles
  - [ ] HTML ready for PDF

**Files:** backend/src/services/presentation-layer.ts

**Acceptance Criteria:**

- All formatting methods working
- Explanations clear and helpful
- Reports professional and complete
- HTML ready for PDF conversion

---

### Task 5.3: Recommendations Routes Implementation

- [ ] GET /recommendations/:jobId
  - [ ] Fetch recommendations and format
  - [ ] Support topN and format parameters
  - [ ] Return JobRecommendationSummary
- [ ] GET /recommendations/:jobId/top
  - [ ] Return top recommendation only
- [ ] GET /recommendations/:jobId/:factoryId/explanation
  - [ ] Support different explanation styles
  - [ ] Return natural language explanation
- [ ] GET /recommendations/:jobId/report
  - [ ] Support HTML and JSON formats
  - [ ] Generate complete report
- [ ] GET /recommendations/:jobId/comparison
  - [ ] Compare top N factories
  - [ ] Return table data for UI

**Files:** backend/src/routes/recommendations.ts

**Acceptance Criteria:**

- All routes working
- Formatting consistent
- Reports complete and professional

---

### Phase 5 Validation

- [ ] Recommendation formatting working
- [ ] Explanations generated
- [ ] Reports complete
- [ ] All routes implemented
- [ ] Zero unimplemented methods

**Acceptance:** Can retrieve formatted recommendations and reports ready for user display

---

## Phase 6: Frontend Development (Week 4)

**Goal:** Build UI for job submission, recommendations, and status tracking

### Task 6.1: Job Submission Form

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

### Task 6.2: Job Status Page

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

### Task 6.3: Recommendations Display

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

### Task 6.4: Recommendation Details Page

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

### Task 6.5: Dashboard

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

### Phase 6 Validation

- [ ] Job form working
- [ ] Status tracking working
- [ ] Recommendations displaying correctly
- [ ] Details pages complete
- [ ] Dashboard functional
- [ ] All routes working
- [ ] No TypeScript errors

**Acceptance:** User can submit a job, watch analysis progress, view recommendations, and drill into details

---

## Phase 7: Testing & Polish (Week 4)

**Goal:** Comprehensive testing, error handling refinement, and deployment preparation

### Task 7.1: Backend Tests

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

### Task 7.2: Frontend Tests

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

### Task 7.3: Error Handling Polish

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

### Task 7.4: Performance Optimization

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

### Task 7.5: Documentation

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

### Task 7.6: Deployment Setup

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

### Phase 7 Validation

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
| 3: Queue | Week 2 | Async processing, workers | 🔄 |
| 4: Enrichment | Week 3 | Geo, market, site services | 🔄 |
| 5: Presentation | Week 3 | Formatting, reports | 🔄 |
| 6: Frontend | Week 4 | UI components, pages | 🔄 |
| 7: Testing & Polish | Week 4 | Tests, errors, deploy | 🔄 |

**Total Timeline:** 4 weeks from Phase 1 start to production-ready

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
**Last Updated:** May 12, 2026  
**Status:** Ready for Phase 3 Implementation
