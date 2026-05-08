# DFN Gap Analyzer Service Plan

## Product Wedge

The product should answer one question first: can a Nigerian factory or supply chain realistically take this manufacturing job, at what cost, in what time, and with what risk?

Everything else should support that decision.

## Keep, Split, Or Drop

### Keep As Core

1. Cluster analysis for low-volume manufacturing processes.
2. Survey and research-backed insights.
3. Market metrics and demand/access signals.
4. Mapping for factory, supplier, and logistics context.
5. Structured AI analysis and recommendation layer.

These are the spine of the product. They directly help a product team, operator, or investor decide where work should go.

### Keep, But Split Into Separate Modules

1. Logistics route optimization.
2. Real estate briefs.
3. Access and network intelligence.

These are useful, but they should not sit inside the same service as the core matching engine. They are decision-support modules that consume the core data, not the core itself.

### Defer For Later Phases

1. Partner dashboards.
2. Automated outreach and CRM-like workflows.
3. Advanced scenario planning and forecasting.
4. Deep operational workflow management for factories.

These are good ideas for supporting features, but they are not the first wedge. They add surface area fast and do not prove the core value faster.

### Drop Or Avoid For Now

1. Generic chat that does not feed a decision.
2. Broad marketplace features with no scoring or verification.
3. Unrelated admin tooling.
4. Social/community features that do not improve matching, routing, or site selection.

If a feature does not help a user decide, route, source, price, or de-risk a manufacturing job, it is noise right now and should be moved to a standalone product or avoided entirely.

## Proposed Service Boundaries

### 1. Core Intelligence Service

Owns:

- manufacturing process taxonomy
- material compatibility rules
- capability scoring
- confidence scores
- recommendation generation

This is the brain of the product.

### 2. Data Ingestion Service

Owns:

- survey collection
- research imports
- partner data uploads
- normalization and deduping
- source provenance

This keeps messy input out of the core logic.

### 3. Geo And Logistics Service

Owns:

- map layers
- route optimization
- travel time and distance estimates
- facility proximity analysis

This should be separable because it will evolve on different data and different performance needs.

### 4. Market Intelligence Service

Owns:

- demand metrics
- pricing signals
- capacity signals
- access-to-market scoring

This can feed the core engine and the user-facing briefs.

### 5. Site And Real-Estate Intelligence Service

Owns:

- location briefs
- facility fit analysis
- rent/lease and access context
- zoning or power proximity notes if available

This is a distinct buyer conversation from product matching.

### 6. Presentation And Workflow Layer

Owns:

- dashboards
- reports
- exports
- saved comparisons
- alerting

This should stay thin. It should not make business decisions itself.

## What To Remove If It Exists Today

If the current product includes any of these, cut them:

- a single monolithic AI agent that tries to do everything
- duplicated scoring logic in multiple places
- one-off dashboards that reimplement the same filters
- premature multi-tenant enterprise controls
- complex workflow automation before the data is trustworthy

## Recommended Build Order

1. Core intelligence service.
2. Data ingestion and provenance.
3. One usable matching experience.
4. Market intelligence and map context.
5. Logistics and site briefs.
6. Reporting and exports.

That sequence gets to a real user outcome fastest. It also keeps the architecture honest.

## Integration Decision

DFN Gap Analyzer, though a core product in the lineup of Digital Fabrication Network, is being implemented as a standalone application, due to its open-source nature.

It should integrate with the main DFN repository only through explicit contracts:

- shared authentication identity and role claims
- versioned API clients and type definitions
- webhook or event payloads for async updates
- optional shared UI tokens or primitives if they are packaged separately

It should not depend on the main repo's live database, session store, or internal application modules.

Implementation rule:

- if code must be reused across both repos, publish it as a versioned shared package
- if data must cross the boundary, use an authenticated API or event contract
- if a feature requires direct imports from the main repo, it belongs in the shared package or should be refactored into a contract first

## Decision Rule

Keep a service only if it improves one of these outcomes:

- find the right factory
- score whether the job fits
- reduce time or cost to route the job
- explain why the recommendation is trustworthy

If it does not move one of those, it is probably scope creep.

## AI Strategy

AI should not be the product surface. It should be the engine that turns messy inputs into structured decisions.

That means:

- minimal sanitized prompts from the user
- structured inputs, not open-ended chat
- isolated jobs that return schemas, scores, and briefs
- evidence links and confidence levels with every output
- human review where the risk is real

### Best Uses For AI

1. Classify manufacturing requests into process, material, complexity, and feasibility buckets.
2. Extract signals from surveys, research notes, and partner submissions.
3. Summarize a factory, route, or site into a decision brief.
4. Compare options and explain tradeoffs in plain language.
5. Generate a recommendation only after the scoring layer has done the hard work.

### Good AI Patterns

1. Structured extraction, where AI turns raw text into fields.
2. Evidence-backed summarization, where AI writes a brief from known data.
3. Ranking and explanation, where AI explains why one option beats another.
4. Exception handling, where AI flags gaps, conflicts, or missing data.

### Bad AI Patterns

1. Freeform chatbot Q&A as the main UI.
2. Letting the model invent facts or fill missing data without provenance.
3. Using AI for every step when deterministic logic is enough.
4. Prompting the user for long explanations just to get started.
