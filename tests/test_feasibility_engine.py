"""Tests for 48-Hour Feasibility Scorecard Diagnostic Engine.

Verifies end-to-end integration of geometry, DIN ISO 2768 tolerances, alloy verification,
machinability scoring, and workshop routing into diagnostic scorecards.
"""

from hypothesis import given, strategies as st
import pytest

from dfn_discovery.clusters import ClusterRegion
from dfn_discovery.din_iso_2768 import ToleranceClass
from dfn_discovery.feasibility_engine import (
    FeasibilityScorecard,
    FeasibilityStatus,
    generate_48hr_feasibility_scorecard,
)


def test_standard_part_feasible_scorecard():
    """Verify that a standard shaft in 6061 aluminium generates a FEASIBLE scorecard."""
    scorecard = generate_48hr_feasibility_scorecard(
        job_rfq_id="RFQ-LAGOS-2026-001",
        part_name="Flanged Support Pin",
        length_mm=120.0,
        width_mm=40.0,
        height_mm=40.0,
        volume_cm3=150.0,
        tolerance_mm=0.15,
        material_grade="6061_t6",
        batch_size=10,
        target_tolerance_class=ToleranceClass.MEDIUM,
        destination_region=ClusterRegion.LAGOS,
    )
    assert scorecard.job_rfq_id == "RFQ-LAGOS-2026-001"
    assert scorecard.sla_hours_guarantee == 48
    assert scorecard.feasibility_status in (FeasibilityStatus.FEASIBLE, FeasibilityStatus.FEASIBLE_WITH_MODIFICATIONS)
    assert scorecard.first_pass_yield_estimate_pct >= 90.0
    assert scorecard.meets_90_pct_first_pass_yield is True
    assert scorecard.quotation is not None
    assert scorecard.quotation.total_quote_ngn > 0.0
    assert len(scorecard.ranked_cluster_workshops) > 0


def test_tight_tolerance_feasible_with_modifications():
    """Verify that very tight tolerance triggers recommendations for secondary grinding."""
    scorecard = generate_48hr_feasibility_scorecard(
        job_rfq_id="RFQ-LAGOS-2026-002",
        part_name="Ultra Precision Spindle Collar",
        length_mm=80.0,
        width_mm=80.0,
        height_mm=25.0,
        volume_cm3=90.0,
        tolerance_mm=0.015,  # Very tight tolerance
        material_grade="en8_1045",
        batch_size=5,
        target_tolerance_class=ToleranceClass.FINE,
    )
    # Tight tolerance triggers recommendation
    assert any("tighter than ISO" in rec or "grinding" in rec for rec in scorecard.engineering_recommendations)


def test_critical_incompatibility_on_massive_part():
    """Verify that a part exceeding all machine envelopes triggers CRITICAL_INCOMPATIBILITY."""
    scorecard = generate_48hr_feasibility_scorecard(
        job_rfq_id="RFQ-ABA-2026-003",
        part_name="Gigantic Quarry Crusher Frame",
        length_mm=6000.0,  # Exceeds all machine beds
        width_mm=3000.0,
        height_mm=2500.0,
        volume_cm3=450000.0,
        tolerance_mm=0.50,
        material_grade="mild_steel_s235",
        batch_size=1,
    )
    assert scorecard.feasibility_status == FeasibilityStatus.CRITICAL_INCOMPATIBILITY
    assert scorecard.overall_confidence_score <= 0.50
    assert len(scorecard.ranked_cluster_workshops) == 0
    assert any("matches both envelope and spindle" in b for b in scorecard.identified_bottlenecks)


def test_composition_rejected_triggers_critical_incompatibility():
    """Verify that contaminated scrap chemical assay triggers CRITICAL_INCOMPATIBILITY."""
    contaminated_assay = {
        "Si": 8.50,  # Extreme scrap contamination
        "Fe": 2.80,
        "Cu": 3.50,
        "Mg": 0.02,
        "Al": 85.0,
    }
    scorecard = generate_48hr_feasibility_scorecard(
        job_rfq_id="RFQ-NNEWI-2026-004",
        part_name="Critical Suspension Arm",
        length_mm=200.0,
        width_mm=60.0,
        height_mm=40.0,
        volume_cm3=350.0,
        tolerance_mm=0.10,
        material_grade="6061_t6",
        chemical_assay_data=contaminated_assay,
    )
    assert scorecard.feasibility_status == FeasibilityStatus.CRITICAL_INCOMPATIBILITY
    assert scorecard.alloy_verification_status == "COMPOSITION_REJECTED"


@given(
    length_mm=st.floats(min_value=60.0, max_value=200.0),
    width_mm=st.floats(min_value=40.0, max_value=120.0),
    height_mm=st.floats(min_value=20.0, max_value=80.0),
    volume_cm3=st.floats(min_value=50.0, max_value=500.0),
)
def test_property_scorecard_contract_bounds(length_mm, width_mm, height_mm, volume_cm3):
    """Property test asserting scorecard invariants: SLA guarantee is 48 hours and confidence score is bounded."""
    scorecard = generate_48hr_feasibility_scorecard(
        job_rfq_id="RFQ-PBT-TEST",
        part_name="Generic Test Part",
        length_mm=length_mm,
        width_mm=width_mm,
        height_mm=height_mm,
        volume_cm3=volume_cm3,
        tolerance_mm=0.15,
        material_grade="mild_steel_s235",
        batch_size=2,
    )
    assert scorecard.sla_hours_guarantee == 48
    assert 0.0 <= scorecard.overall_confidence_score <= 1.0
    assert 0.0 <= scorecard.first_pass_yield_estimate_pct <= 100.0
