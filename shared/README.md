# Shared Types and Utilities

This package contains all shared types, constants, and utilities used across the DFN Gap Analyzer application.

## Structure

- `types/` — Domain models (Job, Factory, Recommendation)
- `constants/` — Scoring rules and configuration

## Usage

Import types from `@dfn/shared`:

```typescript
import { Job, JobStatus, Recommendation } from '@dfn/shared';
```

## Building

```bash
npm run build -w shared
```
