# DFN Discovery — Security Architecture

**Status:** Authoritative reference  
**Scope:** Discovery-side security concerns only  
**Audience:** Discovery engineers, platform team, security reviewers  
**Related docs:** [DFN_MAIN_REPO_INTEGRATION.md](DFN_MAIN_REPO_INTEGRATION.md), [DFN_HLD.md](DFN_HLD.md), [DFN_LLD.md](DFN_LLD.md), [DFN_IDP_DESIGN.md](DFN_IDP_DESIGN.md)  
**Platform decisions:** All open questions resolved — see §12

---

## Guiding Principle

> **Discovery does not own identity. Discovery trusts identity.**

Authentication — who you are — is the platform's job. Authorization — what you may do inside Discovery — is Discovery's job. These two responsibilities must never blur.

---

## 1. System Boundary Overview

```mermaid
flowchart TB
    subgraph Platform["DFN Platform Layer"]
        IdP["Identity / IdP\n(Auth0)"]
        Billing["Billing / Plan\n(Stripe + svc)"]
        Gateway["API Gateway\n(rate limit)"]
    end

    subgraph Discovery["DFN Discovery (this repo)"]
        AuthMW["Auth Middleware\nvalidates JWT via JWKS\n(no IdP round-trip)"]
        QuotaMW["Quota Middleware\nenforces plan limits\nfrom token claims"]
        Routes["Route Handlers\nresource-level authorization"]
        DataLayer["Data Layer\nevery query scoped by org_id"]

        AuthMW --> QuotaMW --> Routes --> DataLayer
    end

    IdP -- "issues JWT" --> AuthMW
    Billing -- "emits quota claims" --> QuotaMW
    Gateway -- "proxies request" --> AuthMW
```

Discovery never stores passwords, never manages sessions, and never issues its own tokens.

---

## 2. Authentication

### 2.1 Token Format

All API requests to Discovery must carry a signed **JWT** issued by the DFN platform identity provider. **The IdP is Auth0.**

The token is sent as a standard `Authorization: Bearer <token>` header.

Discovery validates the token signature using Auth0's **JWKS endpoint**, which is available at:

```
https://<tenant>.auth0.com/.well-known/jwks.json
```

This is set via the `AUTH_ISSUER_URL` environment variable. Discovery constructs the JWKS URL automatically by appending `/.well-known/jwks.json`. Validation is stateless — no round-trip to Auth0 per request.

**Auth0 custom claim namespace:** Auth0 requires custom JWT claims to use a URL-formatted namespace (not a bare prefix). All DFN-specific claims use the namespace `https://fabnetwork.com.ng/` as the prefix:

```typescript
interface DFNTokenClaims {
  // Standard JWT claims
  sub: string;          // Auth0 user ID, e.g. 'auth0|abc123'
  iss: string;          // e.g. 'https://dfn.auth0.com/'
  aud: string;          // must match AUTH_AUDIENCE env var ('dfn-discovery')
  exp: number;          // expiry timestamp (unix)
  iat: number;          // issued-at timestamp (unix)

  // DFN platform custom claims (Auth0 namespace: https://fabnetwork.com.ng/)
  'https://fabnetwork.com.ng/orgId': string;          // organisation the user belongs to
  'https://fabnetwork.com.ng/orgRole': OrgRole;       // 'owner' | 'admin' | 'member' | 'viewer'
  'https://fabnetwork.com.ng/plan': PlanTier;         // 'free' | 'team' | 'business' | 'enterprise'
  'https://fabnetwork.com.ng/quotas': QuotaClaims;    // remaining allowances for current billing period
  'https://fabnetwork.com.ng/features': string[];     // feature flags unlocked on this plan
}

type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';
type PlanTier = 'free' | 'team' | 'business' | 'enterprise';

interface QuotaClaims {
  jobsRemaining: number;      // jobs left this billing period
  batchSizeLimit: number;     // max child jobs per batch request
  apiCallsRemaining: number;  // total API calls left
}
```

These custom claims are injected at login time via an **Auth0 Action** (post-login hook) that reads the user's org and plan from the DFN platform database and attaches them to the token. Discovery reads them at the namespaced keys above.

> **Note on quota claim freshness:** Quota claims embedded in the JWT are a snapshot taken at token issuance. **Access token TTL is set to 15 minutes** (see §2.2). For soft limits (displaying a warning), the token claim is sufficient. For hard enforcement (blocking a job submission), the quota middleware verifies against the platform billing service in real-time when the token claim is exhausted.

### 2.2 Auth Middleware Contract

**Token TTL: 15 minutes.** This is the agreed access token lifetime. It is short enough to keep quota claim drift acceptable (at most one billing period's worth of calls before a hard check) while avoiding excessive token-refresh pressure on clients. Refresh tokens may have a longer lifetime (e.g. 7 days with rotation) — that is Auth0's concern, not Discovery's.

Every protected route in Discovery must pass through `authMiddleware` before its handler runs. The middleware must:

1. Extract the `Authorization` header.
2. Verify the JWT signature using the cached JWKS keys. Cache keys locally for 24 hours.
   * **Key Rotation Safeguard**: If an unknown Key ID (`kid`) is encountered, trigger a debounced JWKS reload (maximum once per 5 minutes) to protect against JWKS flooding Denial of Service (DoS) attacks. Reject the token immediately if the cached keys cannot verify the token and the debouncing threshold prevents a reload.
3. Validate `iss` and `aud` against environment config.
4. Reject expired tokens (`exp < now`).
5. Attach the decoded claims to `res.locals.auth` for downstream use.
6. Return `401 Unauthorized` if any check fails — never a `403`.

```typescript
// Conceptual middleware signature
async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void>

// What downstream handlers receive
interface AuthContext {
  userId: string;          // from token.sub
  orgId: string;           // from token['https://fabnetwork.com.ng/orgId']
  orgRole: OrgRole;        // from token['https://fabnetwork.com.ng/orgRole']
  plan: PlanTier;          // from token['https://fabnetwork.com.ng/plan']
  quotas: QuotaClaims;     // from token['https://fabnetwork.com.ng/quotas']
  features: string[];      // from token['https://fabnetwork.com.ng/features']
}
```

### 2.3 Unauthenticated Endpoints

The following endpoints are intentionally public and must not require a token:

| Route | Reason | Auth method |
|---|---|---|
| `GET /health` | Infrastructure health check | None (public) |
| `POST /webhooks/safetyculture` | Inbound inspection events from SafetyCulture | HMAC-SHA256 (`x-iauditor-signature`) |
| `POST /webhooks/upkeep` | Inbound work-order status events from UpKeep | HMAC-SHA256 (`x-upkeep-signature`) |

All other routes — including `/jobs`, `/scoring`, `/enrichment`, `/queue`, `/batch`, `/recommendations` — require a valid token.

### 2.4 Webhook Authentication (SafetyCulture and UpKeep)

Both third-party integrations send inbound webhooks to Discovery. Neither uses JWT — each uses **HMAC-SHA256 signature verification** with a provider-specific shared secret and header.

**SafetyCulture** (`POST /webhooks/safetyculture`):

1. Read the `x-iauditor-signature` header.
2. Compute `HMAC-SHA256(rawBody, SAFETYCULTURE_WEBHOOK_SECRET)`.
3. Compare with the received signature using a constant-time comparison.
4. Return `401` immediately if it does not match — do not enqueue the job.

**UpKeep** (`POST /webhooks/upkeep`):

1. Read the `x-upkeep-signature` header (UpKeep's webhook signature header — confirm exact name in UpKeep docs at implementation time).
2. Compute `HMAC-SHA256(rawBody, UPKEEP_WEBHOOK_SECRET)`.
3. Compare with the received signature using a constant-time comparison.
4. Return `401` immediately if it does not match — do not enqueue the job.

Both handlers must use Node's `crypto.timingSafeEqual` for comparison. No string equality (`===`) is acceptable — it is vulnerable to timing attacks.

---

## 3. Authorization (Resource-Level)

### 3.1 What the Platform Provides

The JWT tells Discovery:

- **Who the user is** (userId, orgId)
- **What tier they are on** (plan)
- **What their org role is** (owner, admin, member, viewer)

### 3.2 What Discovery Enforces

Discovery enforces whether a specific actor may perform a specific action on a specific resource. This is not delegated to the platform.

**Authorization matrix:**

| Resource | Action | owner | admin | member | viewer |
|---|---|---|---|---|---|
| Job | create | ✅ | ✅ | ✅ | ❌ |
| Job | read own | ✅ | ✅ | ✅ | ✅ |
| Job | read org | ✅ | ✅ | ✅ | ✅ |
| Job | delete | ✅ | ✅ | ❌ | ❌ |
| Batch | create | ✅ | ✅ | ✅ | ❌ |
| Batch | read | ✅ | ✅ | ✅ | ✅ |
| Factory profile | create/edit | ✅ | ✅ | ❌ | ❌ |
| Factory profile | read | ✅ | ✅ | ✅ | ✅ |
| Recommendation | read | ✅ | ✅ | ✅ | ✅ |
| Recommendation | export/report | ✅ | ✅ | ✅ | ❌ |
| Queue | replay | ✅ | ✅ | ❌ | ❌ |
| Queue stats | read | ✅ | ✅ | ❌ | ❌ |

### 3.3 Resource Ownership Rule

Every resource in Discovery's database is owned by an `org_id`. A user may only access resources belonging to their own `org_id`. This is enforced at the database query level — never by post-filtering in application code.

```sql
-- Every query must include org_id scope
SELECT * FROM jobs
WHERE id = $1
  AND org_id = $2;  -- $2 = res.locals.auth.orgId
```

Returning a `404` for resources that belong to a different org (rather than a `403`) is intentional. It prevents org ID enumeration attacks.

---

## 4. Multi-Tenancy and Data Isolation

### 4.1 Required Schema Changes

The following columns must be added to Discovery's database before any production deployment:

| Table | Column | Type | Description |
|---|---|---|---|
| `jobs` | `org_id` | `TEXT NOT NULL` | Owning organisation |
| `jobs` | `created_by` | `TEXT NOT NULL` | `userId` who submitted |
| `factories` | `org_id` | `TEXT NOT NULL` | Organisation that registered the factory |
| `recommendations` | `org_id` | `TEXT NOT NULL` | Denormalised for fast query scoping |
| `batch_manifests` | `org_id` | `TEXT NOT NULL` | Owning organisation |
| `attachments` | `org_id` | `TEXT NOT NULL` | Owning organisation |

**Migration rule:** `org_id` columns must carry a `NOT NULL` constraint and a database-level index. There are no cross-org joins. If a query needs to touch resources from multiple orgs, it is wrong by design.

### 4.2 Enterprise Data Isolation

Enterprise plan orgs may contractually require stricter isolation. Discovery supports two levels, and **physical schema provisioning is Discovery's responsibility**:

| Level | Mechanism | When used | Who provisions |
|---|---|---|---|
| **Logical isolation** | `org_id` scoping in all queries | Default for all plans | Automatic (no provisioning needed) |
| **Physical isolation** | Separate Postgres schema per org (schema-per-tenant) | Enterprise contracts with data residency requirements | **Discovery** (via background workers queue triggered by platform webhooks) |

The application code must not need to know which level is active — the database connection string and schema search path are the only difference. Discovery provides a provisioning worker (to be built in Phase 7) that creates the per-org schema and runs migrations against it asynchronously.

**Provisioning contract:**

- **Triggered via Webhook**: The DFN platform calls `POST /webhooks/provision-org` when an org upgrades to Enterprise.
- **Asynchronous Execution**: Upon receipt, the route handler validates the webhook HMAC signature, registers the request, enqueues a schema-provisioning job in the BullMQ queue, and returns `202 Accepted` immediately to prevent HTTP timeouts.
- **Worker Execution**: The queue worker creates a Postgres schema named `org_<orgId>` and runs all database migrations against it.
- **Metadata Registry**: The schema name is mapped and looked up from a `org_schema_map` config table at database connection time.
- **Schema Teardown**: Org offboarding follows the same pattern in reverse and requires explicit multi-factor administrative confirmation.

> [!WARNING]
> **PostgreSQL Schema Scaling Limits**: 
> A schema-per-tenant architecture in PostgreSQL introduces catalog bloat, memory overhead, and planning performance degradation when scaling beyond 100–200 schemas. For scales exceeding this threshold, the infrastructure must distribute schemas across database shards (multi-database instance routing) rather than relying on a single cluster.

### 4.3 Factory Profiles and Shared Data

Factory profiles represent real-world Nigerian factories and may be shared across orgs (so different clients can receive recommendations against the same factory). The visibility model:

- Factory profiles with `org_id = NULL` are **platform-managed** (verified by the DFN operations team, visible to all orgs).
- Factory profiles with an `org_id` set are **org-private** (visible only to that org — used when a company registers a private manufacturing partner).

Scoring always includes both platform-managed and org-private factories.

---

## 5. Rate Limiting

### 5.1 Two-Tier Architecture

```mermaid
flowchart TB
    Client(["Client Request"])

    subgraph GW["DFN API Gateway  —  network-layer threat"]
        G1["Global rate limit per org\n(e.g. 1 000 req / min)"]
        G2["Burst protection\n(token bucket)"]
        G3["JWT validation\n(JWKS cached fast path)"]
        G1 --> G2 --> G3
    end

    subgraph BE["Discovery Backend  —  domain-specific throttling"]
        D1["Semantic rate limits\n(plan-aware, per endpoint class)"]
        D2["Queue depth caps\n(runaway batch protection)"]
        D3["AI call throttling\n(per-org concurrent job limit)"]
        D1 --> D2 --> D3
    end

    Client --> GW --> BE
```

The platform gateway handles the network-layer threat. Discovery handles domain-specific throttling that requires business context.

### 5.2 Discovery-Side Rate Limit Rules

| Endpoint class | Free | Team | Business | Enterprise |
|---|---|---|---|---|
| Job submissions | 5 / month | 50 / month | 500 / month | Custom |
| Concurrent AI analyses | 1 | 5 | 20 | Custom |
| Batch child job limit | 5 / batch | 25 / batch | 100 / batch | Custom |
| API requests / minute | 60 | 300 | 1 000 | Custom |
| Report exports / day | 2 | 20 | Unlimited | Custom |

Rate limit responses must use `HTTP 429 Too Many Requests` with a `Retry-After` header in seconds.

### 5.3 Queue Priority by Plan

Plan tier influences processing priority in the job queue. Higher-tier jobs are dequeued first when the queue is under load:

```typescript
const QUEUE_PRIORITY: Record<PlanTier, number> = {
  enterprise: 100,
  business: 70,
  team: 40,
  free: 10,
};
```

Free plan jobs may experience queue delays during peak periods. This is by design and must be communicated clearly in the UI.

---

## 6. Billing and Quota Enforcement

### 6.1 Responsibility Split

| Concern | Owned by |
|---|---|
| Plan definitions (what's included) | DFN Platform billing service |
| Subscription state (active, lapsed, cancelled) | DFN Platform billing service |
| Usage metering (counting events) | Discovery (emits events to platform) |
| Quota enforcement (blocking over-limit actions) | Discovery (reads claims, verifies live if needed) |

Discovery must never have billing logic — it must never calculate what a user owes, store payment methods, or manage subscription state.

### 6.2 Quota Check Flow

```mermaid
flowchart TB
    A(["POST /jobs/submit"])
    B["authMiddleware\nattach token claims → res.locals.auth"]
    C{"Is 'quota-exhausted'\nstate cached in Redis?"}
    D["❌ 402 Payment Required\n(Fast Reject via Cache)"]
    E{"JWT claim shows\njobsRemaining > 0?"}
    F{"Decrement Redis-backed\ntenant job counter"}
    G["✅ Fast path — allow"]
    H["Live check: platform billing API"]
    I{"Is quota exhausted?"}
    J["Cache exhaust in Redis (2m TTL)\nReturn ❌ 402 Payment Required"]
    K["Reset local Redis counter\n✅ Allow"]
    L["Discovery creates job"]
    M["Emit usage event\n→ platform billing service\n{ discovery.job.submitted, orgId, userId }"]

    A --> B --> C
    C -- yes --> D
    C -- no --> E
    E -- yes --> F
    F -- success (count > 0) --> G --> L
    F -- fail (exhausted) --> H
    E -- no --> H
    H --> I
    I -- yes --> J
    I -- no --> K --> L
    L --> M
```

#### Quota Enforcement Mechanisms

To guarantee reliability and prevent abuse in high-concurrency production environments:

1. **Redis Concurrency Counter**: A short-lived (15-minute) counter is stored in Redis for each tenant. When a job is submitted, this counter is decremented atomically. This prevents users from bypassing quotas by submitting concurrent requests simultaneously before the JWT access token (15-minute TTL) expires or refreshes.
2. **Negative Response Caching**: If the live check to the platform billing service determines that an organization's quota is exhausted, this negative status is cached in Redis with a 2-minute TTL. Any subsequent job submissions within this window will fail immediately with a `402 Payment Required` response without hitting the platform billing database.
3. **Webhook-Driven Eviction**: When a user upgrades their plan or purchases additional quotas, the platform billing service sends a webhook to Discovery. Discovery immediately evicts the cached negative quota state and updates the local Redis counter, restoring access without requiring a logout/login cycle.

### 6.3 Feature Flag Enforcement

Feature flags from the token (`dfn/features`) control access to plan-gated features. Examples:

| Feature flag | Required plan | Controls |
|---|---|---|
| `discovery:batch` | Team+ | Access to `POST /batch` |
| `discovery:prism-import` | Team+ | Accept PrismReport in job intake |
| `discovery:export-report` | Team+ | Generate PDF/HTML reports |
| `discovery:api-access` | Business+ | Programmatic API access (no UI required) |
| `discovery:custom-factories` | Business+ | Register org-private factory profiles |
| `discovery:analytics` | Business+ | Access to `/analytics/*` endpoints |
| `discovery:priority-queue` | Business+ | Priority queue processing |
| `discovery:sso` | Enterprise | SAML/OIDC SSO for the org |
| `discovery:audit-log` | Enterprise | Full audit log export |
| `discovery:dedicated-workers` | Enterprise | Isolated worker pool |

If a token does not contain the required feature flag, the endpoint returns `403 Forbidden` with a body indicating the required plan.

---

## 7. Cross-Product Security (Prism → Discovery)

### 7.1 The Integration Model

When a user exports a PrismReport from Prism into Discovery, the data crosses a product boundary. The correct model is a **one-way authenticated push**:

```mermaid
sequenceDiagram
    actor User
    participant Prism
    participant Discovery
    participant IdP as "DFN IdP (JWKS)"

    User->>Prism: Export PrismReport
    Prism->>Discovery: POST /jobs\nAuthorization: Bearer <user JWT>\nBody: { prismProjectId, prismReport, ...jobInput }
    Discovery->>IdP: Fetch / use cached JWKS keys
    IdP-->>Discovery: Public signing keys
    Discovery->>Discovery: Validate JWT signature, iss, aud, exp\nVerify dfn/orgId matches\nCheck feature flag: discovery:prism-import
    alt token invalid or feature missing
        Discovery-->>Prism: 401 / 403
        Prism-->>User: Export failed
    else valid
        Discovery->>Discovery: Create job\nmetadata.source = { product: prism, projectId }
        Discovery-->>Prism: 201 Created { jobId }
        Prism-->>User: Export successful
    end
```

Discovery never calls Prism directly. The data flow is strictly unidirectional.

### 7.2 Contract for PrismReport Import

The shape of a `PrismReportManifest` is a shared contract defined in `@dfn/shared`, not in either product's codebase. Both Prism and Discovery depend on that shared type. Breaking changes to this contract are release events requiring a version bump.

```typescript
// Defined in @dfn/shared — not in Discovery or Prism
interface PrismReportManifest {
  schemaVersion: string;        // e.g. '1.0.0'
  projectId: string;
  productName: string;
  processes: PrismProcess[];    // manufacturing steps
  materials: PrismMaterial[];
  estimatedVolume?: string;
  exportedAt: string;           // ISO 8601
}
```

Discovery must reject import requests where `prismReport.schemaVersion` is not in its supported range. It must return a `422 Unprocessable Entity` with a clear version mismatch message — never silently drop fields.

### 7.3 Service-to-Service Calls (Future)

If Discovery ever needs to call another DFN product proactively (e.g., to fetch supplementary Prism data), it must use a **service token** obtained via the **Auth0 Client Credentials flow** (OAuth 2.0 machine-to-machine). The specific scopes and audience values for each inter-service operation are deferred to implementation time, but the mechanism is fixed:

```
POST https://<tenant>.auth0.com/oauth/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "<Discovery M2M App client_id>",
  "client_secret": "<AUTH0_CLIENT_SECRET>",
  "audience": "https://api.fabnetwork.com.ng"
}
```

Service tokens issued this way must:

- Have a TTL of 5 minutes or less.
- Carry a scope claim identifying the calling service (e.g. `service:discovery`).
- Not carry user-level plan or quota claims.
- Be cached for their remaining TTL and not re-fetched on every call — Auth0 rate-limits the token endpoint.
- Be stored only in memory (never persisted to database or logs).

The `AUTH0_CLIENT_ID` and `AUTH0_CLIENT_SECRET` for Discovery's M2M application are separate from the user-facing Auth0 application credentials.

User tokens must never be forwarded to other services — this is a hard rule.

---

## 8. Enterprise Security Requirements

### 8.1 SSO / SAML Federation

Enterprise orgs may configure their own identity provider (e.g., Okta, Azure AD, Google Workspace) to authenticate their users. This is handled entirely by **Auth0 Enterprise Connections** — Discovery has no role in SSO configuration.

From Discovery's perspective: an enterprise user with SSO configured produces the same JWT structure as any other user, with the same `https://fabnetwork.com.ng/` namespaced custom claims injected by the Auth0 Action. Discovery cannot distinguish SSO users from non-SSO users, and it does not need to.

### 8.2 Audit Logging

For enterprise orgs, every significant operation in Discovery must emit a structured audit event. **Events are published to a Kafka topic** owned by the DFN platform. The topic name is `dfn.audit.events`.

Discovery acts as a Kafka **producer only** — it never reads from the audit topic. The platform's audit log aggregator is the consumer and is responsible for retention, indexing, and SIEM export.

```typescript
// Emitted by Discovery for every auditable action
interface AuditEvent {
  eventName: string;         // e.g. 'discovery.job.submitted'
  actorUserId: string;       // from token.sub
  actorOrgId: string;        // from token['https://fabnetwork.com.ng/orgId']
  resourceType: string;      // 'job' | 'batch' | 'recommendation' | etc.
  resourceId: string;
  plan: PlanTier;            // from token['https://fabnetwork.com.ng/plan']
  timestamp: string;         // ISO 8601
  metadata?: Record<string, unknown>;
}
```

**Kafka producer contract:**

- Topic: `dfn.audit.events`
- Partition key: `orgId` (ensures all events for one org land in the same partition, preserving order)
- Delivery: at-least-once (idempotent producer enabled)
- Serialisation: JSON
- Failure behaviour: audit emission must never block or fail a user-facing HTTP request. However, rather than swallowing errors (which risks compliance gaps during network splits), failed events are written to a Redis-backed failover queue (or a local transactional Outbox table). A background queue worker continually retries delivery to Kafka. If the broker is unreachable beyond a configurable threshold (e.g., 3 hours), critical operations alerts are triggered for administrative intervention.

**Required audit events for Discovery:**

| Event | Trigger |
|---|---|
| `discovery.job.created` | POST /jobs |
| `discovery.job.submitted` | POST /jobs/:id/submit |
| `discovery.job.deleted` | DELETE /jobs/:id |
| `discovery.recommendation.exported` | GET /recommendations/:id/report |
| `discovery.batch.created` | POST /batch |
| `discovery.batch.replayed` | POST /batch/:id/replay |
| `discovery.factory.created` | POST /factories (org-private) |
| `discovery.prism.imported` | Job created via PrismReport import |
| `discovery.api-key.used` | Programmatic API access (business+ only) |

Audit events must be emitted asynchronously (fire-and-forget to Kafka) — they must not block the response path.

### 8.3 Org-Wide Quota Pools

Enterprise orgs are issued a single large shared quota pool, not per-user quotas. One user submitting 100 jobs reduces the quota available to the entire org by 100. The quota state is managed by the platform billing service. Discovery enforces it through the quota middleware described in section 6.2.

---

## 9. Sensitive Data Handling

### 9.1 What Discovery Stores

| Data type | Where stored | Sensitivity |
|---|---|---|
| Job details (company name, product, process) | Postgres `jobs` table | Medium — business confidential |
| Attachments (design files, surveys) | Object storage (S3/R2) with signed URLs | High |
| Recommendation scores and evidence | Postgres `recommendations` table | Medium |
| Factory profiles | Postgres `factories` table | Low (industry-known data) |
| API keys for external services (HERE, SafetyCulture, UpKeep, etc.) | Environment variables / secrets manager | Critical |
| Webhook secrets (SafetyCulture + UpKeep) | Environment variables / secrets manager | Critical |
| JWT signing keys | Never stored — fetched from IdP JWKS | N/A |
| User passwords | Never stored | N/A |

### 9.2 What Discovery Must Never Store

- User passwords or password hashes.
- Raw payment card data.
- JWT tokens (store only the decoded `userId` and `orgId` as needed for audit records).
- Private IdP signing keys.

### 9.3 Attachment Access Control

Attachments (design files, survey documents) are stored in object storage behind signed URLs with a short TTL (15 minutes). The signed URL endpoint must validate that the requesting user's `orgId` matches the attachment's `org_id` before issuing the URL. Attachment storage keys must be opaque UUIDs — never the original filename.

### 9.4 PII Considerations

Discovery stores `company_name`, `product_name`, and `created_by` (a user ID from the platform IdP). If these fields could be considered PII under GDPR or similar regulations for specific users:

- Data deletion requests must be handled by clearing the user-identifying fields (set `created_by = '[deleted]'`) rather than deleting the job record (which breaks recommendation history integrity).
- The `org_id` must be retained for data integrity.
- Deletion requests are handled by the platform team and propagated to Discovery via a webhook or admin API call.

---

## 10. Security Hardening Checklist

These are non-negotiable before any production deployment:

### Transport

- [ ] All traffic uses HTTPS / TLS 1.2+. HTTP is rejected.
- [ ] HSTS header present on all responses.
- [ ] `POST /webhooks/safetyculture` verifies HMAC-SHA256 signature before processing (`x-iauditor-signature`).
- [ ] `POST /webhooks/upkeep` verifies HMAC-SHA256 signature before processing (`x-upkeep-signature`).
- [ ] Both webhook handlers use `crypto.timingSafeEqual` — no string equality comparison.

### Auth

- [ ] Auth middleware applied to all non-public routes.
- [ ] JWKS keys cached locally (24h), rotated on key ID mismatch.
- [ ] Token expiry validated before any handler runs.
- [ ] `iss` and `aud` validated against environment config — not hardcoded.

### Data

- [ ] Every database query includes `org_id` scope.
- [ ] Attachment URLs are signed and short-lived (≤ 15 min TTL).
- [ ] No raw secrets in application logs.
- [ ] External API keys stored in secrets manager (not in `.env` files on production).

### Input

- [ ] All request bodies validated against strict TypeScript schemas before use.
- [ ] SQL parameters use parameterised queries (Drizzle ORM enforces this).
- [ ] File upload MIME types validated server-side (not trusted from `Content-Type` header alone).
- [ ] Maximum file size enforced server-side.

### Dependencies

- [ ] `npm audit` runs in CI and blocks on critical/high severity findings.
- [ ] Node.js version pinned in `.nvmrc` and Docker image.
- [ ] No packages with known unpatched CVEs in production bundle.

### Headers

- [ ] `X-Content-Type-Options: nosniff` on all responses.
- [ ] `X-Frame-Options: DENY` on all responses.
- [ ] `Content-Security-Policy` configured for the frontend.
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` on all responses.

---

## 11. Environment Variables Reference

The following environment variables are required for Discovery's security posture. All must be provided via a secrets manager in production — never committed to source control.

```bash
# ─── Auth0 (Identity Provider) ───────────────────────────────────────────────
# Auth0 tenant issuer URL. JWKS fetched from {AUTH_ISSUER_URL}/.well-known/jwks.json
AUTH_ISSUER_URL=https://<tenant>.auth0.com/
# Must match the 'audience' configured on the Auth0 API for Discovery
AUTH_AUDIENCE=dfn-discovery
# Custom claim namespace (Auth0 requires URL format)
AUTH_CLAIM_NAMESPACE=https://fabnetwork.com.ng/

# ─── Auth0 M2M (Service-to-Service, Client Credentials) ──────────────────────
# Credentials for Discovery's Machine-to-Machine Auth0 application
# Used when Discovery calls other DFN services proactively (future use)
AUTH0_CLIENT_ID=<Discovery M2M application client_id>
AUTH0_CLIENT_SECRET=<Discovery M2M application client_secret>
AUTH0_TOKEN_ENDPOINT=https://<tenant>.auth0.com/oauth/token

# ─── Platform Services ───────────────────────────────────────────────────────
DFN_PLATFORM_API_URL=https://api.fabnetwork.com.ng

# ─── Billing ─────────────────────────────────────────────────────────────────
BILLING_API_URL=https://billing.fabnetwork.com.ng

# ─── Kafka (Audit Event Bus) ──────────────────────────────────────────────────
# Comma-separated list of Kafka broker addresses
KAFKA_BROKERS=broker1:9092,broker2:9092
# Topic to produce audit events to
KAFKA_AUDIT_TOPIC=dfn.audit.events
# Optional: SASL credentials if the Kafka cluster requires authentication
KAFKA_SASL_USERNAME=
KAFKA_SASL_PASSWORD=
KAFKA_SSL=true

# ─── Webhook Secrets ─────────────────────────────────────────────────────────
# SafetyCulture: the HMAC secret configured in the SafetyCulture webhook settings
SAFETYCULTURE_WEBHOOK_SECRET=<HMAC secret from SafetyCulture webhook settings>
# UpKeep: the HMAC secret configured in the UpKeep webhook settings
UPKEEP_WEBHOOK_SECRET=<HMAC secret from UpKeep webhook settings>

# ─── Database (scoped credentials) ───────────────────────────────────────────
DATABASE_URL=postgresql://dfn_discovery_app:...@host:5432/dfn_discovery

# ─── Infrastructure ──────────────────────────────────────────────────────────
REDIS_URL=redis://:password@host:6379

# ─── External Provider Keys ──────────────────────────────────────────────────
HERE_API_KEY=<HERE platform key>
GEOAPIFY_API_KEY=<Geoapify key>
UPKEEP_API_KEY=<UpKeep API key>
SAFETYCULTURE_API_KEY=<SafetyCulture API key>
OPENAI_API_KEY=<OpenAI key>
ANTHROPIC_API_KEY=<Anthropic key>
GOOGLE_API_KEY=<Google AI key>

# ─── Object Storage ──────────────────────────────────────────────────────────
ATTACHMENT_BUCKET=dfn-discovery-attachments
ATTACHMENT_SIGNING_KEY=<S3-compatible signing key>
ATTACHMENT_URL_TTL_SECONDS=900   # 15 minutes
```

---

## 12. Resolved Platform Decisions

All decisions previously listed as open questions have been answered. They are recorded here for traceability.

| # | Question | Decision |
|---|---|---|
| 1 | **IdP choice** | **Auth0.** JWKS endpoint: `https://<tenant>.auth0.com/.well-known/jwks.json`. Custom claims use the URL namespace `https://fabnetwork.com.ng/` (Auth0 requires URL-formatted namespaces). Custom claims injected via an Auth0 Post-Login Action. |
| 2 | **Token TTL / quota drift** | **15 minutes** for access tokens. Short enough to limit quota claim drift to at most one billing window; consistent enough to avoid excessive token-refresh pressure. Refresh tokens managed by Auth0 (7-day sliding window with rotation). |
| 3 | **Service token issuance** | **Auth0 Client Credentials flow** (`grant_type=client_credentials`). Discovery holds its own M2M application credentials (`AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`). Specific scopes and audience per inter-service operation are deferred to implementation. Service tokens must be cached for their TTL and never persisted. |
| 4 | **Audit bus** | **Kafka topic `dfn.audit.events`**. Discovery is a producer only. Partition key is `orgId`. At-least-once delivery with idempotent producer. JSON serialisation. Kafka broker addresses and credentials configured via `KAFKA_BROKERS`, `KAFKA_SASL_USERNAME/PASSWORD`. |
| 5 | **Enterprise schema provisioning** | **Discovery's responsibility.** When a DFN platform webhook signals an org upgrade to Enterprise, Discovery provisions a Postgres schema `org_<orgId>` and runs migrations against it. Teardown follows the same pattern. Implementation deferred to Phase 7. |

---

*This document describes Discovery's security posture from Discovery's point of view. Platform-side concerns (Auth0 tenant configuration, billing service implementation, API gateway setup, Kafka cluster management) are out of scope and owned by the DFN platform team.*

**Last Updated:** June 27, 2026  
**Next Review:** Before Phase 7 (Security Hardening) implementation begins
