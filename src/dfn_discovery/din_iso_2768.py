"""DIN ISO 2768 General Tolerance Tables and Validation Engine.

Implements DIN ISO 2768-1 (General tolerances for linear and angular dimensions)
and verification algorithms for machining low-volume hardware.
"""

from enum import Enum
from typing import Any, Dict, NamedTuple, Optional, Tuple


class ToleranceClass(str, Enum):
    FINE = "f"
    MEDIUM = "m"
    COARSE = "c"
    VERY_COARSE = "v"


class LinearToleranceRange(NamedTuple):
    min_dim: float
    max_dim: float
    fine: float
    medium: float
    coarse: float
    very_coarse: float


class AngularToleranceRange(NamedTuple):
    min_length_mm: float
    max_length_mm: float
    fine_arcmin: float
    medium_arcmin: float
    coarse_arcmin: float
    very_coarse_arcmin: float


# DIN ISO 2768-1 Table 1: Permissible deviations for linear dimensions (except broken edges)
LINEAR_TOLERANCE_TABLE = [
    LinearToleranceRange(0.5, 3.0, 0.05, 0.1, 0.2, 0.5),
    LinearToleranceRange(3.0, 6.0, 0.05, 0.1, 0.3, 0.5),
    LinearToleranceRange(6.0, 30.0, 0.1, 0.2, 0.5, 1.0),
    LinearToleranceRange(30.0, 120.0, 0.15, 0.3, 0.8, 1.5),
    LinearToleranceRange(120.0, 400.0, 0.2, 0.5, 1.2, 2.5),
    LinearToleranceRange(400.0, 1000.0, 0.3, 0.8, 2.0, 4.0),
    LinearToleranceRange(1000.0, 2000.0, 0.5, 1.2, 3.0, 6.0),
    LinearToleranceRange(2000.0, 4000.0, 0.8, 2.0, 4.0, 8.0),
]

# DIN ISO 2768-1 Table 2: Permissible deviations for broken edges (external radii and chamfer heights)
BROKEN_EDGE_TABLE = [
    (0.5, 3.0, 0.2, 0.2, 0.4, 0.4),
    (3.0, 6.0, 0.5, 0.5, 1.0, 1.0),
    (6.0, 4000.0, 1.0, 1.0, 2.0, 2.0),
]

# DIN ISO 2768-1 Table 3: Permissible deviations for angular dimensions (in degrees and arcminutes)
ANGULAR_TOLERANCE_TABLE = [
    AngularToleranceRange(0.0, 10.0, 60.0, 60.0, 90.0, 180.0),       # ±1° (60'), ±1°30' (90'), ±3° (180')
    AngularToleranceRange(10.0, 50.0, 30.0, 30.0, 60.0, 120.0),     # ±30', ±1° (60'), ±2° (120')
    AngularToleranceRange(50.0, 120.0, 20.0, 20.0, 30.0, 60.0),     # ±20', ±30', ±1° (60')
    AngularToleranceRange(120.0, 400.0, 10.0, 10.0, 15.0, 30.0),    # ±10', ±15', ±30'
    AngularToleranceRange(400.0, 4000.0, 5.0, 5.0, 10.0, 20.0),     # ±5', ±10', ±20'
]


def get_linear_tolerance(nominal_dim_mm: float, tolerance_class: ToleranceClass) -> float:
    """Retrieve DIN ISO 2768-1 permissible linear deviation (±mm)."""
    abs_dim = abs(nominal_dim_mm)
    if abs_dim < 0.5:
        # Below 0.5 mm, individual tolerance indications are mandatory
        return 0.05 if tolerance_class == ToleranceClass.FINE else 0.1

    for row in LINEAR_TOLERANCE_TABLE:
        if row.min_dim <= abs_dim <= row.max_dim:
            if tolerance_class == ToleranceClass.FINE:
                return row.fine
            elif tolerance_class == ToleranceClass.MEDIUM:
                return row.medium
            elif tolerance_class == ToleranceClass.COARSE:
                return row.coarse
            else:
                return row.very_coarse

    # Fallback for dimensions > 4000 mm
    scale_factor = abs_dim / 4000.0
    base_tol = 0.8 if tolerance_class == ToleranceClass.FINE else (
        2.0 if tolerance_class == ToleranceClass.MEDIUM else (
            4.0 if tolerance_class == ToleranceClass.COARSE else 8.0
        )
    )
    return round(base_tol * (scale_factor ** 0.5), 3)


def get_broken_edge_tolerance(nominal_dim_mm: float, tolerance_class: ToleranceClass) -> float:
    """Retrieve DIN ISO 2768-1 permissible deviation for external radii & chamfers (±mm)."""
    abs_dim = abs(nominal_dim_mm)
    for min_d, max_d, f_tol, m_tol, c_tol, v_tol in BROKEN_EDGE_TABLE:
        if min_d <= abs_dim <= max_d:
            if tolerance_class in (ToleranceClass.FINE, ToleranceClass.MEDIUM):
                return f_tol
            else:
                return c_tol
    return 2.0


def get_angular_tolerance(shorter_leg_length_mm: float, tolerance_class: ToleranceClass) -> Tuple[float, float]:
    """Retrieve DIN ISO 2768-1 angular deviation as (arcminutes, decimal_degrees)."""
    length = abs(shorter_leg_length_mm)
    for row in ANGULAR_TOLERANCE_TABLE:
        if row.min_length_mm <= length <= row.max_length_mm:
            if tolerance_class in (ToleranceClass.FINE, ToleranceClass.MEDIUM):
                arcmin = row.fine_arcmin
            elif tolerance_class == ToleranceClass.COARSE:
                arcmin = row.coarse_arcmin
            else:
                arcmin = row.very_coarse_arcmin
            return arcmin, round(arcmin / 60.0, 4)

    return 5.0, round(5.0 / 60.0, 4)


def verify_tolerance_fit(
    nominal_dim_mm: float,
    tolerance_mm: float,
    target_class: ToleranceClass = ToleranceClass.MEDIUM
) -> Dict[str, object]:
    """Evaluate whether an explicit drawing tolerance meets or exceeds DIN ISO 2768 class.
    
    Actively references and evaluates tolerance_mm against the standard table.
    """
    iso_allowance = get_linear_tolerance(nominal_dim_mm, target_class)
    # Check if drawing tolerance is tighter or looser than ISO 2768 standard
    is_tighter = tolerance_mm < iso_allowance
    is_within_iso = tolerance_mm <= iso_allowance
    precision_ratio = tolerance_mm / iso_allowance if iso_allowance > 0 else 1.0

    classification = "standard"
    if precision_ratio < 0.5:
        classification = "precision_ground_or_lapped"
    elif precision_ratio < 0.8:
        classification = "tight_machined"
    elif precision_ratio <= 1.2:
        classification = "standard_iso_match"
    else:
        classification = "loose_commercial"

    return {
        "nominal_dim_mm": nominal_dim_mm,
        "tolerance_mm": tolerance_mm,
        "iso_standard_allowance_mm": iso_allowance,
        "is_within_iso": is_within_iso,
        "is_tighter_than_iso": is_tighter,
        "precision_ratio": round(precision_ratio, 4),
        "target_class": target_class.value,
        "classification": classification,
    }


def ingest_prism_tolerance_report(prism_report: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Ingest tolerance and feature extraction payload from dfn-prism.
    
    Parses extracted geometric tolerances, DFM alerts, and ISO classes emitted by Prism.
    """
    if not prism_report:
        return {
            "has_prism_data": False,
            "detected_tolerance_class": ToleranceClass.MEDIUM.value,
            "detected_class_name": "medium",
            "tight_features": [],
            "dfm_warnings": [],
        }

    analysis = prism_report.get("analysis", {})
    dfm = prism_report.get("dfm", {})
    meta = prism_report.get("metadata", {})
    tol_analysis = prism_report.get("tolerance_analysis") or meta.get("tolerance_analysis", {})

    raw_class = str(
        prism_report.get("tolerance_class")
        or meta.get("tolerance_class")
        or tol_analysis.get("tolerance_class")
        or analysis.get("tolerance_class", "medium")
    ).lower().strip()
    class_map = {
        "f": ToleranceClass.FINE,
        "fine": ToleranceClass.FINE,
        "m": ToleranceClass.MEDIUM,
        "medium": ToleranceClass.MEDIUM,
        "c": ToleranceClass.COARSE,
        "coarse": ToleranceClass.COARSE,
        "v": ToleranceClass.VERY_COARSE,
        "very_coarse": ToleranceClass.VERY_COARSE,
    }
    detected_class = class_map.get(raw_class, ToleranceClass.MEDIUM)

    tight_features = (
        dfm.get("tight_tolerances")
        or tol_analysis.get("tight_tolerance_features")
        or []
    )
    dfm_warnings = (
        dfm.get("warnings")
        or tol_analysis.get("dfm_warnings")
        or []
    )

    return {
        "has_prism_data": True,
        "detected_tolerance_class": detected_class.value,
        "detected_class_code": detected_class.value,
        "detected_class_name": detected_class.name.lower(),
        "tight_features": tight_features,
        "dfm_warnings": dfm_warnings,
        "min_internal_bend_radius_mm": dfm.get("min_bend_radius_mm"),
        "max_pocket_depth_ratio": dfm.get("max_pocket_depth_ratio"),
    }
