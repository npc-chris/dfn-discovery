# System Overview & Service Boundaries

DFN Discovery is an AI-powered manufacturing job intake, capability analysis, and multi-stage process routing platform designed specifically for Nigerian industrial ecosystems.

The platform solves a critical operational challenge: **determining whether an engineering or manufacturing Request for Quote (RFQ) can be reliably fulfilled by domestic Nigerian factories with acceptable landed cost, lead time, technical capability fit, and operational risk.**

---

## 1. Product Mission & Wedge

Nigerian manufacturing presents unique structural characteristics:
- High spatial and infrastructural variance across industrial clusters (e.g., Ikeja, Nnewi, Kano, Aba, Port Harcourt).
- Intermittent supply chain continuity (raw materials, power availability, tooling logistics).
- Multi-standard compliance requirements (SON/NIS domestic standards alongside ISO, ASTM, ASME, DIN, and API international standards).
- Fragmented shop-floor capabilities requiring multi-stage process clustering (e.g., casting in one facility, CNC finish machining in another, and surface treatment/coating in a third).

DFN Discovery serves as the **intelligence and routing core** that:
1. Ingests raw RFQs, unstructured specifications, and CAD drawings.
2. Deconstructs requirements into a structured **Bill of Process (BOP)** formatted as a Directed Acyclic Graph (DAG).
3. Matches every process stage against verified factory capability matrices.
4. Computes spatial impedance, inter-facility logistics friction, and Total Landed Cost (TLC).
5. Cross-references compliance standards against domestic Nigerian NIS equivalents.
6. Delivers deterministic, ranked recommendations with actionable gap analyses.

> [!IMPORTANT]
> DFN Discovery is **not a conversational chatbot**. The platform is built on strict determinism: LLMs are strictly quarantined to unstructured data extraction and evidence summarization, while all scoring, routing, gating, and cost calculations are governed by mathematical models and database constraints.

---

## 2. Monorepo Architecture

The repository is structured as a high-performance **pnpm workspace** monorepo:

```
dfn-discovery/
├── shared/              # Shared TypeScript contracts, DTOs, and constants
│   ├── src/types/       # Job, Factory, Recommendation, Standards interfaces
│   └── src/constants/   # Scoring thresholds, weight matrices, status enums
├── backend/             # Express.js REST API and domain execution engine
│   ├── src/db/          # PostgreSQL schemas (Drizzle ORM), seeds, and queries
│   ├── src/middleware/  # Auth, rate limiting, quota enforcement, error handling
│   ├── src/routes/      # REST API route controllers
│   ├── src/services/    # Pure domain logic (DAG routing, Standards, Geo, Scoring)
│   └── src/workers/     # Asynchronous job queue and background task processors
├── frontend/            # Next.js 14 web application (App Router)
│   ├── src/app/         # UI pages (Dashboard, Jobs, Factories, RFQ Explorer)
│   └── src/components/  # Tailwind CSS & Radix UI design components
└── docs/                # Architecture, design specifications, and GitBook docs
```

### Monorepo Boundaries & Responsibilities

| Package | Purpose | Technologies |
| :--- | :--- | :--- |
| **`@dfn/shared`** | Defines canonical domain interfaces, status state machines, and scoring constants shared between client and server. | TypeScript, `tsc` build |
| **`@dfn/backend`** | Implements the core REST API, multi-tenant isolation, Google Maps logistics adapters, SDO cross-referencing, and job queue. | Node.js 20, Express 4, Drizzle ORM, PostgreSQL, Redis, `@google/genai` |
| **`@dfn/frontend`** | Provides operational dashboards, interactive DAG process visualization, supplier quotation comparisons, and quote awarding. | Next.js 14, React 18, Tailwind CSS, Lucide Icons |

---

## 3. Local Development Quickstart

### Prerequisites

Ensure the following tools are installed on your workstation:
- **Node.js**: `v20.x` or higher
- **Corepack / pnpm**: `pnpm v10.x` (`corepack enable && corepack use pnpm@10`)
- **PostgreSQL**: `v14.x` or higher running on port `5432`
- **Redis**: `v7.x` or higher running on port `6379`

### Environment Configuration

Copy the example environment file and configure your credentials:

```bash
cp .env.example .env
```

Key environment variables to configure for local development:

```env
# Server
PORT=5000
NODE_ENV=development

# Database & Cache
DATABASE_URL=postgres://postgres:postgres@localhost:5432/dfn_discovery
REDIS_URL=redis://localhost:6379

# Multi-Tenancy & Auth (Set AUTH_DISABLED=true for frictionless local dev)
AUTH_DISABLED=true
AUTH_ISSUER_URL=https://auth.fabnetwork.com.ng/
AUTH_AUDIENCE=dfn-discovery-api

# Google Location Services
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GOOGLE_ROUTES_API_KEY=your_google_maps_api_key

# AI Provider (openai | anthropic | google)
AI_PROVIDER=google
GEMINI_API_KEY=your_gemini_api_key
```

### Installation & Startup

1. **Install dependencies across all workspaces**:
   ```bash
   corepack pnpm install
   ```

2. **Build shared contracts**:
   ```bash
   corepack pnpm --filter @dfn/shared build
   ```

3. **Initialize the database schema**:
   ```bash
   corepack pnpm --filter @dfn/backend db:push
   ```

4. **Seed standards catalog and test factories**:
   ```bash
   corepack pnpm --filter @dfn/backend run dev
   ```

5. **Start development servers (Root)**:
   ```bash
   corepack pnpm dev
   ```

The backend server listens on `http://localhost:5000`, and the frontend application launches at `http://localhost:3000`.

---

## 4. Verification & Testing

DFN Discovery enforces strict TypeScript checks and automated testing across all packages:

```bash
# Type check all workspaces
corepack pnpm run type-check

# Run backend unit and adapter tests
corepack pnpm --filter @dfn/backend run test:adapters
corepack pnpm --filter @dfn/backend run test:core

# Run comprehensive test suite
corepack pnpm test
```
