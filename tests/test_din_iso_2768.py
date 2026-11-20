"""Unit tests for DIN ISO 2768-1 general tolerance standards."""

import pytest
from dfn_discovery.din_iso_2768 import (
    ToleranceClass,
    get_linear_tolerance,
    get_broken_edge_tolerance,
    get_angular_tolerance,
    verify_tolerance_fit,
)


def test_linear_tolerance_fine_class():
    # 0.5 to 3 mm -> ±0.05
    assert get_linear_tolerance(2.5, ToleranceClass.FINE) == 0.05
    # 6 to 30 mm -> ±0.1
    assert get_linear_tolerance(25.0, ToleranceClass.FINE) == 0.1
    # 120 to 400 mm -> ±0.2
    assert get_linear_tolerance(250.0, ToleranceClass.FINE) == 0.2
    # 400 to 1000 mm -> ±0.3
    assert get_linear_tolerance(600.0, ToleranceClass.FINE) == 0.3


def test_linear_tolerance_medium_class():
    # 3 to 6 mm -> ±0.1
    assert get_linear_tolerance(5.0, ToleranceClass.MEDIUM) == 0.1
    # 30 to 120 mm -> ±0.3
    assert get_linear_tolerance(80.0, ToleranceClass.MEDIUM) == 0.3
    # 1000 to 2000 mm -> ±1.2
    assert get_linear_tolerance(1500.0, ToleranceClass.MEDIUM) == 1.2


def test_linear_tolerance_coarse_and_very_coarse():
    # 30 to 120 mm coarse -> ±0.8
    assert get_linear_tolerance(50.0, ToleranceClass.COARSE) == 0.8
    # 30 to 120 mm very coarse -> ±1.5
    assert get_linear_tolerance(50.0, ToleranceClass.VERY_COARSE) == 1.5


def test_broken_edge_chamfer_tolerances():
    # 0.5 to 3 mm radius -> ±0.2 for fine/medium, ±0.4 for coarse
    assert get_broken_edge_tolerance(2.0, ToleranceClass.FINE) == 0.2
    assert get_broken_edge_tolerance(2.0, ToleranceClass.COARSE) == 0.4
    # >6 mm radius -> ±1.0 for fine/medium, ±2.0 for coarse
    assert get_broken_edge_tolerance(12.0, ToleranceClass.MEDIUM) == 1.0
    assert get_broken_edge_tolerance(12.0, ToleranceClass.VERY_COARSE) == 2.0


def test_angular_dimensions_tolerances():
    # Shorter leg 5 mm -> ±1° (60 arcmin)
    arcmin, deg = get_angular_tolerance(5.0, ToleranceClass.MEDIUM)
    assert arcmin == 60.0
    assert deg == 1.0

    # Shorter leg 80 mm -> ±20 arcmin (0.3333°)
    arcmin_80, deg_80 = get_angular_tolerance(80.0, ToleranceClass.FINE)
    assert arcmin_80 == 20.0
    assert round(deg_80, 2) == 0.33


def test_verify_tolerance_fit_evaluation():
    # Nominal 50 mm shaft with ±0.15 mm drawing tolerance vs ISO 2768-m (which is ±0.3 mm)
    fit_result = verify_tolerance_fit(
        nominal_dim_mm=50.0,
        tolerance_mm=0.15,
        target_class=ToleranceClass.MEDIUM,
    )
    assert fit_result["is_within_iso"] is True
    assert fit_result["is_tighter_than_iso"] is True
    assert fit_result["precision_ratio"] == 0.5
    assert fit_result["classification"] == "tight_machined"
