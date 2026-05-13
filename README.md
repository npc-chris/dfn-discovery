# DFN Discovery

AI-powered manufacturing job routing and analysis for Nigerian factories.

## What Is This?

DFN Discovery helps product companies decide whether a manufacturing job can be routed to a Nigerian factory with acceptable cost, lead time, capability fit, and operational risk.

This is not a general chat product. The system ingests structured inputs, computes scores, and returns decision-ready outputs.

## Planning and Design

The architecture is frozen in the planning docs:

- [Service Plan](docs/DFN_SERVICE_PLAN.md) — Product wedge, scope, and AI strategy
- [Service Map](docs/DFN_SERVICE_MAP.md) — System shape and service boundaries
- [High-Level Design](docs/DFN_HLD.md) — Architectural decisions and principles
- [Low-Level Design](docs/DFN_LLD.md) — Schemas, APIs, and state machines
- [Main Repo Integration](docs/DFN_MAIN_REPO_INTEGRATION.md) — Standalone boundary, shared contracts, and auth integration
- [Sequence Diagrams](docs/DFN_SEQUENCE_DIAGRAMS.md) — Core flows and worker patterns

**Implementation Phase:**
PHASE 1: SCAFFOLDING (1 day) — Build the skeleton codebase with empty services, routes, and data models based on the frozen design docs. No real logic yet, just the structure.

- [Design Freeze Checkpoint](docs/DFN_DESIGN_FREEZE-08-05-2026-T15-11.md) — Complete scaffolded specification (services, routes, queue, schema)
- [Implementation Validation](docs/DFN_IMPLEMENTATION_VALIDATION.md) — Validation of scaffolded code against frozen docs (✅ PASSED)
- [Implementation Checklist](docs/DFN_IMPLEMENTATION_CHECKLIST.md) — Detailed task list for full service implementation (7 phases, 4 weeks)

Start with the Service Plan if this is your first time.

## Folder Structure

```
dfn-gap-analyzer/
  docs/               # Planning and design (frozen)
  frontend/           # Next.js web app
  backend/            # Express API and services
  shared/             # Shared types and utilities
  .github/            # GitHub workflows and templates
```

## Local Setup

### Requirements

- Node.js 18+
- Postgres 14+
- Redis 7+
- Bun (optional, for faster installs)

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

### Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:5000`.

## Development

### Running Both

From the root:

```bash
npm run dev
```

This starts frontend and backend in parallel.

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

## Deployment

- Frontend: Vercel
- Backend: Railway
- Database: Postgres on Railway
- Cache: Redis on Railway

See `.env.example` for configuration variables.

## Contributing

Changes that affect the planning docs require a design review before implementation.

Start with a feature branch and submit a PR.
