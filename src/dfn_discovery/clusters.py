"""DFN Nigerian Industrial Cluster Registry and Workshop Routing Engine.

Registers machine shops across Lagos, Aba, and Nnewi clusters with physical
machine boundaries: bed envelopes, spindle power/RPM, generator backup capacity,
and first-pass yield metrics.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Tuple

from .din_iso_2768 import ToleranceClass


class ClusterRegion(str, Enum):
    LAGOS = "lagos"
    ABA = "aba"
    NNEWI = "nnewi"
    KANO = "kano"
    KADUNA = "kaduna"
    IBADAN = "ibadan"
    ABUJA = "abuja"
    PORT_HARCOURT = "port_harcourt"
    BENIN = "benin"
    ENUGU = "enugu"


@dataclass(frozen=True)
class MachineSpecification:
    machine_id: str
    machine_type: str  # "cnc_vmc", "cnc_lathe", "manual_lathe", "universal_mill", "press_brake"
    bed_x_mm: float
    bed_y_mm: float
    bed_z_mm: float
    spindle_power_kw: float
    max_spindle_rpm: float
    spindle_taper: str  # "BT40", "BT50", "MT4", "A2-6"
    positional_accuracy_mm: float
    repeatability_std_mm: float
    num_axes: int


@dataclass(frozen=True)
class PowerResilienceProfile:
    has_dedicated_generator: bool
    generator_rating_kva: float
    has_automatic_transfer_switch: bool
    fuel_autonomy_hours: float
    average_grid_outage_hours_per_day: float
    power_reliability_score: float  # 0.0 - 1.0


@dataclass(frozen=True)
class WorkshopProfile:
    workshop_id: str
    name: str
    region: ClusterRegion
    cluster_zone: str  # e.g., "Ikeja Industrial Estate", "Ariaria Cluster", "Otolo Automotive Zone"
    machines: List[MachineSpecification]
    power_profile: PowerResilienceProfile
    supported_tolerance_class: ToleranceClass
    historical_first_pass_yield_pct: float
    hourly_rate_ngn: float
    certified_materials: List[str]
    has_calibrated_granite_plate: bool
    lead_time_days_baseline: int
    supported_processes: Optional[List[str]] = None


@dataclass
class WorkshopRoutingResult:
    workshop_id: str
    workshop_name: str
    region: ClusterRegion
    cluster_zone: str
    selected_machine_id: str
    overall_match_score: float  # 0.0 - 1.0
    spindle_power_margin_kw: float
    bed_utilization_pct: float
    power_resilience_rating: float
    estimated_yield_pct: float
    routing_reason: str


# Canonical Nigerian Cluster Workshop Registry
WORKSHOP_REGISTRY: List[WorkshopProfile] = [
    WorkshopProfile(
        workshop_id="LAG-IKJ-01",
        name="Apex Precision Engineering Ltd",
        region=ClusterRegion.LAGOS,
        cluster_zone="Ikeja Industrial Estate",
        machines=[
            MachineSpecification(
                machine_id="VMC-850",
                machine_type="cnc_vmc",
                bed_x_mm=850.0,
                bed_y_mm=500.0,
                bed_z_mm=550.0,
                spindle_power_kw=15.0,
                max_spindle_rpm=10000.0,
                spindle_taper="BT40",
                positional_accuracy_mm=0.008,
                repeatability_std_mm=0.005,
                num_axes=3,
            ),
            MachineSpecification(
                machine_id="LATHE-CK6140",
                machine_type="cnc_lathe",
                bed_x_mm=750.0,
                bed_y_mm=250.0,
                bed_z_mm=250.0,
                spindle_power_kw=7.5,
                max_spindle_rpm=3000.0,
                spindle_taper="A2-6",
                positional_accuracy_mm=0.010,
                repeatability_std_mm=0.006,
                num_axes=2,
            ),
        ],
        power_profile=PowerResilienceProfile(
            has_dedicated_generator=True,
            generator_rating_kva=120.0,
            has_automatic_transfer_switch=True,
            fuel_autonomy_hours=48.0,
            average_grid_outage_hours_per_day=6.5,
            power_reliability_score=0.98,
        ),
        supported_tolerance_class=ToleranceClass.FINE,
        historical_first_pass_yield_pct=94.5,
        hourly_rate_ngn=26000.0,
        certified_materials=["6061_t6", "7075_t6", "en8_1045", "alloy_steel_4140", "stainless_304", "mild_steel_s235"],
        has_calibrated_granite_plate=True,
        lead_time_days_baseline=5,
    ),
    WorkshopProfile(
        workshop_id="LAG-ILP-02",
        name="Kresta Tooling & Moulds Works",
        region=ClusterRegion.LAGOS,
        cluster_zone="Ilupeju Industrial Corridor",
        machines=[
            MachineSpecification(
                machine_id="VMC-1160",
                machine_type="cnc_vmc",
                bed_x_mm=1100.0,
                bed_y_mm=600.0,
                bed_z_mm=650.0,
                spindle_power_kw=18.5,
                max_spindle_rpm=8000.0,
                spindle_taper="BT50",
                positional_accuracy_mm=0.012,
                repeatability_std_mm=0.008,
                num_axes=4,
            ),
        ],
        power_profile=PowerResilienceProfile(
            has_dedicated_generator=True,
            generator_rating_kva=80.0,
            has_automatic_transfer_switch=True,
            fuel_autonomy_hours=36.0,
            average_grid_outage_hours_per_day=5.0,
            power_reliability_score=0.95,
        ),
        supported_tolerance_class=ToleranceClass.FINE,
        historical_first_pass_yield_pct=92.8,
        hourly_rate_ngn=24000.0,
        certified_materials=["alloy_steel_4140", "alloy_steel_4340", "stainless_316l", "en8_1045", "mild_steel_s235"],
        has_calibrated_granite_plate=True,
        lead_time_days_baseline=6,
    ),
    WorkshopProfile(
        workshop_id="ABA-ARI-01",
        name="Niger Metal Fabrication Guild",
        region=ClusterRegion.ABA,
        cluster_zone="Ariaria Machine Fabrication Cluster",
        machines=[
            MachineSpecification(
                machine_id="HEAVY-LATHE-3M",
                machine_type="manual_lathe",
                bed_x_mm=2500.0,
                bed_y_mm=600.0,
                bed_z_mm=600.0,
                spindle_power_kw=11.0,
                max_spindle_rpm=1800.0,
                spindle_taper="MT5",
                positional_accuracy_mm=0.040,
                repeatability_std_mm=0.025,
                num_axes=2,
            ),
            MachineSpecification(
                machine_id="PRESS-BRAKE-160T",
                machine_type="press_brake",
                bed_x_mm=3200.0,
                bed_y_mm=1200.0,
                bed_z_mm=800.0,
                spindle_power_kw=15.0,
                max_spindle_rpm=500.0,
                spindle_taper="CUSTOM",
                positional_accuracy_mm=0.050,
                repeatability_std_mm=0.030,
                num_axes=2,
            ),
        ],
        power_profile=PowerResilienceProfile(
            has_dedicated_generator=True,
            generator_rating_kva=65.0,
            has_automatic_transfer_switch=False,
            fuel_autonomy_hours=24.0,
            average_grid_outage_hours_per_day=12.0,
            power_reliability_score=0.88,
        ),
        supported_tolerance_class=ToleranceClass.COARSE,
        historical_first_pass_yield_pct=89.0,
        hourly_rate_ngn=14000.0,
        certified_materials=["mild_steel_s235", "gray_iron_gg25", "en8_1045"],
        has_calibrated_granite_plate=False,
        lead_time_days_baseline=8,
    ),
    WorkshopProfile(
        workshop_id="ABA-PHR-02",
        name="Chukwudi Heavy Agricultural Spares",
        region=ClusterRegion.ABA,
        cluster_zone="Port Harcourt Road Industrial Strip",
        machines=[
            MachineSpecification(
                machine_id="VMC-650",
                machine_type="cnc_vmc",
                bed_x_mm=650.0,
                bed_y_mm=450.0,
                bed_z_mm=450.0,
                spindle_power_kw=9.0,
                max_spindle_rpm=6000.0,
                spindle_taper="BT40",
                positional_accuracy_mm=0.020,
                repeatability_std_mm=0.012,
                num_axes=3,
            ),
        ],
        power_profile=PowerResilienceProfile(
            has_dedicated_generator=True,
            generator_rating_kva=50.0,
            has_automatic_transfer_switch=True,
            fuel_autonomy_hours=20.0,
            average_grid_outage_hours_per_day=10.0,
            power_reliability_score=0.85,
        ),
        supported_tolerance_class=ToleranceClass.MEDIUM,
        historical_first_pass_yield_pct=91.2,
        hourly_rate_ngn=18000.0,
        certified_materials=["mild_steel_s235", "stainless_304", "ductile_iron_ggg40"],
        has_calibrated_granite_plate=True,
        lead_time_days_baseline=7,
    ),
    WorkshopProfile(
        workshop_id="NNW-OTL-01",
        name="Innoson Automotive Component Machinists",
        region=ClusterRegion.NNEWI,
        cluster_zone="Otolo Automotive Precision Cluster",
        machines=[
            MachineSpecification(
                machine_id="CNC-DUAL-TURNING-CENTER",
                machine_type="cnc_lathe",
                bed_x_mm=1200.0,
                bed_y_mm=400.0,
                bed_z_mm=400.0,
                spindle_power_kw=22.0,
                max_spindle_rpm=4500.0,
                spindle_taper="A2-8",
                positional_accuracy_mm=0.008,
                repeatability_std_mm=0.005,
                num_axes=3,
            ),
            MachineSpecification(
                machine_id="VMC-1050-HEAVY",
                machine_type="cnc_vmc",
                bed_x_mm=1050.0,
                bed_y_mm=550.0,
                bed_z_mm=600.0,
                spindle_power_kw=18.5,
                max_spindle_rpm=8000.0,
                spindle_taper="BT50",
                positional_accuracy_mm=0.010,
                repeatability_std_mm=0.006,
                num_axes=4,
            ),
        ],
        power_profile=PowerResilienceProfile(
            has_dedicated_generator=True,
            generator_rating_kva=150.0,
            has_automatic_transfer_switch=True,
            fuel_autonomy_hours=72.0,
            average_grid_outage_hours_per_day=8.0,
            power_reliability_score=0.97,
        ),
        supported_tolerance_class=ToleranceClass.FINE,
        historical_first_pass_yield_pct=95.2,
        hourly_rate_ngn=25000.0,
        certified_materials=["alloy_steel_4140", "ductile_iron_ggg40", "en8_1045", "brass_c36000"],
        has_calibrated_granite_plate=True,
        lead_time_days_baseline=6,
    ),
    WorkshopProfile(
        workshop_id="NNW-NKW-02",
        name="Eastern Foundry & Shaft Turning Works",
        region=ClusterRegion.NNEWI,
        cluster_zone="Nkwo Nnewi Central Parts District",
        machines=[
            MachineSpecification(
                machine_id="TURNING-LATHE-1500",
                machine_type="manual_lathe",
                bed_x_mm=1500.0,
                bed_y_mm=350.0,
                bed_z_mm=350.0,
                spindle_power_kw=7.5,
                max_spindle_rpm=2000.0,
                spindle_taper="MT4",
                positional_accuracy_mm=0.030,
                repeatability_std_mm=0.018,
                num_axes=2,
            ),
        ],
        power_profile=PowerResilienceProfile(
            has_dedicated_generator=True,
            generator_rating_kva=40.0,
            has_automatic_transfer_switch=False,
            fuel_autonomy_hours=18.0,
            average_grid_outage_hours_per_day=9.5,
            power_reliability_score=0.82,
        ),
        supported_tolerance_class=ToleranceClass.MEDIUM,
        historical_first_pass_yield_pct=90.1,
        hourly_rate_ngn=16000.0,
        certified_materials=["ductile_iron_ggg40", "gray_iron_gg25", "mild_steel_s235"],
        has_calibrated_granite_plate=False,
        lead_time_days_baseline=8,
        supported_processes=["foundry_casting", "subtractive_cnc"],
    ),
    WorkshopProfile(
        workshop_id="KAN-BMP-01",
        name="Northern Precision Foundries & Machinists",
        region=ClusterRegion.KANO,
        cluster_zone="Bompai Industrial Area",
        machines=[
            MachineSpecification(
                machine_id="INDUCTION-FURNACE-500KG",
                machine_type="furnace",
                bed_x_mm=1200.0,
                bed_y_mm=1000.0,
                bed_z_mm=800.0,
                spindle_power_kw=30.0,
                max_spindle_rpm=1000.0,
                spindle_taper="CUSTOM",
                positional_accuracy_mm=0.040,
                repeatability_std_mm=0.025,
                num_axes=1,
            ),
            MachineSpecification(
                machine_id="HEAVY-TURNING-CW61100",
                machine_type="cnc_lathe",
                bed_x_mm=2000.0,
                bed_y_mm=500.0,
                bed_z_mm=500.0,
                spindle_power_kw=18.5,
                max_spindle_rpm=2200.0,
                spindle_taper="A2-11",
                positional_accuracy_mm=0.015,
                repeatability_std_mm=0.010,
                num_axes=2,
            ),
        ],
        power_profile=PowerResilienceProfile(
            has_dedicated_generator=True,
            generator_rating_kva=200.0,
            has_automatic_transfer_switch=True,
            fuel_autonomy_hours=48.0,
            average_grid_outage_hours_per_day=8.0,
            power_reliability_score=0.96,
        ),
        supported_tolerance_class=ToleranceClass.COARSE,
        historical_first_pass_yield_pct=92.5,
        hourly_rate_ngn=20000.0,
        certified_materials=["gray_iron_gg25", "ductile_iron_ggg40", "mild_steel_s235", "en8_1045"],
        has_calibrated_granite_plate=True,
        lead_time_days_baseline=7,
        supported_processes=["foundry_casting", "subtractive_cnc"],
    ),
    WorkshopProfile(
        workshop_id="KAD-KAK-01",
        name="Arewa Heavy Metal & Press Brake Works",
        region=ClusterRegion.KADUNA,
        cluster_zone="Kakuri Heavy Industrial Estate",
        machines=[
            MachineSpecification(
                machine_id="PRESS-BRAKE-250T",
                machine_type="press_brake",
                bed_x_mm=4000.0,
                bed_y_mm=1200.0,
                bed_z_mm=900.0,
                spindle_power_kw=22.0,
                max_spindle_rpm=500.0,
                spindle_taper="CUSTOM",
                positional_accuracy_mm=0.030,
                repeatability_std_mm=0.020,
                num_axes=2,
            ),
            MachineSpecification(
                machine_id="WELDING-GANTRY-MIG",
                machine_type="welding_bay",
                bed_x_mm=5000.0,
                bed_y_mm=2000.0,
                bed_z_mm=1500.0,
                spindle_power_kw=15.0,
                max_spindle_rpm=100.0,
                spindle_taper="CUSTOM",
                positional_accuracy_mm=0.050,
                repeatability_std_mm=0.030,
                num_axes=3,
            ),
        ],
        power_profile=PowerResilienceProfile(
            has_dedicated_generator=True,
            generator_rating_kva=160.0,
            has_automatic_transfer_switch=True,
            fuel_autonomy_hours=36.0,
            average_grid_outage_hours_per_day=7.0,
            power_reliability_score=0.94,
        ),
        supported_tolerance_class=ToleranceClass.MEDIUM,
        historical_first_pass_yield_pct=93.0,
        hourly_rate_ngn=22000.0,
        certified_materials=["mild_steel_s235", "stainless_304", "6061_t6"],
        has_calibrated_granite_plate=True,
        lead_time_days_baseline=6,
        supported_processes=["sheet_metal_forming", "structural_welding"],
    ),
    WorkshopProfile(
        workshop_id="PHC-TRA-01",
        name="Trans-Amadi Marine & Structural Yards",
        region=ClusterRegion.PORT_HARCOURT,
        cluster_zone="Trans-Amadi Industrial Layout",
        machines=[
            MachineSpecification(
                machine_id="HEAVY-MIG-TIG-STATION",
                machine_type="welding_bay",
                bed_x_mm=6000.0,
                bed_y_mm=2500.0,
                bed_z_mm=2000.0,
                spindle_power_kw=25.0,
                max_spindle_rpm=100.0,
                spindle_taper="CUSTOM",
                positional_accuracy_mm=0.040,
                repeatability_std_mm=0.025,
                num_axes=3,
            ),
        ],
        power_profile=PowerResilienceProfile(
            has_dedicated_generator=True,
            generator_rating_kva=250.0,
            has_automatic_transfer_switch=True,
            fuel_autonomy_hours=72.0,
            average_grid_outage_hours_per_day=5.5,
            power_reliability_score=0.98,
        ),
        supported_tolerance_class=ToleranceClass.MEDIUM,
        historical_first_pass_yield_pct=94.0,
        hourly_rate_ngn=28000.0,
        certified_materials=["mild_steel_s235", "stainless_316l", "stainless_304", "alloy_steel_4140"],
        has_calibrated_granite_plate=True,
        lead_time_days_baseline=7,
        supported_processes=["structural_welding"],
    ),
]


def route_job_to_workshops(
    length_mm: float,
    width_mm: float,
    height_mm: float,
    required_spindle_power_kw: float,
    required_spindle_rpm: float,
    tolerance_mm: float,
    material_grade: str,
    target_tolerance_class: ToleranceClass = ToleranceClass.MEDIUM,
    preferred_region: Optional[ClusterRegion] = None,
    min_first_pass_yield_pct: float = 90.0,
    min_generator_kva: float = 25.0,
    process_type: str = "subtractive_cnc",
) -> List[WorkshopRoutingResult]:
    """Filter and rank Nigerian workshops matching physical fabrication envelopes.
    
    Actively enforces:
    1. Bounding box <= machine bed envelope (length_mm, width_mm, height_mm).
    2. Spindle motor power >= required_spindle_power_kw.
    3. Spindle speed capability >= required_spindle_rpm.
    4. First-pass yield >= min_first_pass_yield_pct (strictly >90%).
    5. Power resilience: generator kVA >= min_generator_kva.
    """
    candidates: List[WorkshopRoutingResult] = []
    
    # 15 mm clamp / fixture clearance margin on each axis
    part_x = length_mm + 30.0
    part_y = width_mm + 30.0
    part_z = height_mm + 25.0

    tolerance_hierarchy = {
        ToleranceClass.FINE: 3,
        ToleranceClass.MEDIUM: 2,
        ToleranceClass.COARSE: 1,
        ToleranceClass.VERY_COARSE: 0,
    }
    required_level = tolerance_hierarchy.get(target_tolerance_class, 2)

    for workshop in WORKSHOP_REGISTRY:
        # Filter 1: Power resilience & generator backup check
        pp = workshop.power_profile
        if not pp.has_dedicated_generator or pp.generator_rating_kva < min_generator_kva:
            continue

        # Filter 2: Historical first-pass yield guardrail
        if workshop.historical_first_pass_yield_pct < min_first_pass_yield_pct:
            continue

        # Filter 3: Material certification capability
        if material_grade and workshop.certified_materials:
            clean_grade = material_grade.lower().replace("-", "_").replace(" ", "_")
            if not any(clean_grade in m.lower() or m.lower() in clean_grade for m in workshop.certified_materials):
                continue

        # Filter 4: Tolerance capability check
        shop_level = tolerance_hierarchy.get(workshop.supported_tolerance_class, 1)
        if shop_level < required_level:
            continue

        # Filter 5: Manufacturing process capability check
        if process_type and workshop.supported_processes:
            clean_proc = process_type.lower()
            if not any(clean_proc in p.lower() or p.lower() in clean_proc for p in workshop.supported_processes):
                continue

        # Find best fitting machine in workshop
        for machine in workshop.machines:
            # Check bed size envelope
            fits_bed = (
                (part_x <= machine.bed_x_mm and part_y <= machine.bed_y_mm and part_z <= machine.bed_z_mm) or
                # Or 90-degree bed rotation for symmetry
                (part_y <= machine.bed_x_mm and part_x <= machine.bed_y_mm and part_z <= machine.bed_z_mm)
            )
            if not fits_bed:
                continue

            # Check spindle requirements
            if machine.spindle_power_kw < required_spindle_power_kw:
                continue
            if machine.max_spindle_rpm < required_spindle_rpm:
                continue

            # Check machine accuracy vs tolerance_mm
            if machine.repeatability_std_mm * 3.0 > abs(tolerance_mm):
                continue

            # Compute match metrics
            power_margin = round(machine.spindle_power_kw - required_spindle_power_kw, 2)
            bed_vol = machine.bed_x_mm * machine.bed_y_mm * machine.bed_z_mm
            part_vol = max(1.0, length_mm * width_mm * height_mm)
            bed_utilization = round((part_vol / bed_vol) * 100.0, 2)

            # Composite ranking score:
            # - Machinability / Spindle reserve (30%)
            # - Historical First-Pass Yield (30%)
            # - Power Resilience (25%)
            # - Regional preference (15%)
            power_score = min(1.0, power_margin / 15.0) * 0.30
            yield_score = (workshop.historical_first_pass_yield_pct / 100.0) * 0.30
            resilience_score = pp.power_reliability_score * 0.25
            region_score = 0.15 if (preferred_region and workshop.region == preferred_region) else 0.08

            overall_score = round(power_score + yield_score + resilience_score + region_score, 3)

            reason = (
                f"Machine {machine.machine_id} in {workshop.cluster_zone} matches envelope with "
                f"{power_margin}kW spindle margin, {pp.generator_rating_kva}kVA generator backup, "
                f"certified for {material_grade} across {process_type}."
            )

            candidates.append(
                WorkshopRoutingResult(
                    workshop_id=workshop.workshop_id,
                    workshop_name=workshop.name,
                    region=workshop.region,
                    cluster_zone=workshop.cluster_zone,
                    selected_machine_id=machine.machine_id,
                    overall_match_score=overall_score,
                    spindle_power_margin_kw=power_margin,
                    bed_utilization_pct=bed_utilization,
                    power_resilience_rating=pp.power_reliability_score,
                    estimated_yield_pct=workshop.historical_first_pass_yield_pct,
                    routing_reason=reason,
                )
            )

    # Sort descending by match score
    candidates.sort(key=lambda r: r.overall_match_score, reverse=True)
    return candidates
