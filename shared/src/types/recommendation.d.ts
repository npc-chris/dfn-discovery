export interface EvidenceItem {
    id: string;
    source_type: 'survey' | 'file' | 'database' | 'external_feed';
    source_ref: string;
    claim: string;
    confidence: number;
    created_at: Date;
}
export interface Recommendation {
    id: string;
    job_id: string;
    factory_id: string;
    fit_score: number;
    feasibility_score: number;
    confidence_score: number;
    rank: number;
    evidence: EvidenceItem[];
    caveats: string[];
    generated_at: Date;
    version: number;
}
export interface ScoringInput {
    job_id: string;
    factory_id: string;
    evidence: EvidenceItem[];
    market_context?: Record<string, unknown>;
    logistics_context?: Record<string, unknown>;
    site_context?: Record<string, unknown>;
}
export interface RecommendationBrief {
    recommendation: Recommendation;
    summary: string;
    next_steps: string[];
    explainer?: string;
}
//# sourceMappingURL=recommendation.d.ts.map