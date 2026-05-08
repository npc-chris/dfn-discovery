# Backend

Express.js API server for DFN Gap Analyzer.

Implements the service boundaries defined in the HLD: Job Intake, Core Intelligence, AI Analysis Workers, and context services.

## Getting Started

```bash
npm run dev
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
npm run build
npm start
```

## Database

Migrations:

```bash
npm run db:migrate
```

Seed:

```bash
npm run db:seed
```

## Testing

```bash
npm test
```
