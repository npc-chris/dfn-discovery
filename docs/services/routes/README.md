# API Routes & Endpoint Reference

DFN Discovery provides a comprehensive RESTful API under the `/api/v1` namespace. This reference documents request parameters, response schemas, authentication requirements, and rate limiting rules for each endpoint.

---

## 1. Global API Conventions

### Base URL & Prefixes
- Primary API Path: `/api/v1`
- Backward Compatibility Alias: Root endpoints (e.g., `/jobs` aliases `/api/v1/jobs`)
- Inbound Webhooks: `/webhooks` (mounted before global JSON parsing for raw body HMAC validation)

### Authentication Headers
All protected `/api/v1` endpoints require a valid Bearer token:
```http
Authorization: Bearer <jwt-token>
```
For machine-to-machine integrations or internal services:
```http
X-Prism-Key: <internal-api-key>
```

### Standard Error Response Format
When a request fails, the API responds with a structured error payload:
```json
{
  "error": {
    "statusCode": 400,
    "message": "customStages must be an array with at most 50 items",
    "timestamp": "2026-10-30T22:45:00.000Z"
  }
}
```

### Rate Limiting Tiers
| Tier Limiter | Scope | Window | Max Requests | Message |
| :--- | :--- | :--- | :--- | :--- |
| `webhookRateLimiter` | `/webhooks/*` | 15 minutes | 100 per IP | `Too many webhook requests` |
| `authRateLimiter` | Verification & sensitive operations | 15 minutes | 60 per IP | `Too many verification attempts` |
| `apiRateLimiter` | General `/api/v1/*` routes | 15 minutes | 300 per IP | `Too many requests` |

---

## 2. Jobs & RFQ Pipeline Routes (`/api/v1/jobs`)

### `POST /api/v1/jobs`
Ingests a new manufacturing job or RFQ.

- **Auth**: Required
- **Body**:
  ```json
  {
    "company_name": "Dangote Sugar Refinery",
    "product_name": "Centrifugal Impeller Shaft",
    "project_id": "proj-uuid-1",
    "rfq_code": "RFQ-2026-089",
    "location": {
      "country": "NG",
      "state": "Lagos",
      "city": "Apapa",
      "latitude": 6.4474,
      "longitude": 3.3644
    },
    "bop": {
      "stages": [
        { "stage_index": 1, "process_type": "sand-casting", "tolerance_mm": 0.5 },
        { "stage_index": 2, "process_type": "cnc-turning", "tolerance_mm": 0.05 }
      ]
    },
    "target_price_max": 4500000,
    "target_lead_days": 21
  }
  ```
- **Response (HTTP 201 Created)**:
  ```json
  {
    "success": true,
    "job": {
      "id": "job-uuid-123",
      "status": "draft",
      "version": 1,
      "created_at": "2026-10-30T22:45:00.000Z"
    }
  }
  ```

### `GET /api/v1/jobs`
Lists active jobs within the authenticated organization, with optional filtering.

- **Query Parameters**:
  - `stage` (string, optional): Filter by job stage (e.g. `open`, `review`, `commit`).
  - `status` (string, optional): Filter by lifecycle state (`draft`, `submitted`, `scored`, `recommended`).
  - `projectId` (string, optional): Filter by associated project UUID.
- **Response (HTTP 200 OK)**:
  ```json
  {
    "jobs": [
      {
        "id": "job-uuid-123",
        "product_name": "Centrifugal Impeller Shaft",
        "stage": "open",
        "status": "submitted",
        "quote_count": 4,
        "lowest_quote_ngn": 3800000
      }
    ]
  }
  ```

---

## 3. Multi-Stage DAG Routing Routes (`/api/v1/jobs/:jobId/routing-dag`)

### `GET /api/v1/jobs/:jobId/routing-dag`
Resolves the process graph into a Directed Acyclic Graph (DAG) and generates multi-factory cluster recommendations.

- **Auth**: Required
- **Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "jobId": "job-uuid-123",
    "productName": "Centrifugal Impeller Shaft",
    "dag": {
      "stages": [
        { "id": "stage-1", "processType": "sand-casting", "criticalityWeight": 1.2 },
        { "id": "stage-2", "processType": "cnc-turning", "criticalityWeight": 1.0 }
      ],
      "edges": [
        { "fromStage": "stage-1", "toStage": "stage-2", "preservationRequired": true }
      ]
    },
    "recommendations": [
      {
        "clusterRank": 1,
        "compositeChainScore": 91,
        "stageGeometricMeanScore": 94.5,
        "totalLogisticsFriction": 0.038,
        "totalLandedCostNgn": 3950000,
        "totalLeadDays": 18,
        "factories": [
          { "stageIndex": 1, "factoryId": "f-casting-1", "factoryName": "Abeokuta Heavy Foundry" },
          { "stageIndex": 2, "factoryId": "f-machining-2", "factoryName": "Ikeja Precision CNC" }
        ]
      }
    ]
  }
  ```

### `POST /api/v1/jobs/:jobId/routing-dag/simulate`
Executes interactive what-if simulations on custom process assignments and logistics constraints.

- **Rate Limiting**: Protected against unbounded input injection (max 50 stages, 100 edges).
- **Body**:
  ```json
  {
    "customStages": [
      { "stageIndex": 1, "stageFitScore": 92, "criticalityWeight": 1.0 },
      { "stageIndex": 2, "stageFitScore": 88, "criticalityWeight": 1.2 }
    ],
    "customEdges": [
      { "fromStage": 1, "toStage": 2, "totalEdgeFriction": 0.02 }
    ],
    "quantity": 250
  }
  ```
- **Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "simulation": {
      "compositeChainScore": 90,
      "stageGeometricMeanScore": 89.8,
      "totalLogisticsFriction": 0.02,
      "totalLandedCostNgn": 8450000,
      "totalLeadDays": 24,
      "totalDistanceKm": 68.4
    }
  }
  ```

---

## 4. Standards & SDO Catalog Routes (`/api/v1/standards`)

### `GET /api/v1/standards`
Searches the multi-SDO standards database.

- **Query Parameters**:
  - `sdo` (string, optional): SDO filter (`SON`, `ISO`, `ASTM`, `ASME`, `API`, `DIN`, `IEC`).
  - `q` (string, optional): Full-text search term.
  - `standardNumber` (string, optional): Exact standard code match (e.g. `NIS 117`).
- **Response (HTTP 200 OK)**:
  ```json
  {
    "standards": [
      {
        "id": "std-117",
        "sdo": "SON",
        "standard_number": "NIS 117",
        "title": "Specification for Structural Steel for General Building Construction",
        "is_mandatory_nigerian": true
      }
    ]
  }
  ```

### `GET /api/v1/standards/resolve-equivalent`
Resolves international specifications to their official Nigerian NIS equivalents.

- **Query Parameters**:
  - `standardNumber` (string, required): e.g. `ASTM A36` or `ISO 9001:2015`.
- **Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "original": "ASTM A36",
    "hasEquivalent": true,
    "equivalents": [
      {
        "targetStandardNumber": "NIS 117",
        "targetSdo": "SON",
        "equivalenceType": "equivalent",
        "technicalNotes": "Tensile and elongation properties align with NIS Grade 43A."
      }
    ]
  }
  ```

### `PATCH /api/v1/standards/factories/:factoryId/certifications/:certId/verify`
Simulates and records IAF CertSearch / SON accreditation verification for a factory.

- **Rate Limiting**: `authRateLimiter` (60 req / 15 min).
- **Body**:
  ```json
  {
    "iafVerified": true,
    "iafCertSearchId": "IAF-NG-2026-9001-8842"
  }
  ```
- **Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "message": "Factory certification verified successfully",
    "certification": {
      "id": "cert-uuid-44",
      "factory_id": "factory-1",
      "verification_status": "verified",
      "is_iaf_verified": true,
      "verified_at": "2026-10-30T22:45:00.000Z"
    }
  }
  ```

---

## 5. Sourcing & Quotes Routes (`/api/v1/quotes` & `/api/v1/projects`)

### `GET /api/v1/projects/:projectId/metrics`
Returns the 5 executive sourcing KPI cards for an active project.

- **Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "metrics": {
      "totalSpendNgn": 18500000,
      "rfqsInPipeline": 6,
      "averageQuoteResponseHours": 14.2,
      "averageLeadDays": 21.5,
      "overallClusterSavingsPercent": 14.8
    }
  }
  ```

### `GET /api/v1/jobs/:jobId/quotes`
Retrieves submitted supplier quotations with dynamically calculated ranking badges.

- **Response (HTTP 200 OK)**:
  ```json
  {
    "quotes": [
      {
        "id": "quote-1",
        "factoryId": "factory-lagos-1",
        "factoryName": "Lagos Industrial Machining Ltd",
        "unitPriceNgn": 420000,
        "leadTimeDays": 14,
        "rankingBadges": ["BEST_MATCH", "FASTEST_DELIVERY"]
      },
      {
        "id": "quote-2",
        "factoryId": "factory-nnewi-2",
        "factoryName": "Nnewi Precision Tools",
        "unitPriceNgn": 365000,
        "leadTimeDays": 22,
        "rankingBadges": ["LOWEST_COST"]
      }
    ]
  }
  ```

### `POST /api/v1/quotes/:quoteId/award`
Awards the manufacturing contract to a selected quotation.

- **Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "quoteId": "quote-1",
    "status": "awarded",
    "jobStage": "commit",
    "message": "Contract successfully awarded. Project activity stream recorded."
  }
  ```

---

## 6. Webhooks (`/webhooks`)

### `POST /webhooks/safetyculture`
Receives SafetyCulture (iAuditor) audit completion webhooks.

- **Headers**:
  - `x-iauditor-signature`: `sha256=<hmac-hex>`
- **Rate Limiting**: `webhookRateLimiter` (100 req / 15 min).
- **Behavior**: Verifies HMAC against `SAFETYCULTURE_WEBHOOK_SECRET`, extracts `factory_id`, and enqueues a `refresh-site-brief` background job.

### `POST /webhooks/upkeep`
Receives UpKeep CMMS work-order events.

- **Headers**:
  - `x-upkeep-signature`: `sha256=<hmac-hex>`
- **Rate Limiting**: `webhookRateLimiter` (100 req / 15 min).
- **Behavior**: Verifies HMAC against `UPKEEP_WEBHOOK_SECRET` and triggers asynchronous factory maintenance log refreshes.
