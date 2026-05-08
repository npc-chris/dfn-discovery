# DFN Sequence Diagrams

## Job Submission To Recommendation

```mermaid
sequenceDiagram
    actor Company as Product Company
    participant UI as Presentation Layer
    participant Intake as Job Intake
    participant AIW as AI Analysis Workers
    participant Core as Core Intelligence
    participant Geo as Geo and Logistics
    participant Market as Market Intelligence
    participant Site as Site and Real Estate Intelligence
    participant DB as Data Store

    Company->>UI: Submit manufacturing job
    UI->>Intake: Send job payload
    Intake->>DB: Save canonical job record
    Intake->>AIW: Queue extraction work
    Intake->>Core: Request initial scoring
    Core->>DB: Load factory profiles and evidence
    Core->>Geo: Request route context
    Core->>Market: Request market context
    Core->>Site: Request site context
    AIW-->>Core: Structured fields and evidence flags
    Geo-->>Core: Route and access context
    Market-->>Core: Demand and pricing signals
    Site-->>Core: Site brief and suitability notes
    Core->>DB: Save recommendation bundle
    Core-->>UI: Return recommendation payload
    UI-->>Company: Show recommendation brief
```

## AI Extraction Worker

```mermaid
sequenceDiagram
    actor Ops as Internal System
    participant Queue as Job Queue
    participant Worker as AI Analysis Worker
    participant Model as AI Model
    participant DB as Data Store
    participant Core as Core Intelligence

    Ops->>Queue: Enqueue extract-evidence job
    Queue->>Worker: Deliver sanitized payload
    Worker->>DB: Load source artifacts
    Worker->>Model: Extract structured fields
    Model-->>Worker: Fields, summaries, confidence
    Worker->>DB: Persist extraction result
    Worker-->>Core: Notify extraction complete
    Core->>DB: Recompute scoring if needed
```

## Notes

- These diagrams assume the AI worker is isolated from the user interface.
- The presentation layer only orchestrates and renders, it does not decide the result.
- If a context service fails, the core score can still return with caveats, but it must label the gap.
