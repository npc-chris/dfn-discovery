"""DFN 48-Hour Feasibility Scorecard Diagnostic Engine.

Aggregates part geometry, DIN ISO 2768 tolerance standards, certified alloy specs,
machinability metrics, and cluster workshop routing into a comprehensive
48-hour feasibility diagnostic scorecard.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

from .alloy_registry import AlloyGrade, AlloySpecification, get_alloy_specification, verify_alloy_composition
from .clusters import ClusterRegion, WorkshopRoutingResult, route_job_to_workshops, WORKSHOP_REGISTRY
from .din_iso_2768 import ToleranceClass, get_linear_tolerance, ingest_prism_tolerance_report, verify_tolerance_fit
from .machinability import evaluate_machinability, MachinabilityScorecard
from .process_strategies import ManufacturingProcessType, resolve_process_strategy
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
    chemical_assay_data: Optional[Dict[str, float]] = None,
    process_type: str = "subtractive_cnc",
    prism_report: Optional[Dict[str, Any]] = None,
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

    # 2. Evaluate DIN ISO 2768 tolerance fit & Prism DFM report
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

    if prism_report:
        prism_data = ingest_prism_tolerance_report(prism_report)
        for warn in prism_data.get("dfm_warnings", []):
            bottlenecks.append(f"Prism CAD DFM Alert: {warn}")

    # 3. Polymorphic Manufacturing Process Feasibility Evaluation
    strategy = resolve_process_strategy(process_type)
    eval_result = strategy.evaluate(
        length_mm=length_mm,
        width_mm=width_mm,
        height_mm=height_mm,
        volume_cm3=volume_cm3,
        tolerance_mm=tolerance_mm,
        alloy_spec=alloy_spec,
        batch_size=batch_size,
    )
    fpy_pct = eval_result.first_pass_yield_pct
    meets_fpy = eval_result.meets_yield_threshold
    bottlenecks.extend(eval_result.diagnostics)
    recommendations.extend(eval_result.recommendations)

    # 4. Nationwide Cluster Workshop Routing (Lagos, Aba, Nnewi, Kano, Kaduna, etc.)
    required_power = (
        eval_result.primary_metric_value
        if strategy.process_type == ManufacturingProcessType.SUBTRACTIVE_CNC
        else 0.0
    )
    required_rpm = 500.0 if strategy.process_type == ManufacturingProcessType.SUBTRACTIVE_CNC else 0.0

    routes = route_job_to_workshops(
        length_mm=length_mm,
        width_mm=width_mm,
        height_mm=height_mm,
        required_spindle_power_kw=required_power,
        required_spindle_rpm=required_rpm,
        tolerance_mm=tolerance_mm,
        material_grade=alloy_spec.grade.value,
        target_tolerance_class=target_tolerance_class,
        preferred_region=destination_region,
        min_first_pass_yield_pct=85.0,  # Filter threshold
        min_generator_kva=25.0,
        process_type=process_type,
    )

    if not routes:
        if strategy.process_type == ManufacturingProcessType.SUBTRACTIVE_CNC:
            bottlenecks.append("No workshop in Lagos, Aba, or Nnewi currently matches both envelope and spindle power.")
        else:
            bottlenecks.append(f"No workshop currently matches both physical envelope and capability for {process_type}.")
        recommendations.append("Consider multi-piece split or alternative manufacturing route in regional network.")
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
            process_type=process_type,
            tolerance_mm=tolerance_mm,
        )

    # 5. Feasibility Status Determination
    has_critical_blocker = (
        not routes or
        alloy_verification_status == "COMPOSITION_REJECTED" or
        fpy_pct < 75.0 or
        not eval_result.is_feasible
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
        first_pass_yield_estimate_pct=fpy_pct,
        meets_90_pct_first_pass_yield=meets_fpy,
        alloy_verification_status=alloy_verification_status,
        din_iso_2768_class=f"DIN ISO 2768-1 ({target_tolerance_class.value})",
        spindle_power_adequate=spindle_adequate if routes else False,
        generator_backup_secured=generator_secured if routes else False,
        ranked_cluster_workshops=routes,
        quotation=quote,
        identified_bottlenecks=bottlenecks,
        engineering_recommendations=recommendations,
    )
