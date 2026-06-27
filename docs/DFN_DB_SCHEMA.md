# DFN Database Schema (Comprehensive)

## Entity Relationship Overview

This schema represents the entire DFN Discovery product, including the core matching engine components (Jobs, Recommendations, Attachments) alongside the Phase 4 proxy architecture for external SaaS mapped auditing (UpKeep/SafetyCulture) via isolated backend representations.

```mermaid
erDiagram
    jobs ||--o{ recommendations : "generates"
    jobs ||--o{ attachments : "includes"
    jobs ||--o{ job_queue : "enqueues"
    factories ||--o{ recommendations : "matches with"
    factories ||--o{ site_assessments : "audited via"
    job_queue ||--o{ site_assessments : "updates via async webhook"

    jobs {
        uuid id PK
        string org_id "NOT NULL, indexed — owning organisation"
        string created_by "NOT NULL — userId from JWT"
        string company_name
        string product_name
        string process_type
        string material_type
        string volume_band
        jsonb location
        string status "draft, analyzing, matched, etc."
        int version
        jsonb metadata
        timestamp created_at
        timestamp updated_at
    }

    factories {
        uuid id PK
        string org_id "NULL = platform-managed; set = org-private"
        string factory_name
        jsonb capabilities
        jsonb materials
        string capacity_band
        jsonb locations
        jsonb certifications
        jsonb verified_sources
        boolean active
        string external_factory_id "Used as tag in SafetyCulture/UpKeep"
        timestamp created_at
        timestamp updated_at
    }

    recommendations {
        uuid id PK
        uuid job_id FK
        uuid factory_id FK
        string org_id "NOT NULL, indexed — denormalised for fast org-scoped queries"
        int fit_score
        int feasibility_score
        int confidence_score
        int rank
        jsonb evidence
        jsonb caveats
        timestamp generated_at
        int version
    }

    attachments {
        uuid id PK
        uuid job_id FK
        string org_id "NOT NULL, indexed — must match job.org_id"
        string storage_key "Opaque UUID — never the original filename"
        string mime_type
        int size_bytes
        string source_type
        timestamp uploaded_at
    }

    site_assessments {
        uuid id PK
        uuid factory_id FK
        string safetyCulture_audit_id "Tagged on master vendor account"
        string upkeep_work_order_id "Tagged on master vendor account"
        int max_capacity_units "Strict metrics (dropdowns only)"
        int equipment_age_score "0-100 heuristic"
        boolean passed_inspection "Directly drives UpKeep WO triggers"
        jsonb raw_webhook_payload "Audit trail and AI extraction source"
        timestamp assessed_at
    }

    job_queue {
        uuid id PK
        uuid job_id FK "nullable"
        string queue_type "classify-job, sync-audit-webhook, etc."
        jsonb payload "Raw webhook or analysis data"
        string status "pending, completed, failed"
        jsonb result
        int attempts
        string error
        timestamp created_at
        timestamp updated_at
        timestamp completed_at
    }
```

### Constraints and Conventions

1. **Geo/Market Intelligence Isolation**: Third-party SaaS tools map against the `factories` table via `external_factory_id`. Auditors do not access internal UUIDs.
2. **`passed_inspection`**: In `site_assessments`, this boolean determines the branching outcome for triggering UpKeep Work Orders automatically via the async queue.
3. **`raw_webhook_payload`**: Essential to preserve full safety audit streams as JSONB so AI extraction workers can re-process historical qualitative fields at a later date.
4. **Queue Resilience**: The `job_queue` acts as a shock absorber. External inbound webhooks map to `job_queue` records immediately before complex processing to prevent timeouts. Internal async paths (like AI scoring in `recommendations`) also rely on this queue.
5. **Multi-Tenancy (`org_id`)**: Every table except `site_assessments` (which is factory-scoped, not org-scoped) carries an `org_id NOT NULL` column. This column is derived from the authenticated JWT on every write and applied as a mandatory filter on every read, update, and delete. The application never performs cross-org joins. Queries that return no row because of an `org_id` mismatch must surface as `404 Not Found` — never `403 Forbidden`. See [DFN_SECURITY.md](DFN_SECURITY.md) for the full multi-tenancy specification.
6. **Attachment Storage Keys**: The `attachments.storage_key` field is an opaque UUID used as the object storage key. The original filename is never used as a storage key to prevent path traversal and enumeration attacks. Signed URLs for attachment access carry a maximum 15-minute TTL.