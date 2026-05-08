---
description: "Use when running gstack first-wave skills in this repository: /review, /investigate, /qa-only, /careful, /freeze, /guard, /unfreeze, /plan-eng-review, /plan-design-review. Applies DFN-specific scope, risk, and output defaults."
applyTo: "**/*"
---

# DFN First-Wave Gstack Customization

This repository is an active product codebase. When using gstack first-wave skills, follow these local defaults.

## Scope and change control

- Prefer narrow, surgical changes over broad rewrites.
- Do not introduce architecture migrations unless explicitly requested.
- Never modify generated or vendor content unless the task explicitly targets it.
- Keep changes inside the requested feature or bug scope.

## Stack applicability filters

- Assume DFN runtime stack is: Next.js (frontend), Express (backend), Drizzle + Postgres (data), Redis (cache/queues), Vercel (frontend hosting), Railway (backend hosting).
- Treat repository conventions as TypeScript-first unless a file clearly indicates otherwise.
- Ignore framework-specific assumptions that are not present in this repo (for example: Rails, Django, Laravel, Spring Boot, ASP.NET, Phoenix, native iOS/Android).
- Do not recommend framework migrations, language rewrites, or platform pivots unless explicitly requested by the user.
- Prefer changes that fit existing folder boundaries: frontend/src for UI, backend/src for API/business logic, shared docs/config in root only when required.
- Treat cloud/deploy guidance as repo-specific and evidence-based. Do not inject provider-specific defaults unless corresponding config exists in the workspace.

## Safety defaults

- Treat destructive commands as opt-in only.
- Require explicit confirmation before operations that can remove data or overwrite history.
- Prefer report-only outcomes when a safe equivalent exists.
- Never initialize nested Git repositories inside workspace subdirectories (for example under frontend/ or backend/).
- Before running scaffold/init commands that may touch Git state, verify the active repository root first (`git rev-parse --show-toplevel`) and run from repo root unless explicitly requested otherwise.
- If an unintended nested `.git` directory appears, stop feature work, remove only the nested `.git` metadata, and verify only the root `.git` remains.

## Skill-specific behavior

### /review

- Prioritize production-risk findings first: security, correctness, data integrity, auth, payments, and regressions.
- Do not auto-expand scope into unrelated refactors.
- If no major findings exist, state residual test and coverage risks briefly.

### /investigate

- Follow root-cause-first debugging.
- Log observed evidence before proposing fixes.
- Stop after repeated failed fixes and summarize likely root causes plus next checks.

### /qa-only

- Default to report-only bug findings and reproducible steps.
- Include severity, likely impact, and minimal repro paths.
- Prefer concise checklists over long narratives.

### /careful, /freeze, /guard, /unfreeze

- Use these as operational safety rails.
- Default freeze boundary to the smallest relevant directory.
- Unfreeze only after the scoped task is complete.

### /plan-eng-review

- Default posture is HOLD SCOPE for DFN unless the user asks for expansion.
- Focus on architecture fit for current stack: Next.js frontend, Express backend, Drizzle/Postgres, Redis.
- Emphasize migration risk, testability, rollback, and incremental delivery.
- Flag and reject recommendations that depend on absent frameworks or tooling unless the user explicitly requests adopting them.

### /plan-design-review

- Keep design guidance implementation-ready and component-level.
- Ensure mobile behavior, loading/empty/error states, and accessibility are explicitly covered.
- Avoid generic visual advice; anchor recommendations to concrete screens and interactions.

## Output style

- Keep outputs decision-oriented and concise.
- For recommendations, include one preferred option and one fallback.
- When asking follow-up questions, keep to the minimum needed to proceed.
