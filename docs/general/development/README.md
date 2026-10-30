# Development & Engineering Guide

This guide outlines engineering patterns, conventions, and operational workflows for contributing to the DFN Discovery codebase.

---

## 1. Codebase Conventions & Standards

### Strict TypeScript Configuration

The monorepo enforces high strictness settings in `tsconfig.json`:
- `strict: true`: Enables strict null checks, strict function types, and strict property initialization.
- `noImplicitReturns: true`: Functions must explicitly return on all code paths.
- `noUnusedLocals: true` & `noUnusedParameters: true`: Unused variables and imports are treated as compilation errors.
- `noFallthroughCasesInSwitch: true`: Switch statements must explicitly break or return.

> [!TIP]
> In Express route handlers with `Promise<void>`, avoid `return res.json(...)`. Express `Response.json()` returns `Response`, not `void`. Instead, write:
> ```typescript
> res.json(data);
> return;
> ```

### Directory Structure

```
backend/src/
├── db/                     # Data persistence
│   ├── client.ts           # Drizzle connection pool initialization
│   ├── queries.ts          # Centralized multi-tenant query helpers
│   ├── schema.ts           # Drizzle schema definitions
│   └── seeds/              # Initial seed datasets (e.g. standards-seed.ts)
├── middleware/             # Ingress middleware pipeline
│   ├── auth.ts             # JWT decoding & orgId context attachment
│   ├── error.ts            # Global AppError class and error handler
│   ├── quota.ts            # Billing quota verification
│   ├── rate-limiter.ts     # Express rate limiters
│   └── webhook-auth.ts     # HMAC-SHA256 signature verifier
├── routes/                 # Express controllers and endpoint definitions
│   ├── dag-routing.ts      # Multi-stage routing endpoints
│   ├── enrichment.ts       # Facility availability & logistics
│   ├── jobs.ts             # RFQ intake and pipeline management
│   ├── projects.ts         # Sourcing project management
│   ├── quotes.ts           # Supplier quote submission & award
│   ├── standards.ts        # Standards catalog & factory certifications
│   └── webhooks.ts         # Inbound webhook receivers
├── services/               # Pure business logic and domain execution
│   ├── ai-providers/       # Quarantined LLM adapters (OpenAI, Anthropic, Google)
│   ├── dag-routing-service.ts # Process graph decomposition & scoring
│   ├── geo-logistics.ts    # Distance, routing & isoline calculation
│   ├── sourcing-service.ts # Quote ranking and stage progression
│   └── standards-service.ts# SDO catalog search & cross-referencing
└── workers/                # Asynchronous task execution
    ├── queue.ts            # Job queue implementation
    └── worker.ts           # Worker execution loops
```

---

## 2. Authoring Routes & Endpoints

Route controllers must adhere to the following architecture:
1. **Extract Auth Context**: Read tenant identity exclusively from `res.locals.auth`.
2. **Validate Request Inputs**: Sanitize parameters and enforce boundary limits (e.g., maximum array lengths to prevent DoS).
3. **Delegate to Domain Services**: Keep route handlers thin; business logic belongs in `services/`.
4. **Use `AppError` for Operational Failures**: Always forward errors via `next(error)`.

### Route Handler Pattern

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/error';
import { computeCompositeChainScore } from '../services/dag-routing-service';

const router: Router = Router();

router.post('/simulate', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auth = res.locals.auth;
    const orgId = auth?.orgId || 'unknown';

    const { stages, weights, frictions } = req.body;

    if (!Array.isArray(stages) || stages.length > 50) {
      throw new AppError(400, 'stages must be an array with at most 50 items');
    }

    const result = computeCompositeChainScore(stages, weights, frictions);

    res.json({ success: true, result });
    return;
  } catch (error) {
    next(error);
  }
});

export default router;
```

---

## 3. Database Workflows with Drizzle ORM

The backend utilizes **Drizzle ORM** with `pg` connection pooling.

### Adding Schema Changes

1. Edit table definitions in `backend/src/db/schema.ts`:
   ```typescript
   export const myNewTable = pgTable('my_new_table', {
     id: uuid('id').primaryKey().defaultRandom(),
     org_id: text('org_id').notNull(),
     created_at: timestamp('created_at').defaultNow().notNull(),
   });
   ```

2. Generate TypeScript types and push schema changes:
   ```bash
   # Push schema changes directly to the local development database
   corepack pnpm --filter @dfn/backend db:push

   # Or generate migration SQL files for production deployment
   corepack pnpm --filter @dfn/backend db:generate
   ```

3. Visualizing Data:
   Launch Drizzle Studio to inspect and edit database records in a browser UI:
   ```bash
   corepack pnpm --filter @dfn/backend db:studio
   ```

### Writing Multi-Tenant Queries

Always expose database interactions through parameterized query helpers in `backend/src/db/queries.ts`. Never perform un-scoped queries that omit the tenant condition:

```typescript
// Good: Strictly isolated by org_id
export async function getJobById(jobId: string, orgId: string) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.org_id, orgId)))
    .limit(1);
  return job || null;
}
```

---

## 4. Testing Strategy

DFN Discovery maintains comprehensive unit, integration, and end-to-end tests:

### Test Execution Commands

| Command | Scope |
| :--- | :--- |
| `corepack pnpm test` | Runs the full Vitest suite across all test files |
| `corepack pnpm --filter @dfn/backend run test:adapters` | Tests OpenAI, Anthropic, and Google Gemini AI provider adapters |
| `corepack pnpm --filter @dfn/backend run test:core` | Smoke tests the deterministic capability scoring engine |
| `corepack pnpm run type-check` | Full monorepo TypeScript verification |

### Writing Unit Tests

Tests reside alongside source files (e.g., `dag-routing-service.test.ts`) using **Vitest**:

```typescript
import { describe, it, expect } from 'vitest';
import { computeCompositeChainScore } from './dag-routing-service';

describe('computeCompositeChainScore', () => {
  it('should return 0 if any mandatory bottleneck stage fails', () => {
    const stageScores = [95, 0, 88];
    const weights = [1.0, 1.5, 1.0];
    const result = computeCompositeChainScore(stageScores, weights);
    
    expect(result.compositeChainScore).toBe(0);
  });
});
```
