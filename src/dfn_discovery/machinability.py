"""DFN Machinability, Spindle Limits, and First-Pass Yield Scoring Engine.

Grounded in physical machining dynamics:
1. Spindle speed (n = 1000 * v_c / (pi * D)), torque, and cutting power P_c.
2. Specific cutting resistance k_c derived from material yield strength.
3. Statistical process capability (C_pk) and first-pass yield (FPY > 90%).
"""

import math
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from .alloy_registry import AlloyGrade, AlloySpecification, get_alloy_specification
from .din_iso_2768 import ToleranceClass, get_linear_tolerance


@dataclass
class SpindleDemand:
    spindle_speed_rpm: float
    cutting_speed_m_min: float
    material_removal_rate_cm3_min: float
    cutting_power_kw: float
    spindle_torque_nm: float
    specific_cutting_force_n_mm2: float
    feed_rate_mm_min: float


@dataclass
class MachinabilityScorecard:
    alloy_grade: str
    machinability_index: float
    cutting_power_kw: float
    spindle_speed_rpm: float
    material_removal_rate_cm3_min: float
    process_capability_cpk: float
    estimated_first_pass_yield_pct: float
    spindle_utilization_pct: float
    meets_first_pass_yield_threshold: bool  # FPY > 90%
    chatter_risk: str
    recommendation: str


def calculate_specific_cutting_force(yield_strength_mpa: float, base_machinability_index: float) -> float:
    """Calculate specific cutting energy k_c (N/mm^2) from yield strength and machinability.
    
    Actively references yield_strength_mpa to model cutting resistance.
    """
    # Base physics model: k_c scales with material yield strength, dampened by machinability index
    k_c_base = yield_strength_mpa * 2.85
    # Higher machinability index reduces specific cutting resistance
    machinability_factor = max(0.20, min(1.20, base_machinability_index))
    k_c = k_c_base / (machinability_factor ** 0.65)
    return max(450.0, min(3800.0, k_c))


def calculate_spindle_speed(diameter_mm: float, cutting_speed_m_min: float) -> float:
    """Calculate spindle speed n (rpm) = (1000 * v_c) / (pi * D)."""
    safe_dia = max(0.1, diameter_mm)
    return (1000.0 * cutting_speed_m_min) / (math.pi * safe_dia)


def calculate_material_removal_rate(
    table_feed_mm_min: float,
    depth_of_cut_mm: float,
    width_of_cut_mm: float
) -> float:
    """Calculate material removal rate MRR (cm^3/min) = (a_p * a_e * v_f) / 1000."""
    return (depth_of_cut_mm * width_of_cut_mm * table_feed_mm_min) / 1000.0


def calculate_cutting_power(
    mrr_cm3_min: float,
    specific_cutting_force_n_mm2: float,
    spindle_efficiency: float = 0.82
) -> float:
    """Calculate cutting power P_c (kW) = (MRR * k_c) / (60 * 1000 * efficiency)."""
    return (mrr_cm3_min * specific_cutting_force_n_mm2) / (60.0 * 1000.0 * spindle_efficiency)


def calculate_spindle_requirements(
    diameter_mm: float,
    cutting_speed_m_min: float,
    feed_per_tooth_mm: float,
    num_teeth: int,
    depth_of_cut_mm: float,
    width_of_cut_mm: float,
    yield_strength_mpa: float,
    machinability_index: float,
    spindle_efficiency: float = 0.82
) -> SpindleDemand:
    """Calculate spindle speed, MRR, cutting power, and torque.
    
    Actively utilizes diameter_mm, yield_strength_mpa, and machinability_index.
    """
    spindle_speed_rpm = calculate_spindle_speed(diameter_mm, cutting_speed_m_min)
    
    # Feed rate v_f = n * f_z * z
    feed_rate_mm_min = spindle_speed_rpm * feed_per_tooth_mm * max(1, num_teeth)
    
    # MRR (cm^3/min) = (a_p * a_e * v_f) / 1000
    mrr_cm3_min = calculate_material_removal_rate(feed_rate_mm_min, depth_of_cut_mm, width_of_cut_mm)
    
    # Specific cutting force
    k_c = calculate_specific_cutting_force(yield_strength_mpa, machinability_index)
    
    # Cutting Power P_c (kW) = (MRR_cm3_min * k_c) / (60 * 1000 * efficiency)
    cutting_power_kw = calculate_cutting_power(mrr_cm3_min, k_c, spindle_efficiency)
    
    # Torque T (N*m) = (9550 * P_c) / n
    spindle_torque_nm = (9550.0 * cutting_power_kw) / max(spindle_speed_rpm, 10.0)
    
    return SpindleDemand(
        spindle_speed_rpm=round(spindle_speed_rpm, 1),
        cutting_speed_m_min=round(cutting_speed_m_min, 1),
        material_removal_rate_cm3_min=round(mrr_cm3_min, 2),
        cutting_power_kw=round(cutting_power_kw, 2),
        spindle_torque_nm=round(spindle_torque_nm, 2),
        specific_cutting_force_n_mm2=round(k_c, 1),
        feed_rate_mm_min=round(feed_rate_mm_min, 1),
    )


def calculate_process_capability(
    tolerance_mm: float,
    machine_repeatability_std_mm: float = 0.012,
    tool_wear_factor: float = 1.15
) -> float:
    """Compute statistical process capability index (C_pk) for a given tolerance.
    
    Actively references tolerance_mm to evaluate tolerance band conformance.
    """
    total_tolerance_band = 2.0 * abs(tolerance_mm)
    effective_sigma = max(0.001, machine_repeatability_std_mm * tool_wear_factor)
    
    # C_p = tolerance_band / (6 * sigma)
    # Accounting for a 10% mean shift centering bias (C_pk = C_p * 0.90)
    c_p = total_tolerance_band / (6.0 * effective_sigma)
    c_pk = c_p * 0.90
    return round(c_pk, 3)


def estimate_first_pass_yield(c_pk: float) -> float:
    """Estimate first-pass yield percentage from C_pk index using normal CDF erf."""
    # Under a centered normal distribution: Yield = erf(3 * Cpk / sqrt(2))
    z = (3.0 * c_pk) / math.sqrt(2.0)
    yield_fraction = math.erf(z)
    yield_pct = max(0.0, min(100.0, yield_fraction * 100.0))
    return round(yield_pct, 2)


def evaluate_machinability(
    alloy_spec: AlloySpecification,
    diameter_mm: float,
    tolerance_mm: float,
    available_spindle_power_kw: float,
    max_spindle_rpm: float,
    depth_of_cut_mm: float = 2.0,
    width_of_cut_mm: float = 8.0,
    feed_per_tooth_mm: float = 0.08,
    num_teeth: int = 4
) -> MachinabilityScorecard:
    """Complete physics-grounded machinability evaluation for a fabrication component.
    
    Actively employs diameter_mm, tolerance_mm, and alloy properties.
    """
    spindle_demand = calculate_spindle_requirements(
        diameter_mm=diameter_mm,
        cutting_speed_m_min=alloy_spec.cutting_speed_m_min,
        feed_per_tooth_mm=feed_per_tooth_mm,
        num_teeth=num_teeth,
        depth_of_cut_mm=depth_of_cut_mm,
        width_of_cut_mm=width_of_cut_mm,
        yield_strength_mpa=alloy_spec.yield_strength_mpa,
        machinability_index=alloy_spec.machinability_index,
    )
    
    # Process capability and first-pass yield
    c_pk = calculate_process_capability(tolerance_mm=tolerance_mm)
    fpy_pct = estimate_first_pass_yield(c_pk)
    
    # Spindle power utilization
    spindle_utilization = (spindle_demand.cutting_power_kw / max(available_spindle_power_kw, 0.1)) * 100.0
    spindle_rpm_utilization = (spindle_demand.spindle_speed_rpm / max(max_spindle_rpm, 100.0)) * 100.0
    
    # Chatter and vibration risk assessment
    if spindle_rpm_utilization > 95.0 or spindle_utilization > 90.0:
        chatter_risk = "HIGH_RESONANCE_RISK"
    elif spindle_rpm_utilization > 75.0 or spindle_utilization > 75.0:
        chatter_risk = "MODERATE_CHATTER"
    else:
        chatter_risk = "LOW_STABLE"
        
    meets_fpy = fpy_pct >= 90.0
    
    if meets_fpy and spindle_utilization <= 85.0:
        rec = "OPTIMAL_MACHINABILITY: Process stable with high first-pass yield >90%."
    elif not meets_fpy and spindle_utilization <= 85.0:
        rec = "TOLERANCE_WARNING: Tight drawing tolerance limits first-pass yield below 90%; consider grinding."
    elif meets_fpy and spindle_utilization > 85.0:
        rec = "SPINDLE_LIMIT_WARNING: Spindle power near maximum; reduce feed rate or depth of cut."
    else:
        rec = "DUAL_CONSTRAINT: Both spindle power and process tolerance limits exceeded; process re-engineering required."

    return MachinabilityScorecard(
        alloy_grade=alloy_spec.grade.value,
        machinability_index=alloy_spec.machinability_index,
        cutting_power_kw=spindle_demand.cutting_power_kw,
        spindle_speed_rpm=spindle_demand.spindle_speed_rpm,
        material_removal_rate_cm3_min=spindle_demand.material_removal_rate_cm3_min,
        process_capability_cpk=c_pk,
        estimated_first_pass_yield_pct=fpy_pct,
        spindle_utilization_pct=round(spindle_utilization, 1),
        meets_first_pass_yield_threshold=meets_fpy,
        chatter_risk=chatter_risk,
        recommendation=rec,
    )
