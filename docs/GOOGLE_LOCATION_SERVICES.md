# Google Location Services Usage Contract

## Purpose

This document defines how DFN Discovery uses Google Maps Platform (Google Location Services) for geospatial, routing, geocoding, matrix routing, and reachability operations across Nigeria.

The goal is to define the DFN contract: which Google services we call, why we call them, what inputs they require, what outputs we consume, and how DFN maintains its logistics and scoring policies around those outputs.

## Operating Rules

1. The backend calls Google Maps Platform APIs directly through provider adapters (`backend/src/services/integrations/google/*`).
2. The frontend never calls Google Maps APIs directly for core scoring or routing decisions.
3. The shared workspace package (`@dfn/shared`) only carries types, constants, and response shapes.
4. DFN owns logistics policy, scoring, caching, and normalization.
5. Google Maps Platform owns the ground-truth map, routes, geocoding, matrix, and traffic calculations across Nigeria.

## Service Boundary

### Backend

Backend services call Google through the provider adapter layer:

- `google-routing.adapter`: Route distance, traffic duration (ETA), and route polyline lookups via Google Routes API v2.
- `google-matrix.adapter`: Multi-origin and multi-destination comparisons via Google Routes Matrix API.
- `google-geocode.adapter`: Forward address search with Nigeria country biasing (`country:NG`) and reverse geocoding.
- `google-isoline.adapter`: Service-area and reachability polygon generation calibrated to Nigerian freight transit speeds.
- `google-retry`: Exponential backoff resilience wrapper classifying retryable vs. non-retryable errors.

### Frontend

Frontend components consume DFN-derived outputs:

- Route summaries and polylines
- Delivery lead time and travel duration estimates
- Reachability polygons
- Factory cluster and job markers

The frontend map (using Google Maps JavaScript API / `@vis.gl/react-google-maps`) serves as a rendering layer, not a decision engine.

### Shared Workspace

`@dfn/shared` defines:

- `Location` and `FactoryLocation` schemas
- Logistics assessment types (`LogisticsAssessment`)
- Manufacturing DAG and WIP transition edge types

---

## Google Services And DFN Usage

### 1. Routes API v2 (`POST https://routes.googleapis.com/directions/v2:computeRoutes`)

Use it when DFN needs a concrete route between an origin and a destination (e.g. Job delivery location to Factory, or inter-fab WIP transit).

- **Headers**:
  - `X-Goog-Api-Key: GOOGLE_MAPS_API_KEY` (or `GOOGLE_API_KEY`)
  - `X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description`
- **Body**:
  ```json
  {
    "origin": { "location": { "latLng": { "latitude": 6.52, "longitude": 3.38 } } },
    "destination": { "location": { "latLng": { "latitude": 7.12, "longitude": 3.42 } } },
    "travelMode": "DRIVE",
    "routingPreference": "TRAFFIC_AWARE",
    "computeAlternativeRoutes": false
  }
  ```
- **Outputs Consumed**:
  - `distanceMeters`: Used to calculate freight costs and corridor distance.
  - `duration`: Protobuf duration string (e.g. `"1450s"`) converted to integer seconds.
  - `polyline.encodedPolyline`: Vector line string for frontend route visualization.

### 2. Routes Matrix API v2 (`POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`)

Use it when DFN needs to compare many origins and destinations simultaneously (e.g., matching a job against 20 candidate factories across Nigeria).

- **Headers**:
  - `X-Goog-Api-Key: GOOGLE_MAPS_API_KEY`
  - `X-Goog-FieldMask: originIndex,destinationIndex,duration,distanceMeters,status`
- **Body**:
  - Array of origin waypoints and destination waypoints.
- **Outputs Consumed**:
  - Normalized array of `MatrixResultEntry` objects `{ originIndex, destinationIndex, travelTimeSeconds, distanceMeters, status }`.

### 3. Geocoding API (`GET https://maps.googleapis.com/maps/api/geocode/json`)

Use it when resolving human-entered addresses, Nigerian industrial zones, or coordinates.

- **Forward Geocoding**:
  - Parameters: `address=<query>&components=country:NG&key=<key>`
  - Country restriction: `country:NG` ensures ambiguous place names default to Nigerian locations.
- **Reverse Geocoding**:
  - Parameters: `latlng=<lat>,<lng>&key=<key>`
  - Converts coordinates into formatted Nigerian addresses with LGA and state components.

### 4. Reachability & Service Areas (`google-isoline.adapter`)

Because Google Maps does not provide an isolated isochrone REST endpoint, DFN computes reachability polygons using a hybrid model:

- **Distance Range**: Generates an exact 32-point geodesic circular boundary polygon (GeoJSON `linestring: [[lng, lat], ...]`).
- **Time Range**: Derives the effective transit radius based on Nigerian freight corridor speed baselines (35 km/h urban/industrial, 60 km/h highway).

---

## Nigerian Logistics Policy & Calibrations

The DFN logistics policy translates Google geospatial evidence into manufacturing and supply chain feasibility:

- **Freight Transit Speeds**:
  - Road Long-Haul: ~300 km/day
  - Urban/Industrial Corridor: ~35 km/h
  - Rail Freight: ~100 km/day
  - Air Cargo: 1 day
- **Border / Interstate Checkpoints**:
  - Routes traversing inter-state borders or exceeding 600 km incur clearance/transit allowances.
- **Landed Cost Estimation**:
  - Baseline road freight estimate: `distance_km * 1,500 NGN`.
  - Inter-fab WIP edge freight: `15,000 NGN + distance_km * 400 NGN`.
- **Fail-Safe Fallback**:
  - When API keys are unconfigured or external connectivity fails, DFN defaults to strict Nigerian LGA coordinate lookup table (Lagos, Kano, FCT/Abuja, Ibadan, Port Harcourt, Enugu, Kaduna, Onitsha, Nnewi, Aba, Benin, Jos, Ogun) with Haversine distance calculations.

---

## Caching Policy

All Google Maps Platform API calls are cached in Redis to control costs and minimize latency:

- **Geocoding Results**: TTL 24 hours (`logistics:geocode:<hash>`)
- **Matrix Routing**: TTL 1 hour (`logistics:matrix:<hash>`)
- **Point-to-Point Routes**: TTL 1 hour (`logistics:route:<jobId>:<factoryId>`)
