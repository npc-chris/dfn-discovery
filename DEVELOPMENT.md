# DFN Discovery Development

Development utilities and workspace configuration.

## Quick Start

1. Copy `.env.example` to `.env` and configure.
2. Install dependencies: `pnpm install`
3. Start dev servers: `pnpm run dev`

Frontend: `http://localhost:3000`  
Backend: `http://localhost:5000`

## Commands

- `pnpm run dev` — Start frontend and backend in parallel
- `pnpm run build` — Build all packages
- `pnpm run test` — Run all tests
- `pnpm run lint` — Lint all packages
- `pnpm run type-check` — Type-check all packages

## Database Setup

```bash
# Create database
createdb dfn_gap_analyzer

# Run migrations
pnpm run db:migrate -C backend

# Seed sample data
pnpm run db:seed -C backend
```

## Architecture

See [docs/](docs/) for the frozen planning and design:

- [Service Plan](docs/DFN_SERVICE_PLAN.md) — Product wedge and scope
- [Service Map](docs/DFN_SERVICE_MAP.md) — System boundaries
- [HLD](docs/DFN_HLD.md) — Architectural decisions
- [LLD](docs/DFN_LLD.md) — Implementation detail
- [Sequence Diagrams](docs/DFN_SEQUENCE_DIAGRAMS.md) — Core flows

## Stack

- **Frontend:** Next.js 14, React 18, TypeScript
- **Backend:** Express, TypeScript
- **Database:** Postgres with Drizzle ORM
- **Cache:** Redis
- **Hosting:** Vercel (frontend), Railway (backend/db)

## Contributing

1. Create a feature branch
2. Follow the planning docs
3. Submit a PR
4. Design review before merge
