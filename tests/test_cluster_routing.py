"""Tests for Nigerian Industrial Cluster Registry and Workshop Routing Engine.

Verifies bed envelope matching, spindle power thresholds, generator backup constraints,
and multi-cluster routing across Lagos, Aba, and Nnewi.
"""

from hypothesis import given, strategies as st
import pytest

from dfn_discovery.clusters import (
    ClusterRegion,
    WORKSHOP_REGISTRY,
    route_job_to_workshops,
)
from dfn_discovery.din_iso_2768 import ToleranceClass


def test_cluster_registry_integrity():
    """Verify workshop registry contains valid shops across all three Nigerian clusters."""
    assert len(WORKSHOP_REGISTRY) >= 5
    regions = {w.region for w in WORKSHOP_REGISTRY}
    assert ClusterRegion.LAGOS in regions
    assert ClusterRegion.ABA in regions
    assert ClusterRegion.NNEWI in regions

    for shop in WORKSHOP_REGISTRY:
        assert shop.power_profile.has_dedicated_generator is True
        assert shop.power_profile.generator_rating_kva >= 25.0
        assert shop.historical_first_pass_yield_pct >= 85.0
        assert len(shop.machines) >= 1


def test_bed_size_filtering_exclusion():
    """Test that oversized parts exceeding machine beds are filtered out."""
    # Length 4000 mm exceeds all machine beds in the registry (max ~3200 mm press brake, ~2500 mm lathe)
    oversized_routes = route_job_to_workshops(
        length_mm=4000.0,
        width_mm=1500.0,
        height_mm=1000.0,
        required_spindle_power_kw=5.0,
        required_spindle_rpm=1500.0,
        tolerance_mm=0.20,
        material_grade="mild_steel_s235",
        target_tolerance_class=ToleranceClass.COARSE,
    )
    assert len(oversized_routes) == 0


def test_spindle_power_filtering():
    """Test that machines with insufficient spindle power are excluded."""
    # Require 20.0 kW spindle power
    routes = route_job_to_workshops(
        length_mm=400.0,
        width_mm=300.0,
        height_mm=200.0,
        required_spindle_power_kw=20.0,
        required_spindle_rpm=2000.0,
        tolerance_mm=0.10,
        material_grade="en8_1045",
        target_tolerance_class=ToleranceClass.MEDIUM,
    )
    # Only workshops with machines >= 20 kW should be returned (e.g. NNW-OTL-01 CNC dual turning center 22 kW)
    for route in routes:
        assert route.spindle_power_margin_kw >= 0.0


def test_generator_backup_filtering():
    """Test that workshops lacking sufficient generator backup rating are filtered."""
    # When requesting min_generator_kva=100.0, only shops with >= 100 kVA generators qualify
    routes = route_job_to_workshops(
        length_mm=300.0,
        width_mm=200.0,
        height_mm=150.0,
        required_spindle_power_kw=5.0,
        required_spindle_rpm=2000.0,
        tolerance_mm=0.10,
        material_grade="6061_t6",
        min_generator_kva=100.0,
    )
    assert len(routes) > 0
    # Matching shops must have generator >= 100 kVA (e.g. Apex LAG-IKJ-01 120 kVA, Innoson NNW-OTL-01 150 kVA)
    for route in routes:
        shop = next(w for w in WORKSHOP_REGISTRY if w.workshop_id == route.workshop_id)
        assert shop.power_profile.generator_rating_kva >= 100.0


def test_regional_routing_preference():
    """Test that specifying preferred region prioritizes matching cluster workshops."""
    routes_lagos = route_job_to_workshops(
        length_mm=250.0,
        width_mm=150.0,
        height_mm=100.0,
        required_spindle_power_kw=5.0,
        required_spindle_rpm=2500.0,
        tolerance_mm=0.08,
        material_grade="6061_t6",
        preferred_region=ClusterRegion.LAGOS,
    )
    assert len(routes_lagos) > 0
    assert routes_lagos[0].region == ClusterRegion.LAGOS


@given(
    length_mm=st.floats(min_value=50.0, max_value=300.0),
    width_mm=st.floats(min_value=50.0, max_value=300.0),
    height_mm=st.floats(min_value=20.0, max_value=150.0),
)
def test_metamorphic_rotation_invariance_in_bed_fitting(length_mm, width_mm, height_mm):
    """Metamorphic invariant: swapping length and width (90 deg bed rotation) preserves bed fit."""
    routes_direct = route_job_to_workshops(
        length_mm=length_mm,
        width_mm=width_mm,
        height_mm=height_mm,
        required_spindle_power_kw=4.0,
        required_spindle_rpm=2000.0,
        tolerance_mm=0.15,
        material_grade="mild_steel_s235",
        target_tolerance_class=ToleranceClass.COARSE,
    )
    routes_rotated = route_job_to_workshops(
        length_mm=width_mm,
        width_mm=length_mm,
        height_mm=height_mm,
        required_spindle_power_kw=4.0,
        required_spindle_rpm=2000.0,
        tolerance_mm=0.15,
        material_grade="mild_steel_s235",
        target_tolerance_class=ToleranceClass.COARSE,
    )
    # The set of matching machine IDs should be invariant to XY rotation
    matched_machines_direct = {r.selected_machine_id for r in routes_direct}
    matched_machines_rotated = {r.selected_machine_id for r in routes_rotated}
    assert matched_machines_direct == matched_machines_rotated
