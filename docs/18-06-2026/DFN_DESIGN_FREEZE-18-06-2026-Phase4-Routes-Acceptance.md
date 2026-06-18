# DFN Design Freeze - Phase 4 Routes Acceptance

**Date:** 2026-06-18  
**Phase:** 4 (Enrichment API Routes)  
**Status:** COMPLETE & FROZEN  

## Overview

This design freeze documents the implementation, contract definitions, and test verification of the Enrichment API routes (`/enrichment/*`). These routes connect frontend clients and internal web hooks to the underlaying Geo/Logistics, Market Intelligence, and Site/Real Estate services.

## Endpoint Specifications

### 1. Geo & Logistics

* **POST `/enrichment/logistics-assessment`**
  * **Description:** Computes route distance, travel duration, transport mode policies, and cost estimations between a job's delivery location and a factory.
  * **Payload:**

        ```json
        {
          "jobId": "uuid-string",
          "factoryId": "uuid-string"
        }
        ```

  * **Response:** `LogisticsAssessment` (JSON)

### 2. Market Intelligence

* **GET `/enrichment/market-signals/:factoryId`**
  * **Description:** Retrieves demand indicators, pricing bounds, and reputational indexes for a specific factory and product category.
  * **Query Params:** `productType: string` (Required)
  * **Response:** `MarketSignals` (JSON)

* **GET `/enrichment/market-outlook`**
  * **Description:** Generates natural language outlooks and confidence bands for general product category trajectories.
  * **Query Params:** `productType: string` (Required)
  * **Response:** `{ outlook: string, confidence: number }` (JSON)

### 3. Site & Facility Management

* **GET `/enrichment/site-brief/:factoryId`**
  * **Description:** Synthesizes facility condition scores, capacity utilization, equipment age, and certifications.
  * **Response:** `SiteBrief` (JSON)

* **GET `/enrichment/site-visit-report/:factoryId`**
  * **Description:** Returns the most recent SafetyCulture inspection report findings, freshness, and red flags.
  * **Response:** `{ lastVisitDate: string, daysSinceVisit: number, findings: string[], redFlags: string[], recommendations: string[] }` (JSON)

* **POST `/enrichment/check-availability`**
  * **Description:** Assesses if a factory can accommodate a job's capacity footprint and required production lead time.
  * **Payload:**

        ```json
        {
          "factoryId": "uuid-string",
          "requiredCapacityPercent": number,
          "requiredLeadDays": number
        }
        ```

  * **Response:** `{ available: boolean, reason?: string, alternative_dates?: string[] }` (JSON)

## Quality & Architecture Patterns

* **Decoupled Architecture:** Business logic handler functions are decoupled and exported independently of Express middleware wrappers. This allows them to be run, tested, and composed asynchronously inside queue workers or test scripts.
* **Error Handling:** The route wrappers enforce required body parameters and query inputs, throwing structured `AppError` instances (mapped to HTTP 400/404) rather than failing silently.
* **Database Constraints:** Endpoint handlers perform validation checks on job and factory resource existence in the Drizzle PG schema.

## Verification & Test Sign-off

* **Test Script:** Verified via `vitest run src/routes/enrichment.test.ts` using a custom database-free test runner configuration.
* **Results:** All 6 endpoints verified for call propagation, mock dependency returns, error boundaries, and input parameter enforcement.

---
**Phase 4 is now fully complete, verified, and frozen.**  
Next Phase: **Phase 5 (Batch Coordination)**.
