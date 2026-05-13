export declare enum JobStatus {
    Draft = "draft",
    Submitted = "submitted",
    Normalized = "normalized",
    Analyzing = "analyzing",
    Scored = "scored",
    Recommended = "recommended",
    Published = "published",
    Archived = "archived",
    ValidationFailed = "validation_failed",
    AnalysisFailed = "analysis_failed",
    ScoringFailed = "scoring_failed",
    StaleData = "stale_data"
}
export interface Location {
    latitude?: number;
    longitude?: number;
    address?: string;
    country: string;
    region?: string;
}
export interface Attachment {
    id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    uploaded_at: Date;
    source_type: 'form' | 'file' | 'survey';
}
export interface Job {
    id: string;
    company_name: string;
    product_name: string;
    process_type: string;
    material_type: string;
    volume_band: string;
    location: Location;
    attachments: Attachment[];
    status: JobStatus;
    version: number;
    created_at: Date;
    updated_at: Date;
    metadata?: Record<string, unknown>;
}
export interface JobInput {
    company_name: string;
    product_name: string;
    process_type?: string;
    material_type?: string;
    volume_band?: string;
    location: Location;
    attachments?: File[];
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=job.d.ts.map