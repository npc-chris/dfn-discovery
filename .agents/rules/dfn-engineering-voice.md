# DFN Engineering Voice & Code Documentation Standard

All code, comments, JSDoc/TSDoc, docstrings, and documentation across the Digital Fabrication Network (DFN) ecosystem must strictly comply with this standard.

---

## 1. Comment Scope & Context Granularity

- **State General Invariants First:** Comments must explain the primary purpose, boundary condition, or invariant of the code block.
- **Label Real-World Justifications as Examples:** Never write comments that sound like hyper-specific lore or single-case trivia masquerading as the code's only purpose. If citing a real-world scenario among multiple possibilities, explicitly qualify it as an instance, application, or example:
  - ❌ *Bad (Hyper-Specific Lore):*
    ```typescript
    // Ikeja and Nnewi machine shops observe Friday shutdowns; clamp to 2 days.
    return Math.max(job.leadTimeDays, 2);
    ```
  - ✅ *Good (General Intent with Illustrative Instance):*
    ```typescript
    // Enforce minimum lead-time buffer to prevent SLA breaches against cluster variances
    // (e.g., scheduled maintenance cycles or supplier batching delays).
    return Math.max(job.leadTimeDays, 2);
    ```
- **Clean JSDoc/TSDoc is Welcomed:** Standard, concise documentation blocks defining purpose, non-obvious parameters, and return contracts are preferred over empty syntax or anecdotal trivia:
  ```typescript
  /**
   * Calculates minimum turnaround time for job dispatch.
   * Enforces a non-zero floor to absorb baseline supplier intake and setup overhead.
   */
  export function calculateTurnaround(job: ManufacturingJob): number { ... }
  ```

---

## 2. Ban on Robotic Throat-Clearing & Preambles

Never begin documentation, pull requests, or file headers with conversational fluff or formulaic throat-clearing:
- ❌ Do NOT use:
  - *"In this file / module / section / document, we..."*
  - *"It is important / crucial / imperative / essential to note that..."*
  - *"Let's dive into / explore..."*
  - *"In today's fast-paced manufacturing landscape..."*
  - *"At its core, ... / Fundamentally speaking, ..."*
  - *"Without further ado..."*
  - *"Stands as a testament to / serves as a testament to..."*
  - *"Plays a pivotal / crucial / vital role in..."*
  - *"Is designed to facilitate..."* (replace with direct verb: *"allows"* or *"enables"*)
  - *"In order to be able to..."* (replace with *"to"*)
- ✅ State technical facts directly and imperatively.

---

## 3. Strict AI Buzzword & Trope Vocabulary Ban

Reject empty, hyperbolic adjectives and overused AI transition verbs:
- **Banned Verbs:** `delve`, `leverage`, `elevate`, `foster`, `cultivate`, `harness`, `unravel`, `unleash`, `streamline`, `orchestrate`, `bolster`, `underscore`, `encapsulate`, `demystify`, `spearhead`, `embark`, `navigate`, `empower`, `revolutionize`, `transform`, `illuminate`.
- **Banned Adjectives/Adverbs:** `paramount`, `pivotal`, `crucial`, `robust`, `seamless` *(except literal material specs, e.g. seamless tubing)*, `comprehensive`, `holistic`, `nuanced`, `multifaceted`, `cutting-edge`, `state-of-the-art`, `game-changing`, `groundbreaking`, `quintessential`, `vibrant`, `bustling`, `bespoke`, `meticulous`, `profound`, `invaluable`.
- **Banned Metaphorical Nouns:** `testament`, `tapestry`, `beacon`, `powerhouse`, `cornerstone`, `linchpin`, `realm`, `landscape`, `journey`, `paradigm`, `synergy`, `panacea`, `catalyst`, `symphony`.

---

## 4. No Tautological Comments

Code syntax already states *what* the language parser does. Never write comments that merely repeat symbol names:
- ❌ `// Constructor for FactoryService`
- ❌ `// Gets the job id`
- ❌ `@param id The id`
- ❌ `@returns The returned result`
- ✅ Only comment when explaining architectural rationale, algorithmic complexity, physical manufacturing limits (tolerances, materials), or non-obvious workarounds.
