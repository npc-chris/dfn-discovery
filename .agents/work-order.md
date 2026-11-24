# DFN Nightly Work Order: Discovery Feasibility & Intake Specialist

> **Recipient Agent:** Discovery Specialist (`dfn-discovery-engineer`)  
> **Repository:** `dfn-discovery`  
> **Lead PM:** Antigravity (Lead Product Manager & Technical Scrum PO)  
> **Sprint Window:** Nightly 20:05 – 22:30 WAT | **Sprint Countdown:** Day 6 of 20 (15 Days Remaining to Dec 6, 2026)  
> **Standard:** Ian Sommerville Software Product Engineering Standard  

---

## Assigned PBIs
1. **`KAN-78`** (`[DISC-002]`): Multi-Process Feasibility Engine & Pluggable Manufacturing Strategy Architecture
2. **`KAN-4`** (`[CLUS-002]`): SME Fabrication Cluster Registry & Capability Vetting
3. **`KAN-38`** (`[US-C-01]`): First-Article Tolerance Verification Gate
4. **`KAN-41`** (`[US-C-04]`): Mandatory Heat-Treatment Pyrometer Log Enforcement

---

## Approved Branch
`feat/KAN-78-multi-process-feasibility-strategy`

---

## Technical Sub-Tasks Breakdown (20–45 min Timeboxes)

- [ ] **ST-DISC-01 (Pluggable Strategies - KAN-78)**: Create modular strategy heuristic providers under `src/dfn_discovery/strategies/` covering CNC 3-axis milling, CNC 5-axis, sheet metal forming, and wire EDM.
- [ ] **ST-DISC-02 (DAG Routing Sequencer)**: Implement DAG process routing engine accepting `PrismReportManifest` v1.1 BRep geometry and assigning operation sequences, setup allowances, and machine envelope fits.
- [ ] **ST-DISC-03 (Cluster Capacity Matcher - KAN-4)**: Connect routing engine with cluster workshop database, evaluating machine bed limits, spindle power, and generator power resilience ratings across Lagos, Aba, and Nnewi clusters.
- [ ] **ST-DISC-04 (First-Article Gate - KAN-38)**: Implement first-article tolerance verification state machine (`src/dfn_discovery/inspection/first_article.py`) calculating circular taper ($|max - min| \le 0.003\text{ mm}$) and deviation containment.
- [ ] **ST-DISC-05 (Pyrometer Telemetry Audit - KAN-41)**: Build pyrometer thermal soak telemetry analyzer (`src/dfn_discovery/inspection/pyrometer_audit.py`) validating temperature soak tolerance ($\pm 10^\circ\text{C}$) and minimum soak duration, with automatic lockout on under-soak excursions.
- [ ] **ST-DISC-06 (6-Point Gate & PR Packaging)**: Execute `python scripts/nightly_harness.py gate --repo dfn-discovery` (Node test runner + Pytest runner + anti-overfitting). Upon 100% pass, submit DoD PR via `python scripts/nightly_harness.py pr --repo dfn-discovery --ticket KAN-78 --title "feat(discovery): multi-process feasibility strategies and nationwide cluster routing" --subsystem SUB-01`.

---

## Subsystem Invariants & DoD Requirements
1. Deterministic feasibility scoring (0–100) and cost bracket estimation within 48-hour SLA.
2. Zero mock constants in cluster matching logic; verified against authentic workshop capability schemas.
3. 100% test pass rate across Node and Pytest test runners.
