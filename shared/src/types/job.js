// Job domain types matching DFN_LLD.md canonical schema
export var JobStatus;
(function (JobStatus) {
    JobStatus["Draft"] = "draft";
    JobStatus["Submitted"] = "submitted";
    JobStatus["Normalized"] = "normalized";
    JobStatus["Analyzing"] = "analyzing";
    JobStatus["Scored"] = "scored";
    JobStatus["Recommended"] = "recommended";
    JobStatus["Published"] = "published";
    JobStatus["Archived"] = "archived";
    JobStatus["ValidationFailed"] = "validation_failed";
    JobStatus["AnalysisFailed"] = "analysis_failed";
    JobStatus["ScoringFailed"] = "scoring_failed";
    JobStatus["StaleData"] = "stale_data";
})(JobStatus || (JobStatus = {}));
//# sourceMappingURL=job.js.map