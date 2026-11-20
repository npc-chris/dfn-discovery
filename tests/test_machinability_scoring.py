"""Unit tests for machinability, spindle limits, and process capability Cpk."""

import pytest
from dfn_discovery.alloy_registry import ALLOY_CATALOG, AlloyGrade
from dfn_discovery.machinability import (
    calculate_spindle_requirements,
    calculate_process_capability,
    estimate_first_pass_yield,
    evaluate_machinability,
)


def test_spindle_speed_inversely_proportional_to_diameter(sample_aluminum_spec):
    # n = 1000 * v_c / (pi * D)
    d20 = calculate_spindle_requirements(
        diameter_mm=20.0,
        cutting_speed_m_min=sample_aluminum_spec.cutting_speed_m_min,
        feed_per_tooth_mm=0.1,
        num_teeth=4,
        depth_of_cut_mm=2.0,
        width_of_cut_mm=10.0,
        yield_strength_mpa=sample_aluminum_spec.yield_strength_mpa,
        machinability_index=sample_aluminum_spec.machinability_index,
    )
    d40 = calculate_spindle_requirements(
        diameter_mm=40.0,
        cutting_speed_m_min=sample_aluminum_spec.cutting_speed_m_min,
        feed_per_tooth_mm=0.1,
        num_teeth=4,
        depth_of_cut_mm=2.0,
        width_of_cut_mm=10.0,
        yield_strength_mpa=sample_aluminum_spec.yield_strength_mpa,
        machinability_index=sample_aluminum_spec.machinability_index,
    )
    # Doubling diameter must halve spindle speed
    assert pytest.approx(d20.spindle_speed_rpm / d40.spindle_speed_rpm, 0.05) == 2.0


def test_process_capability_and_first_pass_yield():
    # Tolerance ±0.15 mm with 0.010 mm machine repeatability -> Cpk > 1.33 -> FPY > 99%
    c_pk_high = calculate_process_capability(tolerance_mm=0.15, machine_repeatability_std_mm=0.010)
    fpy_high = estimate_first_pass_yield(c_pk_high)
    assert c_pk_high >= 1.33
    assert fpy_high >= 99.0

    # Extremely tight tolerance ±0.010 mm with standard machine repeatability 0.015 mm
    c_pk_tight = calculate_process_capability(tolerance_mm=0.010, machine_repeatability_std_mm=0.015)
    fpy_tight = estimate_first_pass_yield(c_pk_tight)
    assert c_pk_tight < 0.70
    assert fpy_tight < 90.0


def test_evaluate_machinability_standard_shaft(sample_shaft_steel_spec):
    score = evaluate_machinability(
        alloy_spec=sample_shaft_steel_spec,
        diameter_mm=30.0,
        tolerance_mm=0.10,
        available_spindle_power_kw=15.0,
        max_spindle_rpm=4500.0,
    )
    assert score.spindle_speed_rpm > 500.0
    assert score.cutting_power_kw > 0.10
    assert score.meets_first_pass_yield_threshold is True
    assert score.estimated_first_pass_yield_pct >= 90.0
    assert score.chatter_risk in ("LOW_STABLE", "MODERATE_CHATTER")
