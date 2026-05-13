# DFN Design Freeze — 2026-05-10 T12:00

This document records the design freeze for Phase 1 Step 2 (Core Intelligence) as of 2026-05-10.

Summary of changes frozen:

- Implemented deterministic, weight-driven scoring engine in `backend/src/services/core-intelligence.ts`.
  - Component scorers: `process_match`, `material_match`, `capacity_match`, `geography_and_logistics`, `market_access`, `evidence_confidence`.
  - Aggregation via `SCORING_WEIGHTS` from shared constants.
  - Confidence penalty applied per missing component using `CONFIDENCE_PENALTY_FACTOR`.
  - Feasibility score computed as average of capacity and logistics.
  - Ranking pipeline (`rankRecommendations`) applies gate rules and returns top-N.

- Wired initial HTTP endpoint: `POST /scoring/score-job` implemented at `backend/src/routes/scoring.ts`.
  - Accepts `{ jobId, factoryIds? }`, fetches job and factories, invokes scoring, returns results.
  - Evidence mapping is placeholder (empty arrays) in Phase 1.

- Added a lightweight test harness: `backend/src/services/core-intelligence.test.ts` with sample data.
  - Script added: `npm run test:core` (backend) to execute the harness via `ts-node`.

Design decisions and rationale:

- Use shared constants (`SCORING_WEIGHTS`, `CONFIDENCE_PENALTY_FACTOR`, `RECOMMENDATION_GATE_RULES`) to keep scoring deterministic and tunable.
- Phase 1 uses simple heuristics for component scorers to accelerate integration and review; external services (geo, market intelligence) are planned for Phase 2.
- Minimal DB integration for factories and job retrieval; recommendations persistence and evidence extraction are out-of-scope for this phase.

Remaining non-test work (post-freeze) that must be addressed in later phases or PRs:

- Replace heuristics with real calls to geo and market services.
- Persist recommendations to `recommendations` table and emit events for downstream consumers.
- Implement evidence extraction and attach evidence items to recommendations.
- Improve gate rules and make runtime-configurable thresholds.
- Add robust error handling, retries, timeouts, and observability (metrics/traces).

Frozen-by: GitHub Copilot (code contributions recorded in repository)

