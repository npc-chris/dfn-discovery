# DFN High-Level Design

## Purpose

This document freezes the high-level shape of DFN Discovery for product companies.

The product answers one question: can this manufacturing job be routed to a Nigerian factory with acceptable fit, cost, lead time, and risk?

## Scope

In scope:

- job intake and normalization
- capability and fit scoring
- AI-assisted extraction and explanation
- market, logistics, and site context
- recommendation briefs and reports

Out of scope for the first freeze:

- open-ended chatbot behavior
- marketplace browsing without scoring
- workflow automation for factories
- community and social features

## Design Principles

1. Structured over conversational.
2. Deterministic over speculative.
3. Evidence-backed over opinionated.
4. Async where external data or AI is involved.
5. Thin presentation layer, no business logic in the UI.

## Architectural Overview

The system is made of a small set of services that cooperate through explicit contracts.

### Service Responsibilities

| Service | Responsibility | Interaction Style |
|---|---|---|
| Job Intake | Validate, normalize, version job submissions | Mostly synchronous |
| Core Intelligence | Compute fit, feasibility, and recommendation ranking | Mostly synchronous |
| AI Analysis Workers | Extract structure, summarize, explain, flag anomalies | Asynchronous jobs |
| Geo and Logistics | Produce distance, routing, and access context | Mixed, depends on provider |
| Market Intelligence | Produce demand, pricing, and capacity signals | Mostly asynchronous ingestion |
| Site and Real Estate Intelligence | Produce site briefs and fit context | Mixed |
| Presentation Layer | Render dashboards, exports, and reports | Synchronous read path |

## Primary Decisions

These are frozen in the HLD.

### 1. Primary Score

The primary score is the Fit Score.

Feasibility Score is a supporting dimension that can lower or raise confidence, but it does not replace Fit Score as the headline output.

### 2. Recommendation Gate

A recommendation may be shown when there is:

- one canonical job record
- at least one factory or candidate profile to compare against
- enough evidence to calculate a non-placeholder score
- confidence metadata attached to the result

If evidence is weak, the product should return a tentative recommendation with explicit caveats instead of guessing.

### 3. AI Role

AI is a worker, not a user interface.

AI may:

- extract fields from messy input
- summarize verified data
- explain ranking outcomes
- flag missing or conflicting evidence

AI may not:

- improvise facts
- replace deterministic scoring
- become the main conversation surface

### 4. Sync Versus Async

Synchronous path:

- submit job
- validate request
- fetch known profile data
- score when enough data is available
- return a draft or final recommendation

Asynchronous path:

- OCR or text extraction from files
- AI field extraction
- market feed refresh
- site brief refresh
- logistics enrichment when external providers are slow

## Data Ownership

### Job Intake Owns

- canonical job record
- attachments and source metadata
- validation status

### Core Intelligence Owns

- scoring outputs
- fit and feasibility dimensions
- ranking results
- confidence model

### AI Workers Own

- structured extraction outputs
- summaries
- explanation drafts
- anomaly flags

### Context Services Own

- logistics estimates
- market signals
- site context

### Presentation Layer Owns

- user views
- exports
- saved comparisons

## Risks

1. If the canonical schema changes too often, the scoring layer will churn.
2. If AI is allowed to invent missing data, trust collapses fast.
3. If the presentation layer accumulates business logic, the system becomes hard to freeze.
4. If market and logistics data are treated as optional, recommendation quality drops sharply.

## HLD Freeze Check

Before LLD starts, confirm:

- job schema is stable
- factory profile schema is stable
- Fit Score is the primary score
- AI only runs as a worker
- async boundaries are agreed
