# DFN Asynchronous 3-Tier Design Freeze Doctrine

**Initiative:** Digital Fabrication Network (DFN) & DFN Discovery  
**Governing Standard:** Ian Sommerville, *Engineering Software Products* (Chapter 8: Quality Management & CI/CD)  
**Classification:** Ecosystem Architecture & Quality Management Invariant  
**Applies To:** All 7 DFN Repositories (`dfn-discovery`, `dfn-prism`, `dfn-parametrics`, `dfn-ui`, `digital-fabrication-network`, `dfn-docs`, `dfn-scrutiny`)

---

## 1. Executive Philosophy: Anti-Bloat vs. Anti-Churn

In cyber-physical manufacturing coordination systems, unmanaged change creates catastrophic failure modes:
1. **Contract Churn:** When API schemas, CAD parser manifests (`dfn-prism`), or physical alloy properties (`dfn-parametrics`) change concurrently without synchronization gates, downstream pricing engines and frontend views break silently.
2. **Process Bloat:** Forcing an early-stage, resource-constrained team through monolithic waterfall freezes after every 2-week sprint halts agile velocity, creates administrative friction, and paralyzes momentum.

### The Doctrine
- **Sprint-Level Freezes are Banned:** 2-week sprints are execution cycles, not release gates. Never halt work at sprint ends.
- **Epic / Wave Boundary Freezes are Mandatory:** Calibrated, asynchronous freeze gates occur strictly at **Epic / Milestone Boundaries (every 4 to 6 weeks)** across three distinct system tiers.

---

## 2. The Asynchronous 3-Tier Freeze Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│               TIER 1: SCHEMA & CONTRACT FREEZE (At Epic Inception)     │
│ • Scope: Shared TypeScript types, REST/WebSocket API signatures,       │
│          and BRep CAD output manifests (@dfn/shared, PrismManifest).    │
│ • Rule: Once an Epic enters 'In Progress', its external data contracts │
│         FREEZE. Downstream repos develop against frozen schemas/mocks. │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Parallel Feature Development
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               TIER 2: UI & INTERACTION FREEZE (1 Sprint Pre-Pilot)     │
│ • Scope: Shell geometry tokens (Rule R30), navigation hierarchy, and   │
│          primary intake workflows (CAD dropzone, supplier drawers).    │
│ • Rule: 1 sprint before customer exposure, UI geometry is locked. No   │
│         visual refactoring—only defect resolution and CLS stability.   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Final Release Verification
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               TIER 3: RELEASE SOAK FREEZE (48-Hour Quiet Window)       │
│ • Scope: Entire ecosystem release candidate branch.                    │
│ • Rule: 48-hour quiet period prior to tagging SemVer (vX.Y.Z). Zero    │
│         new features. Only P0 security, crash, or data loss hotfixes. │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tier Specifications

### Tier 1: Schema & Data Contract Freeze
- **Trigger:** Transition of a Milestone Epic to `In Progress` in Jira Cloud.
- **Affected Artifacts:**
  - `@dfn/shared` exported types and interfaces.
  - API endpoint paths, request bodies, and response payloads.
  - `PrismReportManifest` and geometric feature extraction schemas.
  - Database schema definitions (Drizzle / Postgres migrations).
- **Invariant:** Once frozen, no breaking field renames, type shifts, or deleted routes. Non-breaking additive fields require approval.

### Tier 2: UI & Interaction Freeze
- **Trigger:** Exactly one 2-week sprint prior to an external pilot launch or user discovery milestone.
- **Affected Artifacts:**
  - `dfn-workspace.css` layout tokens (TopBar 48px, StatusBar 24px, RightPanel 340px).
  - Primary navigation paths and screen layouts.
  - Blueprint.js / Tailwind design system primitives.
- **Invariant:** Zero visual refactoring or token changes. Focus is restricted to layout stability (Cumulative Layout Shift = 0.000), keyboard navigation, and Playwright E2E pass rates.

### Tier 3: Release Soak Freeze
- **Trigger:** 48 hours prior to milestone release tagging (`vMAJOR.MINOR.PATCH`).
- **Affected Artifacts:** Entire multi-repository monorepo/polyrepo tree.
- **Invariant:** Strict code freeze. No feature additions or non-essential chores. Only P0 security vulnerabilities, data corruption bugs, or fatal test regressions may be merged.

---

## 4. The 5-Point Lightweight Freeze Gate Checklist

Before lifting a freeze or tagging a milestone release, the Lead PM and Tech Lead must verify the 5-point checklist in the Notion Milestone Card:

1. **[ ] Contract Parity Verified:** `@dfn/shared` exported contracts match identically across `dfn-ui`, `dfn-discovery`, and `dfn-prism`.
2. **[ ] Automated Test Gate Cleared:** `pnpm test` (or pytest/Jest) passes 100% across all repositories; zero unmonitored test debt.
3. **[ ] Shell Geometry Invariant Locked:** Rule R30 tokens (48px TopBar, 24px StatusBar, 340px RightPanel) verified via Playwright telemetry with zero layout shift (`CLS = 0.000`).
4. **[ ] Governance Compliance:** `pnpm run audit:governance` reports 100% Conventional Commits and valid `[KAN-XX]` issue keys for the release diff.
5. **[ ] Anti-AI Scrutiny Clean:** `pnpm run audit:anti-ai` passes with zero decorative AI tropes, robotic preambles, or marketing superlatives.

---

## 5. The Fast-Track RFC Escape Hatch

If an emergency architectural change or breaking fix is unavoidable during an active freeze:

1. **Submit Issue:** Open an emergency issue on GitHub / Jira titled:
   `[FREEZE-EXCEPTION]: <Subsystem> - <Concise Summary> [KAN-XX]`
2. **Three-Bullet Protocol:** The issue body must answer exactly three questions:
   - **What broke?** (Concrete technical failure or blocker).
   - **What is the blast radius?** (List of downstream repos, schemas, and tests affected).
   - **Why can't this wait until the next wave?** (Business impact or SLA risk).
3. **Approval SLA:** Requires explicit sign-off from the Lead PM or CTO. Target turnaround SLA is $\le 2\text{ hours}$.
