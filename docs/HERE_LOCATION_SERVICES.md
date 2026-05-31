# HERE Location Services Usage Contract

## Purpose

This document defines how DFN Discovery should use HERE location services.

The goal is not to mirror HERE documentation line by line. The goal is to define the DFN contract: which HERE services we call, why we call them, what inputs they need, what outputs we consume, and which parts of the system own the decision logic around those outputs.

## Operating Rules

1. The backend calls HERE directly through provider adapters.
2. The frontend never calls HERE APIs directly for core decision logic.
3. The shared package only carries types, constants, and response shapes.
4. DFN owns logistics policy, scoring, caching, and normalization.
5. HERE owns the map, routing, geocoding, isoline, and matrix calculations.

## Service Boundary

### Backend

Backend services should call HERE through a Geo provider adapter layer.

Recommended internal split:

- `here-routing.adapter` for route, ETA, and route-shape lookups
- `here-matrix.adapter` for multi-origin and multi-destination comparisons
- `here-geocoding.adapter` for address search, geocoding, reverse geocoding, and place lookup
- `here-isoline.adapter` for reachability and service-area analysis

### Frontend

Frontend code should only consume DFN outputs such as:

- map overlays
- route summaries
- travel time estimates
- reachability polygons
- recommendation context

If the UI needs a map, it should render provider-derived data, not recompute logistics decisions.

### Shared Workspace

Shared code should define:

- location and route result types
- logistics assessment types
- map overlay shapes
- confidence and caveat metadata

Shared code should not contain HERE fetch logic.

## HERE Services And DFN Usage

### 1. Routing API v8

Use it when DFN needs a concrete route between one origin and one destination.

Typical DFN uses:

- compute factory-to-job travel distance
- estimate travel time
- capture route shape for overlays
- derive base routing cost inputs

Inputs DFN should supply:

- origin coordinate
- destination coordinate
- transport mode
- route constraints such as avoid options or vehicle profile when relevant
- optional departure or arrival time when traffic-aware ETA matters

Outputs DFN should consume:

- route distance
- duration or travel time
- section summaries
- route shape or polyline when the UI needs to draw it
- notices or restrictions when the route is constrained

DFN rule:

- routing results are evidence for logistics policy, not a final recommendation by themselves.

### 2. Matrix Routing API v8

Use it when DFN needs to compare many origins and destinations efficiently.

Typical DFN uses:

- compare one job against multiple factories
- precompute travel-time or distance matrices
- support ranking and batching

Inputs DFN should supply:

- a set of origins and destinations
- a routing profile or transport mode
- any matrix-level constraints needed for the comparison

Outputs DFN should consume:

- travel times
- distances
- matrix-level errors or per-entry errors

DFN rule:

- matrix routing is the preferred way to compare many candidate factories at once.

### 3. Geocoding & Search API v7

Use it when DFN needs to turn text or place names into coordinates, or coordinates back into usable place context.

Typical DFN uses:

- normalize job addresses
- normalize factory addresses
- resolve ambiguous place names
- look up nearby places or access context
- reverse geocode coordinates for display labels

Inputs DFN should supply:

- free-form address text or place text
- a search center or location context when relevant
- country or region filters when appropriate
- language preference for user-facing labels

Outputs DFN should consume:

- candidate matches
- normalized address fields
- coordinates
- confidence or relevance scores from the search response

DFN rule:

- geocoding should happen before routing whenever source data is messy or human-entered.

### 4. Isoline Routing API v8

Use it when DFN needs reachability or service-area analysis instead of a single route.

Typical DFN uses:

- service-area analysis around a factory
- reachable area by time or distance
- coverage for delivery or access zones
- location suitability and access context

Inputs DFN should supply:

- origin coordinate
- mode of travel
- time, distance, or energy range target
- optional departure time when a planning mode is needed

Outputs DFN should consume:

- polygon or polyline data for the reachable area
- range metadata
- any response notices relevant to the selected mode

DFN rule:

- isolines are a decision-support input for reachability, not a substitute for route calculations.

### 5. Maps API for JavaScript

Use it when DFN needs interactive maps in the frontend.

Typical DFN uses:

- draw route lines
- draw isoline polygons
- show factory and job markers
- layer score context on top of map visuals

What the frontend should not do:

- call routing or scoring logic directly in the browser
- invent logistics policy based on the map UI

DFN rule:

- the map is a rendering layer, not a decision engine.

## Recommended DFN Call Sequence

### Single job to single factory

1. Geocode job and factory locations if coordinates are missing.
2. Call Routing API v8 for the direct route.
3. Apply DFN logistics policy to the route result.
4. Store the assessment in cache and attach it to scoring context.

### Single job to many factories

1. Geocode any missing locations.
2. Call Matrix Routing API v8 for candidate comparison.
3. Use the matrix output to rank route cost and travel time.
4. Optionally call Routing API v8 for the top candidates if the UI needs route shapes.
5. Apply DFN logistics policy and persist the normalized results.

### Service-area or access analysis

1. Geocode the factory or access point.
2. Call Isoline Routing API v8 for time or distance coverage.
3. Convert the polygon response into a reachability context object.
4. Render the shape in the UI if needed.
5. Feed the result into site or logistics scoring.

## DFN Logistics Policy

The logistics policy layer is where HERE outputs become DFN decision inputs.

The policy layer should decide:

- primary transport mode
- whether the route is feasible for the current job
- whether border or access constraints should be flagged
- whether the route should be treated as tentative or final
- how to translate travel data into lead time and cost estimates

The policy layer should not:

- guess missing coordinates
- invent border rules without explicit logic
- replace route data with hand-tuned assumptions when HERE has already returned usable evidence

## Caching Guidance

Suggested cache domains:

- geocoding results: longer TTL, because addresses change slowly
- matrix results: medium TTL, because candidate comparisons are reused often
- route results: shorter TTL, because traffic and route constraints can change
- isoline results: medium TTL, depending on how often access context changes

Cache keys should include:

- provider name
- API type
- origin and destination coordinates or search input
- transport mode or routing profile
- route constraint signature

## Error Handling

DFN should treat HERE failures as provider failures, not application failures, unless the user request cannot be satisfied without that data.

Recommended behavior:

- retry transient errors with backoff
- surface cached stale data when it is clearly labeled
- downgrade confidence when provider data is partial
- fail closed when a route or geocode result is required for a safe recommendation

## Minimal Phase 1 Scope

If DFN wants the smallest useful HERE integration first, implement:

1. Geocoding & Search API v7
2. Routing API v8
3. Matrix Routing API v8
4. Isoline Routing API v8

That set covers normalization, route comparison, and reachability analysis, which are the core needs for Discovery.

## Later Additions

Potential later additions, only if the product needs them:

- Route Matching API v8 for GPS trace matching
- Tour Planning API for fleet optimization
- Intermodal Routing API v8 for multi-mode city routing
- Public Transit API v8 for transit-specific access analysis

## References In The Repo

- [DFN HLD](DFN_HLD.md)
- [DFN LLD](DFN_LLD.md)
- [DFN Service Map](DFN_SERVICE_MAP.md)
- [DFN Service Plan](DFN_SERVICE_PLAN.md)
- [Implementation Checklist](DFN_IMPLEMENTATION_CHECKLIST.md)