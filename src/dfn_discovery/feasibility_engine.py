"""DFN 48-Hour Feasibility Scorecard Diagnostic Engine.

Aggregates part geometry, DIN ISO 2768 tolerance standards, certified alloy specs,
machinability metrics, and cluster workshop routing into a comprehensive
48-hour feasibility diagnostic scorecard.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional

from .alloy_registry import AlloyGrade, AlloySpecification, get_alloy_specification, verify_alloy_composition
from .clusters import ClusterRegion, WorkshopRoutingResult, route_job_to_workshops, WORKSHOP_REGISTRY
from .din_iso_2768 import ToleranceClass, get_linear_tolerance, verify_tolerance_fit
from .machinability import evaluate_machinability, MachinabilityScorecard
from .quotation import QuoteBreakdown, calculate_fabrication_quote


class FeasibilityStatus(str, Enum):
    FEASIBLE = "feasible"
    FEASIBLE_WITH_MODIFICATIONS = "feasible_with_modifications"
    CRITICAL_INCOMPATIBILITY = "critical_incompatibility"


@dataclass
class FeasibilityScorecard:
    job_rfq_id: str
    part_name: str
    feasibility_status: FeasibilityStatus
    overall_confidence_score: float  # 0.0 - 1.0
    sla_hours_guarantee: int  # 48 hours
    first_pass_yield_estimate_pct: float
    meets_90_pct_first_pass_yield: bool
    alloy_verification_status: str
    din_iso_2768_class: str
    spindle_power_adequate: bool
    generator_backup_secured: bool
    ranked_cluster_workshops: List[WorkshopRoutingResult]
    quotation: Optional[QuoteBreakdown]
    identified_bottlenecks: List[str]
    engineering_recommendations: List[str]


def generate_48hr_feasibility_scorecard(
    job_rfq_id: str,
    part_name: str,
    length_mm: float,
    width_mm: float,
    height_mm: float,
    volume_cm3: float,
    tolerance_mm: float,
    material_grade: str,
    batch_size: int = 1,
    target_tolerance_class: ToleranceClass = ToleranceClass.MEDIUM,
    destination_region: Optional[ClusterRegion] = None,
    chemical_assay_data: Optional[Dict[str, float]] = None
) -> FeasibilityScorecard:
    """Generate comprehensive 48-hour feasibility diagnostic scorecard.
    
    Actively references:
    - length_mm, width_mm, height_mm: for envelope and bed fit.
    - volume_cm3: for mass and chip calculations.
    - tolerance_mm: for ISO 2768 capability and process yield.
    - batch_size: for volume scaling and setup amortization.
    """
    bottlenecks: List[str] = []
    recommendations: List[str] = []

    # 1. Resolve and verify alloy
    alloy_spec = get_alloy_specification(material_grade)
    if not alloy_spec:
        # Fallback to structural mild steel S235 if unspecified
        alloy_spec = get_alloy_specification("mild_steel_s235")
        bottlenecks.append(f"Material '{material_grade}' unknown; defaulted to S235JR mild steel.")
        recommendations.append("Specify standardized DIN/EN/AISI alloy grade for certification.")

    alloy_verification_status = "CERTIFIED_SPECIFICATION"
    if chemical_assay_data:
        assay_audit = verify_alloy_composition(alloy_spec.grade, chemical_assay_data)
        alloy_verification_status = str(assay_audit["verification_status"])
        if not assay_audit["verified"]:
            bottlenecks.append(
                f"Chemical assay out-of-spec for {alloy_spec.common_name} (integrity: {assay_audit['integrity_score']})."
            )
            recommendations.append("Source stock from certified DFN metal stockist with mill test certificate (MTC).")

    # 2. Evaluate DIN ISO 2768 tolerance fit
    largest_dimension = max(length_mm, width_mm, height_mm)
    tol_eval = verify_tolerance_fit(
        nominal_dim_mm=largest_dimension,
        tolerance_mm=tolerance_mm,
        target_class=target_tolerance_class,
    )
    if tol_eval["is_tighter_than_iso"]:
        recommendations.append(
            f"Drawing tolerance ±{tolerance_mm}mm is tighter than ISO 2768-{target_tolerance_class.value} "
            f"(±{tol_eval['iso_standard_allowance_mm']}mm); requires fine finishing or grinding."
        )

    # 3. Machinability & Spindle Dynamics
    effective_diameter = max(10.0, min(largest_dimension * 0.25, 80.0))
    mach_score = evaluate_machinability(
        alloy_spec=alloy_spec,
        diameter_mm=effective_diameter,
        tolerance_mm=tolerance_mm,
        available_spindle_power_kw=15.0,  # Standard cluster baseline
        max_spindle_rpm=8000.0,
    )
    if not mach_score.meets_first_pass_yield_threshold:
        bottlenecks.append(
            f"Estimated first-pass yield ({mach_score.estimated_first_pass_yield_pct}%) below 90% threshold."
        )
        recommendations.append("Open tolerance band or allocate secondary grinding operation to achieve >90% yield.")

    # 4. Cluster Workshop Routing (Lagos, Aba, Nnewi)
    routes = route_job_to_workshops(
        length_mm=length_mm,
        width_mm=width_mm,
        height_mm=height_mm,
        required_spindle_power_kw=mach_score.cutting_power_kw,
        required_spindle_rpm=mach_score.spindle_speed_rpm,
        tolerance_mm=tolerance_mm,
        material_grade=alloy_spec.grade.value,
        target_tolerance_class=target_tolerance_class,
        preferred_region=destination_region,
        min_first_pass_yield_pct=88.0,  # Filter threshold
        min_generator_kva=25.0,
    )

    if not routes:
        bottlenecks.append("No workshop in Lagos, Aba, or Nnewi currently matches both envelope and spindle power.")
        recommendations.append("Consider multi-piece split or sub-assembly fabrication to fit smaller machine beds.")
        generator_secured = False
        spindle_adequate = False
        quote = None
    else:
        best_shop_id = routes[0].workshop_id
        best_shop = next(w for w in WORKSHOP_REGISTRY if w.workshop_id == best_shop_id)
        generator_secured = best_shop.power_profile.has_dedicated_generator
        spindle_adequate = routes[0].spindle_power_margin_kw >= 0.0

        # Calculate quote with best matching shop
        quote = calculate_fabrication_quote(
            length_mm=length_mm,
            width_mm=width_mm,
            height_mm=height_mm,
            volume_cm3=volume_cm3,
            alloy_spec=alloy_spec,
            workshop=best_shop,
            batch_size=batch_size,
            tolerance_class=target_tolerance_class,
            destination_region=destination_region,
        )

    # 5. Feasibility Status Determination
    has_critical_blocker = (
        not routes or
        alloy_verification_status == "COMPOSITION_REJECTED" or
        mach_score.estimated_first_pass_yield_pct < 75.0
    )

    if has_critical_blocker:
        status = FeasibilityStatus.CRITICAL_INCOMPATIBILITY
        confidence = 0.25
    elif bottlenecks:
        status = FeasibilityStatus.FEASIBLE_WITH_MODIFICATIONS
        confidence = 0.78
    else:
        status = FeasibilityStatus.FEASIBLE
        confidence = 0.94

    return FeasibilityScorecard(
        job_rfq_id=job_rfq_id,
        part_name=part_name,
        feasibility_status=status,
        overall_confidence_score=confidence,
        sla_hours_guarantee=48,
        first_pass_yield_estimate_pct=mach_score.estimated_first_pass_yield_pct,
        meets_90_pct_first_pass_yield=mach_score.meets_first_pass_yield_threshold,
        alloy_verification_status=alloy_verification_status,
        din_iso_2768_class=f"DIN ISO 2768-1 ({target_tolerance_class.value})",
        spindle_power_adequate=spindle_adequate if routes else False,
        generator_backup_secured=generator_secured if routes else False,
        ranked_cluster_workshops=routes,
        quotation=quote,
        identified_bottlenecks=bottlenecks,
        engineering_recommendations=recommendations,
    )
