# DFN Main Repo Integration

## Decision

DFN Discovery is a standalone product boundary.

It can integrate with the main DFN repository, but only through versioned contracts, identity, and explicit APIs or events. It should not import or share the main repo's runtime state, database tables, or internal application modules.

## What Can Be Shared

- Authentication identity and role claims through a common identity provider.
- Versioned API contracts and generated client types.
- Shared domain constants that are stable and versioned.
- Optional UI tokens or primitives, if published as a separate package.

## What Must Stay Separate

- Database schemas and migrations.
- Session storage and local user state.
- Queue state and worker state.
- Ad hoc direct imports from the main repo application code.

## Recommended Integration Pattern

1. Keep Discovery's backend, frontend, and database independent.
2. Publish reusable contracts from a dedicated shared package or generated client artifact.
3. Use authenticated API calls for synchronous reads and writes.
4. Use webhooks or events for asynchronous sync between repos.
5. Keep auth centralized in one identity provider, then map claims to local roles in each app.

## Practical Contract List

The first shared contracts should be:

- job and factory domain types
- recommendation and evidence payloads
- scoring constants and gate rules
- authenticated user identity claims
- API request and response schemas

## Implementation Rules

- No cross-repo database access.
- No direct runtime dependency on unpublished source files from the other repo.
- No duplicate business logic across both repos when a shared contract can hold it.
- No shared session store unless the session format is explicitly versioned and owned by the identity layer.

## Maintenance Rules

- Version shared contracts explicitly.
- Treat breaking contract changes as release events.
- Keep adapters thin so each repo can evolve independently.
- Prefer backward-compatible schema changes in the shared contract package.

## Suggested Environment Variables

- `AUTH_ISSUER_URL`
- `AUTH_AUDIENCE`
- `MAIN_REPO_API_URL`
- `SHARED_CONTRACT_VERSION`
- `DFN_IDENTITY_PROVIDER`

## Ownership Summary

Discovery owns its own data plane and business logic.

The main DFN repo can provide identity, upstream content, and shared contracts, but it does not own Discovery's runtime behavior.