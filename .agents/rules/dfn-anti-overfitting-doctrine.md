# DFN Anti-Overfitting & Anti-Reward-Hacking Engineering Doctrine

**Initiative:** Digital Fabrication Network (DFN) & DFN Discovery  
**Governing Standard:** Ian Sommerville, *Engineering Software Products* (Verification, Testing & Quality Management)  
**Enforcement Gate:** Point 6/6 (`python scripts/audit_anti_overfitting.py --repo <name> --strict`)  
**Applies To:** All DFN Engineering Repositories (`dfn-discovery`, `dfn-prism`, `dfn-parametrics`, `dfn-ui`, `digital-fabrication-network`, `dfn-scrutiny`)

---

## Core Prohibition

AI coding agents and engineers must never implement production software by reverse-engineering acceptance test examples, hardcoding literal scenario outputs, injecting fake test fixtures into production directories, or ignoring declared physical and economic inputs. Passing a narrow set of Gherkin examples by reward-hacking invalidates manufacturing quotes, DFM triage, and structural safety checks on unseen customer parts.

---

## The 5 Anti-Overfitting Mandates

### Mandate 1: Gherkin Acceptance Criteria Are Test Cases, Never Constant Specifications
- Gherkin `Given / When / Then` scenarios illustrate one boundary point of a general rule; they do not define magic constants or single-case branches.
- Never hardcode single-alloy bans (for example, `normFamily === '6063'` or `prohibitedAlloyFamilies: ['6063']`), single-vendor exceptions, or literal scenario totals (for example, exact quote literals such as `98000` or `78000`) inside production `src/` logic.
- Derive pass/fail decisions from physical properties (yield strength, elongation, machinability index, tolerance capability, heat-lot verification status) and explicit domain policies.
- **Static Check:** `AO-01` fails builds when Gherkin example literals or single-example branches leak into production `src/`.

### Mandate 2: First-Principles Engineering Models Only
- Every geometric, material, process, and economic input declared in a calculator, estimator, router, or DFM function signature must participate in the mathematical model.
- Flat reverse-engineered offsets, lookup hacks tuned to one fixture, and ignored parameters (`lengthMm`, `thicknessMm`, `massKg`, `density`, `materialGrade`, `quantity`, etc.) are prohibited.
- Cost, lead-time, mass, machinability, and routing models must express explicit physical relationships (volume, density, stock removal rate, setup time, tooling wear, logistics distance, batch amortization) with documented units.
- **Static Check:** `AO-03` flags declared physics and domain parameters that are never referenced in the function body.

### Mandate 3: Strict Separation of Reference Libraries, Live Ledgers, and Test Fixtures
- Maintain three non-overlapping data boundaries:
  1. **Canonical Reference Libraries (`data/`):** Verifiable physical, metallurgical, tooling, and standards reference tables (for example, ISO/ASTM alloy properties, machine envelope specs).
  2. **Live Operational Ledgers (Database / Runtime State):** Stockists, heat lots, workshop KYC records, RFQs, and quotes ingested via validated operational APIs.
  3. **Test Fixtures (`tests/fixtures/`):** Negative-path, quarantined, mock, or synthetic test inputs isolated strictly inside test directories.
- Never ship fabricated stockists, unaccredited mock lots, or negative-path placeholders (`unaccredited`, `alaba`, `mushin`, `mock_`, `fake_`, `dummy_`, `test-org`, `sample_scrap`, `quarantined negative-path`) inside production `data/` or `src/`.
- **Static Check:** `AO-02` rejects fabricated or negative-path test fixtures found in production `data/` or `src/`.

### Mandate 4: Mandatory Metamorphic Relations & Seeded Property-Based Fuzz Sweeps
- Every algorithmic module (cost estimation, DFM triage, alloy/lot allocation, cluster routing, parametric geometry, scheduling) must ship with unit tests that verify general mathematical invariants beyond single-example assertions:
  - **Monotonicity:** Increasing mass, volume, tight tolerance penalty, or batch quantity moves cost and lead-time in the physically required direction.
  - **Scaling & Dimensional Consistency:** Proportional changes in dimensions or batch size produce bounded, physically coherent outputs without NaN, Infinity, or negative totals.
  - **Permutation Invariance:** Reordering candidate stockists, workshops, or BOM line items yields deterministic, identical optimal selections.
  - **Negative-Control & Positive-Path Symmetry:** When a negative-path test rejects an invalid input (for example, insufficient yield strength or unverified heat lot), a paired positive-path test with valid properties must pass through the same general rule.
- **Seeded Property-Based Fuzz Sweeps:** Run at least 100 deterministic seeded randomized test cases (using `fast-check`, `hypothesis`, or a fixed-seed PRNG loop) per algorithmic engine to expose edge-case discontinuities and hardcoded thresholds.
- **Static Check:** `AO-04` audits algorithmic test suites for metamorphic and property-based coverage (`--require-pbt` enforces hard failure).

### Mandate 5: Authentic Domain Fixtures & Adversarial Red-Team Review
- Use authentic external or industry CAD, STEP, STL, and manufacturing data fixtures (such as real assemblies, open mechanical benchmarks, and verified material datasheets) instead of programmatic toy geometry builders.
- Programmatic fake-CAD mesh helpers (such as `_build_l_bracket_mesh`, `_build_pocket_block_mesh`, or `create_synthetic_mesh`) are prohibited in `dfn-prism/tests/`.
- Before Definition of Done (DoD) sign-off, run an adversarial red-team check on unseen inputs: perturb dimensions, swap alloy grades, invert candidate order, and test boundary tolerances not listed in the Jira ticket or Gherkin story.
- **Static Check:** `AO-05` flags synthetic CAD geometry helper definitions in `dfn-prism/tests/`.

---

## Automated Enforcement & Gate Commands

| Rule ID | Check Scope | Failure Condition | Default Severity |
| :--- | :--- | :--- | :--- |
| `AO-01` | Production `src/` | Hardcoded Gherkin literals, magic quote offsets, or single-alloy special-case bans | Error |
| `AO-02` | Production `data/` & `src/` | Fabricated or negative-path test fixture tokens outside test directories | Error |
| `AO-03` | Production `src/` (TS/Py) | Declared engineering/physics parameters unused in function body | Error |
| `AO-04` | Algorithmic test suites | Single-example tests lacking metamorphic or property-based checks | Warning (`Error` with `--require-pbt`) |
| `AO-05` | `dfn-prism/tests/` | Synthetic CAD mesh builder helpers replacing authentic CAD fixtures | Error |

Run locally from `dfn-scrutiny`:

```bash
python scripts/audit_anti_overfitting.py --repo <repo_name> --strict
```
