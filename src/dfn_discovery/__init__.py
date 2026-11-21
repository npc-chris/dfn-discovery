"""DFN Discovery Feasibility, Machinability & Cluster Routing Engine.

Core algorithmic module for low-volume fabrication feasibility diagnostics,
tolerance capability evaluation (DIN ISO 2768), alloy verification,
Nigerian industrial cluster workshop routing (Lagos, Aba, Nnewi), and
physics-grounded quotation.
"""

from .din_iso_2768 import (
    ToleranceClass,
    LinearToleranceRange,
    AngularToleranceRange,
    get_linear_tolerance,
    get_broken_edge_tolerance,
    get_angular_tolerance,
    verify_tolerance_fit,
    ingest_prism_tolerance_report,
)
from .process_strategies import (
    ManufacturingProcessType,
    ProcessEvaluationResult,
    ProcessFeasibilityStrategy,
    SubtractiveMachiningStrategy,
    SheetMetalFormingStrategy,
    FoundryCastingStrategy,
    StructuralWeldingStrategy,
    resolve_process_strategy,
)
from .alloy_registry import (
    AlloyGrade,
    AlloyFamily,
    AlloySpecification,
    verify_alloy_composition,
    get_alloy_specification,
    ALLOY_CATALOG,
)
from .machinability import (
    MachinabilityScorecard,
    evaluate_machinability,
    calculate_spindle_requirements,
    calculate_process_capability,
    estimate_first_pass_yield,
)
from .clusters import (
    ClusterRegion,
    MachineSpecification,
    PowerResilienceProfile,
    WorkshopProfile,
    WorkshopRoutingResult,
    route_job_to_workshops,
    WORKSHOP_REGISTRY,
)
from .quotation import (
    QuoteBreakdown,
    MilestoneEscrowSchedule,
    calculate_fabrication_quote,
)
from .feasibility_engine import (
    FeasibilityStatus,
    FeasibilityScorecard,
    generate_48hr_feasibility_scorecard,
)

__all__ = [
    "ToleranceClass",
    "LinearToleranceRange",
    "AngularToleranceRange",
    "get_linear_tolerance",
    "get_broken_edge_tolerance",
    "get_angular_tolerance",
    "verify_tolerance_fit",
    "AlloyGrade",
    "AlloyFamily",
    "AlloySpecification",
    "verify_alloy_composition",
    "get_alloy_specification",
    "ALLOY_CATALOG",
    "MachinabilityScorecard",
    "evaluate_machinability",
    "calculate_spindle_requirements",
    "calculate_process_capability",
    "estimate_first_pass_yield",
    "ClusterRegion",
    "MachineSpecification",
    "PowerResilienceProfile",
    "WorkshopProfile",
    "WorkshopRoutingResult",
    "route_job_to_workshops",
    "WORKSHOP_REGISTRY",
    "QuoteBreakdown",
    "MilestoneEscrowSchedule",
    "calculate_fabrication_quote",
    "FeasibilityStatus",
    "FeasibilityScorecard",
    "generate_48hr_feasibility_scorecard",
]
