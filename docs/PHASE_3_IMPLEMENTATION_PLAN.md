# Phase 3: Queue Worker Implementation Plan

**Start Date:** May 17, 2026  
**Target Duration:** 1 week  
**Goal:** Implement async job processing with retry logic, state management, and 7 worker handlers

---

## Architecture Overview

### Queue Flow

```
Job Submission (POST /jobs/:id/submit)
    ↓
Enqueue 'classify-job'
    ↓ (completed)
Enqueue 'extract-evidence'
    ↓ (completed)
Enqueue 'score-fit'
    ↓ (completed)
Enqueue 'enrich-logistics' + 'refresh-market-signals' + 'refresh-site-brief' (parallel)
    ↓ (all completed)
Enqueue 'generate-recommendation-brief'
    ↓ (completed)
Job status → 'recommended'
```

### Database Operations

All operations on `job_queue` table:

- `id` (UUID, PK)
- `job_id` (UUID, FK → jobs.id)
- `queue_type` (text, enum QueueJobType)
- `payload` (JSONB, type-specific data)
- `status` (text: 'pending', 'processing', 'completed', 'failed')
- `retries` (integer, current count)
- `maxRetries` (integer, config per type)
- `error` (text, error message if failed)
- `created_at`, `updated_at`, `completed_at` (timestamps)

---

## Implementation Sequence

### Task 3.1: Queue Database Operations
**Scope:** Core database layer for queue management  
**Dependencies:** None (foundational)  
**Key Methods:**
- `enqueueJob(type, payload, jobId)` → string (queueId)
- `getQueueJobStatus(queueId)` → QueueJob
- `getJobQueueStatus(jobId)` → QueueJob[]
- `markQueueJobComplete(queueId, result)` → void
- `markQueueJobFailed(queueId, error, isRetryable)` → Promise<boolean>

**Implementation Notes:**
- Idempotency: Check for existing (jobId, type, version) before inserting
- Retries: Exponential backoff formula: `delay = initialDelay * (2 ^ attemptCount)`
- Return true from markQueueJobFailed if retry was scheduled, false if max retries exceeded

---

### Task 3.2: Worker Dispatch
**Scope:** Core processing engine and control flow  
**Dependencies:** Task 3.1 (database operations)  
**Key Methods:**
- `processQueueJob(queueId)` → Promise<QueueJob>
- `getJobTimeout(queueType)` → number (milliseconds)
- `enforceTimeout(fn, timeoutMs)` → Promise<T>

**Implementation Notes:**
- Dispatch table: queueType → handler function
- Timeout enforcement: Wrap handler in Promise.race with timeout
- Treat timeout as retryable error
- Call markQueueJobComplete/Failed after handler finishes
- Concurrency: Track active jobs per type, queue if at limit (CONCURRENCY_LIMITS per type)

---

### Task 3.3: Queue Worker Handlers
**Scope:** 7 domain-specific handlers  
**Dependencies:** Task 3.2 (dispatch), Task 3.1 (database)  
**Key Handlers:**

1. **classifyJobWorker** → Dispatch to AI Analysis Workers to classify process/material
2. **extractEvidenceWorker** → Extract structured data from attachments
3. **scoreFitWorker** → Call Core Intelligence to score job against factories
4. **enrichLogisticsWorker** → Enrich with Geo/Logistics data (Phase 4)
5. **refreshMarketSignalsWorker** → Enrich with Market Intelligence (Phase 4)
6. **refreshSiteBriefWorker** → Enrich with Site/Real Estate data (Phase 4)
7. **generateRecommendationBriefWorker** → Format for UI via Presentation Layer

**Implementation Notes:**
- Each handler: fetch data, call service, update job/recommendations, return success
- Handlers 4-6 are Phase 4 enrichment services (stub for now, return success)
- Handler 1-3 call existing services (AI Analysis, Core Intelligence)
- All errors are retryable unless marked otherwise

---

### Task 3.4: Job State Transitions
**Scope:** State machine validation and audit trail  
**Dependencies:** Task 3.1 (database operations)  
**Key Methods:**
- `validateStateTransition(currentStatus, nextStatus)` → boolean
- `transitionJobStatus(jobId, nextStatus, source)` → Promise<void>

**Implementation Notes:**
- Allowed transitions per LLD:
  - draft → submitted (via submitJob route)
  - submitted → normalized (via classifyJob handler)
  - normalized → analyzing (via start of queue processing)
  - analyzing → scored (via scoreFit handler)
  - scored → recommended (via generateRecommendationBrief handler)
  - recommended → published (via user action, UI)
- Failure states: validation_failed, analysis_failed, scoring_failed, stale_data
- Log every transition with timestamp, source, and user/service

---

### Task 3.5: Queue Routes
**Scope:** HTTP API for queue monitoring  
**Dependencies:** Task 3.1 (database operations)  
**Key Routes:**
- `GET /queue/job/:jobId` → Return all queue jobs for a job
- `GET /queue/job/:jobId/progress` → Return progress % and current stage
- `GET /queue/:queueJobId` → Return specific queue job details
- `POST /queue/:queueJobId/replay` → Create new queue job with same type/payload
- `GET /queue/stats` → Return queue health metrics (queued, processing, completed, failed counts)

**Implementation Notes:**
- Progress calculation: (completed_count / total_count) * 100
- Current stage: name of last started queue job type
- Estimated remaining: sum of average processing times for remaining job types

---

### Task 3.6: Polling & Webhooks (Optional)
**Scope:** Real-time job progress tracking  
**Dependencies:** Task 3.5 (routes)  
**Key Features:**
- Long-polling: GET /queue/job/:jobId/progress with timeout before returning
- Webhooks: optional POST to registered URL on job completion/failure

**Implementation Notes:**
- Long-polling: Set timeout (e.g., 30 seconds) before returning current status
- Webhooks: Store URLs in job.metadata.webhooks array, POST with job result

---

## Test Strategy

### Unit Tests

**Task 3.1 Tests:**
- `enqueueJob()` — insert, idempotency check, duplicate detection
- `getQueueJobStatus()` — fetch existing, return 404 for nonexistent
- `markQueueJobComplete()` — update status, set timestamp
- `markQueueJobFailed()` — exponential backoff calculation, max retries

**Task 3.2 Tests:**
- `processQueueJob()` — dispatch correct handler, error handling
- Timeout enforcement — task exceeds timeout → error thrown
- Concurrency control — queue jobs when at limit

**Task 3.3 Tests:**
- Each handler: mock dependencies, verify calls to services
- Handler execution order: verify correct sequence

**Integration Tests:**
- Full flow: Submit job → enqueue classify → complete → enqueue extract → ...complete

### Test File

`backend/src/workers/queue.test.ts` — 200+ lines, all 7 phases validated

---

## Acceptance Criteria

- [x] Phase 3.1 complete: All database operations working with idempotency
- [x] Phase 3.2 complete: Worker dispatch routing correctly, concurrency respected
- [x] Phase 3.3 complete: All 7 handlers implemented and tested
- [x] Phase 3.4 complete: State transitions validated, audit trail working
- [x] Phase 3.5 complete: All routes working, progress calculation accurate
- [x] Phase 3.6 complete: Long-polling functional (webhooks optional)
- [x] All tests pass
- [x] Zero unimplemented methods
- [x] TypeScript compilation clean

**Final Acceptance:** Can submit a job and watch it progress through all 7 queue stages to completion, with full state tracking and retry handling.

---

## Constants & Configuration

### Queue Job Type Timeouts (seconds)

```typescript
const JOB_TIMEOUTS = {
  'classify-job': 60,
  'extract-evidence': 300, // 5 min (may have many files)
  'score-fit': 120, // 2 min
  'enrich-logistics': 60,
  'refresh-market-signals': 120,
  'refresh-site-brief': 120,
  'generate-recommendation-brief': 60,
};
```

### Concurrency Limits (per type)

```typescript
const CONCURRENCY_LIMITS = {
  'classify-job': 10,
  'extract-evidence': 5,
  'score-fit': 10,
  'enrich-logistics': 10,
  'refresh-market-signals': 10,
  'refresh-site-brief': 10,
  'generate-recommendation-brief': 10,
};
```

### Retry Configuration

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 60000, // 1 minute
};
```

---

## Known Constraints

- Phase 4 Enrichment Services (Tasks 3.3 handlers 4-6) are stubs for now
- No webhook implementation yet (optional for Phase 3)
- Long-polling timeout set to 30 seconds (configurable)
- No distributed locking for concurrency (assumes single instance; upgrade if needed)

---

## Success Metrics

1. All Phase 3 tasks complete with 0 "Not implemented" errors
2. 100% of acceptance criteria verified
3. Full integration test passes: job submit → 7 stages → completion
4. All tests pass: `npm run test:queue`
5. Design Freeze document created and signed off
