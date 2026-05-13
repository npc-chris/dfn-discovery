export declare const SCORE_MIN = 0;
export declare const SCORE_MAX = 100;
export declare enum ScoringComponent {
    ProcessMatch = "process_match",
    MaterialMatch = "material_match",
    CapacityMatch = "capacity_match",
    GeographyAndLogistics = "geography_and_logistics",
    MarketAccess = "market_access",
    EvidenceConfidence = "evidence_confidence"
}
export declare const SCORING_WEIGHTS: Record<ScoringComponent, number>;
export declare const CONFIDENCE_PENALTY_FACTOR = 0.15;
export declare const RECOMMENDATION_GATE_RULES: {
    minFactoriesRequired: number;
    minEvidenceItemsRequired: number;
    minConfidenceToShow: number;
    minConfidenceForFinal: number;
};
export declare const QUEUE_JOB_TYPES: readonly ["classify-job", "extract-evidence", "score-fit", "enrich-logistics", "refresh-market-signals", "refresh-site-brief", "generate-recommendation-brief"];
//# sourceMappingURL=scoring.d.ts.map