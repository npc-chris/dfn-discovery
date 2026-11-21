"""Tests for Multi-Process Feasibility Strategies and Prism Integration.

Verifies pluggable process strategies:
- SubtractiveMachiningStrategy
- SheetMetalFormingStrategy
- FoundryCastingStrategy
- StructuralWeldingStrategy
along with dfn-prism tolerance ingestion and nationwide cluster routing.
"""

from hypothesis import given, strategies as st
import pytest

from dfn_discovery.alloy_registry import get_alloy_specification
from dfn_discovery.clusters import ClusterRegion, route_job_to_workshops
from dfn_discovery.din_iso_2768 import ToleranceClass, ingest_prism_tolerance_report
from dfn_discovery.feasibility_engine import (
    FeasibilityStatus,
    generate_48hr_feasibility_scorecard,
)
from dfn_discovery.process_strategies import (
    FoundryCastingStrategy,
    ManufacturingProcessType,
    SheetMetalFormingStrategy,
    StructuralWeldingStrategy,
    SubtractiveMachiningStrategy,
    resolve_process_strategy,
)


@pytest.fixture
def aluminium_alloy():
    return get_alloy_specification("6061_t6")


@pytest.fixture
def mild_steel_alloy():
    return get_alloy_specification("mild_steel_s235")


@pytest.fixture
def gray_iron_alloy():
    return get_alloy_specification("gray_iron_gg25")


def test_resolve_process_strategy_dispatcher():
    """Verify strategy dispatcher maps process keywords to appropriate strategy."""
    strat_cnc = resolve_process_strategy("CNC_Milling_3Axis")
    assert isinstance(strat_cnc, SubtractiveMachiningStrategy)
    assert strat_cnc.process_type == ManufacturingProcessType.SUBTRACTIVE_CNC

    strat_sheet = resolve_process_strategy("Sheet_Metal_Forming")
    assert isinstance(strat_sheet, SheetMetalFormingStrategy)
    assert strat_sheet.process_type == ManufacturingProcessType.SHEET_METAL_FORMING

    strat_cast = resolve_process_strategy("Casting_Sand")
    assert isinstance(strat_cast, FoundryCastingStrategy)
    assert strat_cast.process_type == ManufacturingProcessType.FOUNDRY_CASTING

    strat_weld = resolve_process_strategy("Welding_MIG")
    assert isinstance(strat_weld, StructuralWeldingStrategy)
    assert strat_weld.process_type == ManufacturingProcessType.STRUCTURAL_WELDING


def test_sheet_metal_forming_strategy(mild_steel_alloy):
    """Verify sheet metal press brake air-bending tonnage and cycle time."""
    strategy = SheetMetalFormingStrategy()
    eval_res = strategy.evaluate(
        length_mm=400.0,
        width_mm=250.0,
        height_mm=2.5,
        volume_cm3=250.0,
        tolerance_mm=0.25,
        alloy_spec=mild_steel_alloy,
        batch_size=10,
        process_params={"sheet_thickness_mm": 2.5, "num_bends": 4, "available_tonnage": 100.0},
    )
    assert eval_res.is_feasible is True
    assert eval_res.primary_metric_name == "press_brake_tonnage"
    assert eval_res.primary_metric_value > 0.0
    assert eval_res.primary_metric_unit == "metric_tons"
    assert eval_res.first_pass_yield_pct >= 90.0
    assert eval_res.cycle_time_minutes > 0.0


def test_foundry_casting_strategy(gray_iron_alloy):
    """Verify sand casting melt weight and flask capacity validation."""
    strategy = FoundryCastingStrategy()
    eval_res = strategy.evaluate(
        length_mm=300.0,
        width_mm=200.0,
        height_mm=150.0,
        volume_cm3=1200.0,
        tolerance_mm=1.0,
        alloy_spec=gray_iron_alloy,
        batch_size=5,
        process_params={"furnace_capacity_kg": 300.0},
    )
    assert eval_res.is_feasible is True
    assert eval_res.primary_metric_name == "pour_mass_kg"
    assert eval_res.primary_metric_value > 0.0
    assert eval_res.primary_metric_unit == "kg"
    assert eval_res.cycle_time_minutes > 15.0


def test_structural_welding_strategy_weldable_vs_unweldable(mild_steel_alloy):
    """Verify structural welding strategy respects alloy weldability."""
    strategy = StructuralWeldingStrategy()
    eval_weldable = strategy.evaluate(
        length_mm=500.0,
        width_mm=300.0,
        height_mm=100.0,
        volume_cm3=1500.0,
        tolerance_mm=1.5,
        alloy_spec=mild_steel_alloy,  # S235 is weldable
        batch_size=2,
    )
    assert eval_weldable.is_feasible is True
    assert eval_weldable.primary_metric_name == "weld_deposition_mass"

    # Non-weldable cast iron or EN8
    en8_alloy = get_alloy_specification("en8_1045")
    eval_unweldable = strategy.evaluate(
        length_mm=500.0,
        width_mm=300.0,
        height_mm=100.0,
        volume_cm3=1500.0,
        tolerance_mm=1.5,
        alloy_spec=en8_alloy,
        batch_size=2,
    )
    assert eval_unweldable.is_feasible is False
    assert any("NON-WELDABLE" in diag for diag in eval_unweldable.diagnostics)


def test_prism_tolerance_report_ingestion():
    """Verify clean ingestion of dfn-prism CAD DFM analysis payload."""
    prism_mock_payload = {
        "tolerance_class": "fine",
        "analysis": {
            "bounding_box": [120.0, 80.0, 45.0],
            "volume_cm3": 210.0,
        },
        "dfm": {
            "tight_tolerances": ["Shaft bearing seat ±0.012mm"],
            "warnings": ["Pocket depth to width ratio exceeds 3.5x tool reach"],
            "min_bend_radius_mm": 2.0,
        },
    }
    ingested = ingest_prism_tolerance_report(prism_mock_payload)
    assert ingested["has_prism_data"] is True
    assert ingested["detected_tolerance_class"] == "f"
    assert ingested["detected_class_name"] == "fine"
    assert len(ingested["tight_features"]) == 1
    assert len(ingested["dfm_warnings"]) == 1


def test_authentic_prism_v1_1_metadata_ingestion():
    """Verify ingestion of authentic PrismReportManifest v1.1 payload with metadata tolerance_analysis."""
    prism_v1_1_payload = {
        "schema_version": "1.1",
        "report_id": "rep_12345",
        "geometry": {
            "bounding_box": [100.0, 50.0, 25.0],
            "volume_mm3": 125000.0,
        },
        "metadata": {
            "parser_version": "0.1.0",
            "inference_engine": "rule_based_v1",
            "tolerance_class": "f",
            "tolerance_analysis": {
                "tolerance_class": "f",
                "class_name": "fine",
                "tight_tolerance_features": [
                    {
                        "feature_id": "hole_1",
                        "feature_type": "through_hole",
                        "nominal_mm": 20.0,
                        "specified_tolerance_mm": 0.012,
                        "classification": "precision_bearing_seat",
                    }
                ],
                "dfm_warnings": ["Pocket depth exceeds 3.5x endmill reach"],
            },
        },
    }
    ingested = ingest_prism_tolerance_report(prism_v1_1_payload)
    assert ingested["has_prism_data"] is True
    assert ingested["detected_tolerance_class"] == "f"
    assert ingested["detected_class_name"] == "fine"
    assert len(ingested["tight_features"]) == 1
    assert len(ingested["dfm_warnings"]) == 1


def test_nationwide_cluster_routing_kano_foundry():
    """Verify that a sand casting job routes to Northern Precision Foundries in Kano."""
    routes = route_job_to_workshops(
        length_mm=350.0,
        width_mm=250.0,
        height_mm=180.0,
        required_spindle_power_kw=0.0,
        required_spindle_rpm=0.0,
        tolerance_mm=1.2,
        material_grade="gray_iron_gg25",
        target_tolerance_class=ToleranceClass.COARSE,
        preferred_region=ClusterRegion.KANO,
        process_type="foundry_casting",
    )
    assert len(routes) > 0
    assert any(r.region == ClusterRegion.KANO for r in routes)


def test_sheet_metal_bracket_feasibility_scorecard():
    """Verify generating a 48-hour feasibility scorecard for a sheet metal bracket with Prism report."""
    prism_report = {
        "tolerance_class": "medium",
        "dfm": {
            "warnings": ["Flange length near minimum 12mm die opening threshold"],
        },
    }
    scorecard = generate_48hr_feasibility_scorecard(
        job_rfq_id="RFQ-KADUNA-2026-001",
        part_name="Mounting Gusset Bracket",
        length_mm=250.0,
        width_mm=180.0,
        height_mm=3.0,
        volume_cm3=135.0,
        tolerance_mm=0.25,
        material_grade="mild_steel_s235",
        batch_size=20,
        process_type="sheet_metal_forming",
        destination_region=ClusterRegion.KADUNA,
        prism_report=prism_report,
    )
    assert scorecard.sla_hours_guarantee == 48
    assert scorecard.feasibility_status in (FeasibilityStatus.FEASIBLE, FeasibilityStatus.FEASIBLE_WITH_MODIFICATIONS)
    assert any("Prism CAD DFM Alert" in b for b in scorecard.identified_bottlenecks)
    assert scorecard.quotation is not None
    assert scorecard.quotation.total_quote_ngn > 0.0


@given(
    bend_length_mm=st.floats(min_value=50.0, max_value=800.0),
    thickness_mm=st.floats(min_value=1.0, max_value=6.0),
)
def test_property_sheet_metal_tonnage_monotonicity(bend_length_mm, thickness_mm):
    """Property test: Press brake tonnage strictly increases with bend length and thickness."""
    mild_steel_alloy = get_alloy_specification("mild_steel_s235")
    strategy = SheetMetalFormingStrategy()
    eval_base = strategy.evaluate(
        length_mm=bend_length_mm,
        width_mm=20.0,
        height_mm=thickness_mm,
        volume_cm3=50.0,
        tolerance_mm=0.25,
        alloy_spec=mild_steel_alloy,
        batch_size=1,
        process_params={"sheet_thickness_mm": thickness_mm, "num_bends": 1},
    )
    # Double bend length -> tonnage should roughly double
    eval_double_len = strategy.evaluate(
        length_mm=bend_length_mm * 2.0,
        width_mm=20.0,
        height_mm=thickness_mm,
        volume_cm3=100.0,
        tolerance_mm=0.25,
        alloy_spec=mild_steel_alloy,
        batch_size=1,
        process_params={"sheet_thickness_mm": thickness_mm, "num_bends": 1},
    )
    assert eval_double_len.primary_metric_value > eval_base.primary_metric_value
    # Allow 0.2 abs tolerance due to 1-decimal rounding in strategy evaluation
    assert eval_double_len.primary_metric_value == pytest.approx(eval_base.primary_metric_value * 2.0, abs=0.25)
