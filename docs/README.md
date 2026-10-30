# DFN Discovery Technical Documentation

Welcome to the central technical repository and design specification library for **DFN Discovery** — the AI-powered manufacturing job intake, capability analysis, and multi-stage process routing platform for Nigerian industry.

---

## Architecture & System Design Index

The system's core architecture and frozen implementation plans are documented across the following specifications:

### Strategic & System Architecture
- [Service Plan](DFN_SERVICE_PLAN.md): Product wedge, market scope, and AI containment strategy.
- [Service Map](DFN_SERVICE_MAP.md): System topology, service boundaries, and external integrations.
- [High-Level Design (HLD)](DFN_HLD.md): Core architectural decisions, non-compensatory scoring principles, and data flow.
- [Low-Level Design (LLD)](DFN_LLD.md): API contracts, database schema models, and state machine specifications.
- [Main Repo Integration](DFN_MAIN_REPO_INTEGRATION.md): Standalone boundaries, shared contracts, and authentication hooks.

### Domain & Logistics Engines
- [Multi-Stage Process Routing Engine](DFN_MULTI_STAGE_PROCESS_ROUTING.md): DAG Bill of Process (BOP) decomposition, spatial impedance calculation, and Total Landed Cost (TLC) formulation.
- [Standards & SDO Architecture](DFN_STANDARDS_AND_SDO_ARCHITECTURE.md): Multi-SDO catalog (SON/NIS, ISO, ASTM, ASME, API, DIN, IEC), equivalence mapping, and IAF CertSearch accreditation.
- [Google Location Services Integration](GOOGLE_LOCATION_SERVICES.md): Migration from legacy HERE maps to Google Maps (Geocoding, Routes Matrix, Directions, and Isoline approximations).

### Security, Auth & Identity
- [Security Architecture](DFN_SECURITY.md): Multi-tenancy isolation (`orgId`), JWT verification, rate limiting, and prompt injection defense.
- [Identity Provider (IDP) Design](DFN_IDP_DESIGN.md): Auth0 / Keycloak OIDC integration patterns and token claims.

### User Interface & Frontend
- [Frontend Architecture](DFN_FRONTEND_ARCHITECTURE.md): Next.js App Router, Tailwind CSS design system, and state management.

### Checklists & Validation Logs
- [Implementation Checklist](DFN_IMPLEMENTATION_CHECKLIST.md): Complete 7-phase implementation tracker.
- [Implementation Validation](DFN_IMPLEMENTATION_VALIDATION.md): Verification report of scaffolded services and database schemas.
- [Validation Summary](DFN_VALIDATION_SUMMARY.md): Final test coverage and compliance audit.
