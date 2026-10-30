# Operations, Configuration & Troubleshooting

This document provides operational guidelines, environment configuration details, and runbooks for running DFN Discovery in staging and production environments.

---

## 1. Environment Configuration Matrix

The application is configured through environment variables loaded at runtime. Below is the comprehensive matrix:

| Variable | Category | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `PORT` | Server | Yes | `5000` | Port on which Express listens for incoming HTTP connections. |
| `NODE_ENV` | Server | Yes | `development` | Runtime environment (`development`, `production`, `test`). |
| `DATABASE_URL` | Database | Yes | - | PostgreSQL connection URI, e.g. `postgres://user:pass@host:5432/dfn_discovery?sslmode=require`. |
| `REDIS_URL` | Cache/Queue | No | `redis://localhost:6379` | Redis connection URI for caching and job queue storage. |
| `AUTH_DISABLED` | Auth | No | `false` | When `true`, bypasses JWT validation for local development and assigns `orgId: default-org`. |
| `AUTH_ISSUER_URL`| Auth | Prod | - | OIDC Identity Provider issuer URL (e.g., Auth0 / Keycloak). |
| `AUTH_AUDIENCE` | Auth | Prod | - | Expected audience claim for incoming JWT tokens. |
| `AUTH_JWKS_URI` | Auth | Prod | - | Public JSON Web Key Set endpoint for RS256 token verification. |
| `BILLING_API_URL`| Billing | No | `https://billing.fabnetwork.com.ng` | Platform billing endpoint for quota validation and credit decrements. |
| `GOOGLE_MAPS_API_KEY` | Location | Prod | - | Google Cloud Platform API key with Geocoding, Distance Matrix, and Directions APIs enabled. |
| `GOOGLE_ROUTES_API_KEY` | Location | No | Fallback to Maps key | Dedicated API key for Google Routes v2 if separated by IAM policy. |
| `AI_PROVIDER` | AI Core | Yes | `google` | Active LLM adapter: `google` (Gemini), `openai` (GPT-4o), or `anthropic` (Claude). |
| `GEMINI_API_KEY` | AI Core | If Google | - | Google AI Studio or Vertex AI API key for Gemini models. |
| `OPENAI_API_KEY` | AI Core | If OpenAI | - | OpenAI API key. |
| `ANTHROPIC_API_KEY` | AI Core | If Anthropic | - | Anthropic API key. |
| `SAFETYCULTURE_WEBHOOK_SECRET` | Webhook | Prod | - | Shared HMAC secret for verifying `x-iauditor-signature` from SafetyCulture. |
| `UPKEEP_WEBHOOK_SECRET` | Webhook | Prod | - | Shared HMAC secret for verifying `x-upkeep-signature` from UpKeep CMMS. |

---

## 2. Deployment Architecture

```mermaid
flowchart LR
    subgraph FrontendHosting ["Frontend Hosting (Vercel)"]
        NextApp["dfn-ui / Next.js<br>App Router"]
    end

    subgraph BackendHosting ["Backend Hosting (Railway / Cloud Run)"]
        ExpressApp["Express API Container<br>(Node.js 20)"]
        QueueWorkers["Worker Threads /<br>Queue Consumer"]
    end

    subgraph ManagedInfra ["Managed Infrastructure"]
        Postgres[("PostgreSQL 14+<br>(Managed Instance)")]
        RedisInst[("Redis 7+<br>(Queue & Cache)")]
    end

    NextApp -->|HTTPS /api/v1| ExpressApp
    ExpressApp --> Postgres
    ExpressApp --> RedisInst
    QueueWorkers --> Postgres
    QueueWorkers --> RedisInst
```

### Deployment Targets
- **Frontend**: Deployed to Vercel via automated git branch deployments.
- **Backend**: Containerized via Dockerfile and deployed to Railway or Google Cloud Run as a stateless service.
- **Database**: Managed PostgreSQL on Railway, AWS RDS, or Google Cloud SQL. Connection pooling must be configured with a minimum of 10 connections.
- **Cache / Queue**: Managed Redis instance (Upstash or Redis Cloud).

### Container Health & Readiness Probes

The backend exposes a lightweight health check endpoint at `/health`:

```bash
GET /health
```

**Response (HTTP 200 OK)**:
```json
{
  "status": "ok",
  "timestamp": "2026-10-30T22:30:00.000Z"
}
```

Container orchestrators (Kubernetes / Cloud Run / Railway) should poll `/health` every 10–30 seconds with an initial delay of 5 seconds.

---

## 3. Logging & Observability

- **Structured Operational Logging**: Application events and worker transitions are logged with timestamps, job IDs, and log levels.
- **Security Auditing**: Failed HMAC webhook signatures and rate-limit triggers are emitted to stderr with source IP and origin headers.
- **Activity Streams**: User actions (e.g., job submissions, quote awards) are recorded in the `project_activities` table for audit trails.

---

## 4. Operational Runbooks & Troubleshooting

### Incident 1: Database Connection Refused (`ECONNREFUSED 5432`)
- **Symptoms**: Route requests return HTTP 500; backend logs report `Error: connect ECONNREFUSED 127.0.0.1:5432`.
- **Diagnostic Steps**:
  1. Verify the PostgreSQL service status: `sudo systemctl status postgresql` (Linux) or check Docker desktop.
  2. Test connection string via `psql`:
     ```bash
     psql "$DATABASE_URL" -c "SELECT 1;"
     ```
  3. Ensure `DATABASE_URL` uses the correct host, port, credentials, and SSL mode (`sslmode=require` for hosted databases).
- **Remediation**:
  Restart PostgreSQL. In local environments, launch local container:
  ```bash
  docker run --name dfn-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15
  ```

### Incident 2: Rate Limit Exceeded on Webhooks (`HTTP 429`)
- **Symptoms**: SafetyCulture or UpKeep delivery logs report HTTP 429 Too Many Requests.
- **Diagnostic Steps**:
  1. Inspect `backend/src/middleware/rate-limiter.ts`: Webhook rate limiting allows 100 requests per 15-minute window per IP.
  2. Check if a single IP is delivering high-volume batch payloads.
- **Remediation**:
  If legitimate integrations exceed this threshold, adjust `max` in `webhookRateLimiter` or implement IP allowlisting for third-party webhook sender ranges.

### Incident 3: Stalled Queue Jobs
- **Symptoms**: Queue jobs remain in `processing` or `pending` state indefinitely.
- **Diagnostic Steps**:
  1. Query `queue_jobs` table for jobs with `status = 'processing'` and `updated_at < NOW() - INTERVAL '15 minutes'`.
  2. Check worker container logs for uncaught exceptions or external API timeouts.
- **Remediation**:
  The queue worker contains automatic timeout recovery that marks jobs as `failed` after exceeding `timeoutSeconds` and schedules a retry with exponential backoff.
