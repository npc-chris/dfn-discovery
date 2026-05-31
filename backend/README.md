# Backend

Express.js API server for DFN Discovery.

Implements the service boundaries defined in the HLD: Job Intake, Core Intelligence, AI Analysis Workers, and context services.

## Getting Started

```bash
pnpm run dev
```

Backend runs on `http://localhost:5000`.

## Structure

- `routes/` — API endpoints
- `services/` — Business logic (Core Intelligence, Job Intake, etc.)
- `workers/` — AI Analysis Workers and async job handlers
- `db/` — Database schema and queries
- `middleware/` — Express middleware

## Building

```bash
pnpm run build
pnpm run start
```

## Database

Migrations:

```bash
pnpm run db:migrate
```

Seed:

```bash
pnpm run db:seed
```

## Testing

```bash
pnpm test
```
