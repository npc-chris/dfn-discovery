"""DFN Anti-Overfitting and Metamorphic Invariant Test Suite.

Enforces Rule AO-04: Metamorphic & property-based testing over algorithmic engines.
Validates physical invariants, monotonicity laws, and process capability bounds
across randomized engineering parameter domains.
"""

import math
from hypothesis import given, strategies as st
import pytest

from dfn_discovery.alloy_registry import ALLOY_CATALOG, get_alloy_specification
from dfn_discovery.clusters import WORKSHOP_REGISTRY
from dfn_discovery.machinability import (
    calculate_cutting_power,
    calculate_material_removal_rate,
    calculate_process_capability,
    calculate_spindle_speed,
    estimate_first_pass_yield,
)
from dfn_discovery.quotation import calculate_fabrication_quote


# ---------------------------------------------------------------------------
# Metamorphic Property 1: Spindle Speed Inverse Proportionality
# ---------------------------------------------------------------------------
@given(
    d_small=st.floats(min_value=5.0, max_value=40.0),
    d_large=st.floats(min_value=50.0, max_value=200.0),
    cutting_speed_m_min=st.floats(min_value=30.0, max_value=300.0),
)
def test_metamorphic_spindle_speed_monotonic_decrease(d_small, d_large, cutting_speed_m_min):
    """Monotonicity law: For a constant cutting speed, larger tool/stock diameter strictly lowers RPM."""
    rpm_small = calculate_spindle_speed(d_small, cutting_speed_m_min)
    rpm_large = calculate_spindle_speed(d_large, cutting_speed_m_min)
    assert rpm_small > rpm_large
    # Verify physical formula exactness: n = 1000 * vc / (pi * D)
    expected_small = (1000.0 * cutting_speed_m_min) / (math.pi * d_small)
    assert rpm_small == pytest.approx(expected_small, rel=1e-3)


# ---------------------------------------------------------------------------
# Metamorphic Property 2: First-Pass Yield (FPY) Monotonicity with C_pk
# ---------------------------------------------------------------------------
@given(
    c_pk_low=st.floats(min_value=0.2, max_value=0.9),
    c_pk_high=st.floats(min_value=1.0, max_value=2.5),
)
def test_metamorphic_first_pass_yield_monotonicity(c_pk_low, c_pk_high):
    """Monotonicity law: Higher process capability index C_pk strictly increases first-pass yield."""
    yield_low = estimate_first_pass_yield(c_pk_low)
    yield_high = estimate_first_pass_yield(c_pk_high)
    assert yield_high >= yield_low
    # Physical benchmark: Cpk >= 1.0 guarantees >= 90% yield (under 3-sigma centered distribution, ~99.73%)
    assert yield_high >= 90.0


# ---------------------------------------------------------------------------
# Metamorphic Property 3: Material Removal Rate (MRR) Linearity
# ---------------------------------------------------------------------------
@given(
    table_feed_mm_min=st.floats(min_value=50.0, max_value=1000.0),
    depth_of_cut_mm=st.floats(min_value=0.5, max_value=10.0),
    width_of_cut_mm=st.floats(min_value=2.0, max_value=50.0),
)
def test_property_material_removal_rate_positivity_and_linearity(
    table_feed_mm_min, depth_of_cut_mm, width_of_cut_mm
):
    """Property: MRR is strictly positive and proportional to cut volume."""
    mrr = calculate_material_removal_rate(
        table_feed_mm_min=table_feed_mm_min,
        depth_of_cut_mm=depth_of_cut_mm,
        width_of_cut_mm=width_of_cut_mm,
    )
    expected = (table_feed_mm_min * depth_of_cut_mm * width_of_cut_mm) / 1000.0
    assert mrr == pytest.approx(expected, rel=1e-3)
    assert mrr > 0.0


# ---------------------------------------------------------------------------
# Metamorphic Property 4: Cutting Power Proportionality to Cutting Force
# ---------------------------------------------------------------------------
@given(
    mrr_cm3_min=st.floats(min_value=5.0, max_value=100.0),
    specific_cutting_force_n_mm2=st.floats(min_value=600.0, max_value=3500.0),
)
def test_property_cutting_power_monotonic_with_material_strength(
    mrr_cm3_min, specific_cutting_force_n_mm2
):
    """Property: Harder materials with higher specific cutting force demand strictly more cutting power."""
    power = calculate_cutting_power(
        mrr_cm3_min=mrr_cm3_min,
        specific_cutting_force_n_mm2=specific_cutting_force_n_mm2,
    )
    assert power > 0.0
    # Increasing specific cutting force by 50% must increase cutting power by 50%
    higher_power = calculate_cutting_power(
        mrr_cm3_min=mrr_cm3_min,
        specific_cutting_force_n_mm2=specific_cutting_force_n_mm2 * 1.5,
    )
    assert higher_power == pytest.approx(power * 1.5, rel=1e-3)


# ---------------------------------------------------------------------------
# Metamorphic Property 5: Escrow Milestone Conservation Law
# ---------------------------------------------------------------------------
@given(
    length_mm=st.floats(min_value=40.0, max_value=300.0),
    width_mm=st.floats(min_value=30.0, max_value=200.0),
    height_mm=st.floats(min_value=15.0, max_value=100.0),
    volume_cm3=st.floats(min_value=20.0, max_value=800.0),
    batch_size=st.integers(min_value=1, max_value=50),
)
def test_property_escrow_milestones_exact_reconciliation(
    length_mm, width_mm, height_mm, volume_cm3, batch_size
):
    """Invariant: Total escrow strictly equals total quote and matches sum of all three milestones."""
    alloy = get_alloy_specification("6061_t6")
    shop = WORKSHOP_REGISTRY[0]  # Apex
    quote = calculate_fabrication_quote(
        length_mm=length_mm,
        width_mm=width_mm,
        height_mm=height_mm,
        volume_cm3=volume_cm3,
        alloy_spec=alloy,
        workshop=shop,
        batch_size=batch_size,
    )
    assert quote.total_quote_ngn > 0.0
    escrow = quote.escrow_schedule
    sum_m = round(
        escrow.milestone_1_material_procurement_ngn +
        escrow.milestone_2_first_article_inspection_ngn +
        escrow.milestone_3_final_metrology_acceptance_ngn,
        2
    )
    assert sum_m == pytest.approx(quote.total_quote_ngn, abs=0.02)
    assert escrow.total_escrow_ngn == quote.total_quote_ngn
