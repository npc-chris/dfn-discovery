# DFN Design Freeze - Phase 5 Batch Coordination Acceptance

**Date:** 2026-06-27  
**Phase:** 5 (Batch Coordination)  
**Status:** COMPLETE & FROZEN  

## Overview

This design freeze documents the implementation, contract definitions, and test verification of the Batch Coordination layer (`/batch/*`). This layer orchestrates bulk job requests, tracks progress dynamically via async job queues, groups execution states, and manages fan-out/fan-in processing of manufacturing evaluations.

## Endpoint Specifications

### 1. Submit Bulk Jobs
* **POST `/batch`**
  * **Description:** Initiates a new batch by validating all input payloads, persisting a batch manifest, creating child job records, and dispatching their first queue processing stage (`classify-job`). Supports idempotency.
  * **Payload:**
    ```json
    {
      "idempotencyKey": "string (optional)",
      "jobs": [
        {
          "company_name": "Acme Corp",
          "product_name": "Widget A",
          "location": { "country": "NG", "state": "Lagos" },
          "metadata": {}
        }
      ],
      "metadata": {}
    }
    ```
  * **Response:** `BatchManifest` (JSON)

### 2. Retrieve Batch Status & Rollup
* **GET `/batch/:batchId`**
  * **Description:** Returns the batch manifest details along with overall rollup counts (completed, failed, processing, pending) and lists child jobs with their individual statuses.
  * **Response:** `BatchStatusRollup` (JSON)

### 3. Retrieve Real-Time Progress
* **GET `/batch/:batchId/progress`**
  * **Description:** Inspects individual queue statuses for all child jobs within the batch to calculate a total completed progress percentage and determine the dominant active processing stage.
  * **Response:** `BatchProgressResponse` (JSON)

### 4. Replay Batch Failures
* **POST `/batch/:batchId/replay`**
  * **Description:** Scans for failed queue workers of child jobs in the batch and replays only those failures, resetting their status back to `submitted` and updating the overall batch manifest to `processing`.
  * **Response:** `{ "message": "Batch replay initiated successfully" }` (JSON)

## Database Schema Integration

The implementation is backed by two primary database entities under Drizzle ORM:
1. **`batch_manifests`**: Persists the batch ID, idempotency key (preventing duplicate processing), status (`processing`, `completed`, `failed`), custom metadata, and creation/modification timestamps.
2. **`jobs`**: Augmented with a `batch_id` column to form a 1-to-many relationship mapping children back to their parent batch manifest.

## Quality & Architecture Patterns

* **Atomicity & Fail-Fast Validation:** The coordination engine validates *all* child job payloads up front using `validateJobInput`. If even one job payload is malformed, the API rejects the batch immediately (returning HTTP 400) before any records are committed to the DB or jobs enqueued.
* **Granular Retry Semantics:** The replay engine targets only the failing worker items within a batch, avoiding redundant resource-intensive recalculations of already completed sibling jobs.
* **Deterministic Status Rollup:** The overall batch status is dynamically evaluated and stored whenever a status request is made, transitioning to `completed` only when all jobs finish successfully or a mix of success/failure completes.

## Verification & Test Sign-off

* **Test Suite:** Verified via `corepack pnpm test` using Vitest.
* **Test Location:** [batch-coordination.test.ts](file:///c:/Users/HP/OneDrive%20-%20COVENANT%20UNIVERSITY%20COMMUNITY/GitHub/dfn-discovery/backend/src/services/batch-coordination.test.ts)
* **Results:** All 5 tests passed successfully, covering bulk generation, validation blocks, status rollup calculation, progress percentage aggregation, and failed job replay behavior.

---
**Phase 5 is now fully complete, verified, and frozen.**  
Next Phase: **Phase 6 (Presentation Layer)**.
