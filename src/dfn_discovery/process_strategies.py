"""DFN Multi-Process Feasibility Strategy Architecture.

Implements pluggable process evaluators for the Nigerian manufacturing ecosystem:
1. SubtractiveMachiningStrategy: CNC milling/turning, spindle mechanics, MRR, Cpk.
2. SheetMetalFormingStrategy: Press-brake air bending, tonnage, V-die opening, K-factor.
3. FoundryCastingStrategy: Sand & die casting, melt furnace capacity, draft angles, pour weight.
4. StructuralWeldingStrategy: Arc/MIG/TIG welding, deposition rates, duty cycles.
5. AdditiveManufacturingStrategy: FDM/SLS build volume, layer deposition time.

Aligned with dfn-parametrics process-taxonomy.json.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
import math
from typing import Any, Dict, List, Optional, Tuple

from .alloy_registry import AlloySpecification
from .din_iso_2768 import ToleranceClass
from .machinability import (
    calculate_cutting_power,
    calculate_material_removal_rate,
    calculate_process_capability,
    calculate_specific_cutting_force,
    calculate_spindle_speed,
    estimate_first_pass_yield,
)


class ManufacturingProcessType(str, Enum):
    SUBTRACTIVE_CNC = "subtractive_cnc"
    SHEET_METAL_FORMING = "sheet_metal_forming"
    FOUNDRY_CASTING = "foundry_casting"
    STRUCTURAL_WELDING = "structural_welding"
    ADDITIVE_MANUFACTURING = "additive_manufacturing"


@dataclass
class ProcessEvaluationResult:
    process_type: ManufacturingProcessType
    is_feasible: bool
    process_capability_score: float  # Cpk or geometric feasibility score
    first_pass_yield_pct: float
    meets_yield_threshold: bool
    primary_metric_name: str
    primary_metric_value: float
    primary_metric_unit: str
    utilization_pct: float
    cycle_time_minutes: float
    setup_time_minutes: float
    energy_demand_kwh: float
    diagnostics: List[str]
    recommendations: List[str]


class ProcessFeasibilityStrategy(ABC):
    """Abstract base strategy for process-specific manufacturing feasibility evaluation."""

    @property
    @abstractmethod
    def process_type(self) -> ManufacturingProcessType:
        pass

    @abstractmethod
    def can_handle(self, process_id: str) -> bool:
        pass

    @abstractmethod
    def evaluate(
        self,
        length_mm: float,
        width_mm: float,
        height_mm: float,
        volume_cm3: float,
        tolerance_mm: float,
        alloy_spec: AlloySpecification,
        batch_size: int,
        process_params: Optional[Dict[str, Any]] = None,
    ) -> ProcessEvaluationResult:
        pass


# ---------------------------------------------------------------------------
# Strategy 1: Subtractive CNC Machining (Milling / Turning)
# ---------------------------------------------------------------------------
class SubtractiveMachiningStrategy(ProcessFeasibilityStrategy):
    """Evaluates CNC milling and turning processes against spindle and tool dynamics."""

    @property
    def process_type(self) -> ManufacturingProcessType:
        return ManufacturingProcessType.SUBTRACTIVE_CNC

    def can_handle(self, process_id: str) -> bool:
        p = (process_id or "").lower()
        return any(
            token in p
            for token in ("cnc", "mill", "lathe", "turn", "subtractive", "machining", "drill", "bore")
        )

    def evaluate(
        self,
        length_mm: float,
        width_mm: float,
        height_mm: float,
        volume_cm3: float,
        tolerance_mm: float,
        alloy_spec: AlloySpecification,
        batch_size: int,
        process_params: Optional[Dict[str, Any]] = None,
    ) -> ProcessEvaluationResult:
        params = process_params or {}
        largest_dim = max(length_mm, width_mm, height_mm)
        tool_diameter_mm = float(params.get("tool_diameter_mm", min(largest_dim * 0.25, 40.0)))
        available_power_kw = float(params.get("available_power_kw", 15.0))
        depth_of_cut_mm = float(params.get("depth_of_cut_mm", 2.0))
        width_of_cut_mm = float(params.get("width_of_cut_mm", 8.0))
        feed_per_tooth_mm = float(params.get("feed_per_tooth_mm", 0.08))
        num_teeth = int(params.get("num_teeth", 4))

        # 1. Spindle speed and cutting feed
        rpm = calculate_spindle_speed(tool_diameter_mm, alloy_spec.cutting_speed_m_min)
        table_feed = rpm * feed_per_tooth_mm * max(1, num_teeth)

        # 2. MRR and Cutting Power
        mrr = calculate_material_removal_rate(table_feed, depth_of_cut_mm, width_of_cut_mm)
        k_c = calculate_specific_cutting_force(alloy_spec.yield_strength_mpa, alloy_spec.machinability_index)
        power_kw = calculate_cutting_power(mrr, k_c)

        # 3. Process capability and yield
        c_pk = calculate_process_capability(tolerance_mm)
        fpy = estimate_first_pass_yield(c_pk)

        # 4. Cycle time from chip volume
        bounding_vol_cm3 = (length_mm * width_mm * height_mm) / 1000.0
        chip_vol_cm3 = max(1.0, bounding_vol_cm3 - volume_cm3)
        effective_mrr = max(4.0, 35.0 * alloy_spec.machinability_index)
        cutting_time_per_unit = chip_vol_cm3 / effective_mrr

        safe_batch = max(1, batch_size)
        setup_time = 35.0 / safe_batch
        total_cutting_time = cutting_time_per_unit * safe_batch
        energy_kwh = (power_kw * (total_cutting_time / 60.0)) * 1.25

        utilization = min(100.0, (power_kw / max(0.1, available_power_kw)) * 100.0)

        diagnostics: List[str] = []
        recommendations: List[str] = []

        if fpy < 90.0:
            diagnostics.append(f"Tolerance ±{tolerance_mm}mm yields {fpy}% FPY (below 90% target).")
            recommendations.append("Consider allocating secondary grinding or reaming pass.")
        if utilization > 85.0:
            diagnostics.append(f"Spindle power utilization ({utilization:.1f}%) exceeds 85% continuous rating.")
            recommendations.append("Reduce radial width of cut or depth of cut to prevent thermal tool wear.")

        return ProcessEvaluationResult(
            process_type=self.process_type,
            is_feasible=(fpy >= 75.0 and utilization <= 95.0),
            process_capability_score=c_pk,
            first_pass_yield_pct=fpy,
            meets_yield_threshold=(fpy >= 90.0),
            primary_metric_name="spindle_cutting_power",
            primary_metric_value=round(power_kw, 2),
            primary_metric_unit="kW",
            utilization_pct=round(utilization, 1),
            cycle_time_minutes=round(cutting_time_per_unit, 2),
            setup_time_minutes=round(setup_time, 1),
            energy_demand_kwh=round(energy_kwh, 2),
            diagnostics=diagnostics,
            recommendations=recommendations,
        )


# ---------------------------------------------------------------------------
# Strategy 2: Sheet Metal Forming (Bending / Shearing / Laser)
# ---------------------------------------------------------------------------
class SheetMetalFormingStrategy(ProcessFeasibilityStrategy):
    """Evaluates sheet metal bending and forming against press brake tonnage and tooling."""

    @property
    def process_type(self) -> ManufacturingProcessType:
        return ManufacturingProcessType.SHEET_METAL_FORMING

    def can_handle(self, process_id: str) -> bool:
        p = (process_id or "").lower()
        return any(
            token in p
            for token in ("sheet", "press_brake", "bend", "forming", "laser_cut", "shear", "punch")
        )

    def evaluate(
        self,
        length_mm: float,
        width_mm: float,
        height_mm: float,
        volume_cm3: float,
        tolerance_mm: float,
        alloy_spec: AlloySpecification,
        batch_size: int,
        process_params: Optional[Dict[str, Any]] = None,
    ) -> ProcessEvaluationResult:
        params = process_params or {}
        sheet_thickness_mm = float(params.get("sheet_thickness_mm", min(height_mm, 3.0)))
        v_die_opening_mm = float(params.get("v_die_opening_mm", max(12.0, sheet_thickness_mm * 8.0)))
        num_bends = int(params.get("num_bends", max(1, int(params.get("bend_count", 2)))))
        available_tonnage = float(params.get("available_tonnage", 100.0))

        # Air bending tonnage formula:
        # F (metric tons) = (1.42 * Rm * t^2 * L) / (1000 * V)
        # where Rm is tensile strength in N/mm2, t is thickness mm, L is bend length mm, V is die opening mm
        bend_length_mm = max(length_mm, width_mm)
        tensile_strength = alloy_spec.tensile_strength_mpa
        tonnage_required = (1.42 * tensile_strength * (sheet_thickness_mm ** 2) * bend_length_mm) / (1000.0 * v_die_opening_mm)

        # Blank physical mass and ergonomics check
        blank_mass_kg = (max(0.001, volume_cm3) * alloy_spec.density_g_cm3) / 1000.0

        # Minimum recommended inside bend radius to prevent outer fiber cracking
        min_inside_radius = v_die_opening_mm / 8.0
        min_flange_length = 0.7 * v_die_opening_mm

        # Cycle time: ~0.35 mins per bend stroke + handling
        cycle_time_mins = (num_bends * 0.35) + 0.5
        safe_batch = max(1, batch_size)
        setup_time_mins = 20.0 / safe_batch
        utilization = min(100.0, (tonnage_required / max(10.0, available_tonnage)) * 100.0)

        # Quality capability based on sheet thickness vs tolerance
        # Standard sheet metal press brake tolerance is approx ±0.25 mm per bend
        effective_sigma = 0.045 * math.sqrt(num_bends)
        c_pk = round(abs(tolerance_mm) / (3.0 * effective_sigma), 3)
        fpy = estimate_first_pass_yield(c_pk)

        # Energy demand: ~4.5 kW hydraulic motor run hours
        total_hours = ((cycle_time_mins * safe_batch) + 20.0) / 60.0
        energy_kwh = total_hours * 5.5

        diagnostics: List[str] = []
        recommendations: List[str] = []

        if utilization > 85.0:
            diagnostics.append(f"Required bend tonnage ({tonnage_required:.1f}T) exceeds 85% press brake capacity.")
            recommendations.append(f"Increase V-die opening from {v_die_opening_mm:.0f}mm to reduce bending force.")
        if blank_mass_kg > 20.0:
            diagnostics.append(f"Heavy sheet metal blank ({blank_mass_kg:.1f}kg) requires dual-operator handling.")
        if tolerance_mm < 0.20:
            diagnostics.append(f"Drawing tolerance ±{tolerance_mm}mm is tight for standard air-bending.")
            recommendations.append("Specify bottom-bending tooling or CNC backgauge calibration for ±0.15mm.")

        return ProcessEvaluationResult(
            process_type=self.process_type,
            is_feasible=(utilization <= 95.0 and fpy >= 80.0),
            process_capability_score=c_pk,
            first_pass_yield_pct=fpy,
            meets_yield_threshold=(fpy >= 90.0),
            primary_metric_name="press_brake_tonnage",
            primary_metric_value=round(tonnage_required, 1),
            primary_metric_unit="metric_tons",
            utilization_pct=round(utilization, 1),
            cycle_time_minutes=round(cycle_time_mins, 2),
            setup_time_minutes=round(setup_time_mins, 1),
            energy_demand_kwh=round(energy_kwh, 2),
            diagnostics=diagnostics,
            recommendations=recommendations,
        )


# ---------------------------------------------------------------------------
# Strategy 3: Foundry Casting (Sand & Die Casting)
# ---------------------------------------------------------------------------
class FoundryCastingStrategy(ProcessFeasibilityStrategy):
    """Evaluates foundry sand and die casting against melt furnace and flask envelopes."""

    @property
    def process_type(self) -> ManufacturingProcessType:
        return ManufacturingProcessType.FOUNDRY_CASTING

    def can_handle(self, process_id: str) -> bool:
        p = (process_id or "").lower()
        return any(
            token in p
            for token in ("cast", "casting", "foundry", "sand_cast", "die_cast", "melt", "furnace")
        )

    def evaluate(
        self,
        length_mm: float,
        width_mm: float,
        height_mm: float,
        volume_cm3: float,
        tolerance_mm: float,
        alloy_spec: AlloySpecification,
        batch_size: int,
        process_params: Optional[Dict[str, Any]] = None,
    ) -> ProcessEvaluationResult:
        params = process_params or {}
        furnace_capacity_kg = float(params.get("furnace_capacity_kg", 250.0))
        flask_length_mm = float(params.get("flask_length_mm", 800.0))
        flask_width_mm = float(params.get("flask_width_mm", 600.0))
        flask_height_mm = float(params.get("flask_height_mm", 400.0))

        # Net casting mass
        net_mass_kg = (max(0.1, volume_cm3) * alloy_spec.density_g_cm3) / 1000.0
        # Pour mass includes gating, runner, risers (~1.55x net part weight)
        pour_mass_kg = net_mass_kg * 1.55

        # Check flask envelope (part + minimum 60 mm sand cushion on each side)
        flask_fits = (
            (length_mm + 120.0 <= flask_length_mm) and
            (width_mm + 120.0 <= flask_width_mm) and
            (height_mm + 100.0 <= flask_height_mm)
        )

        furnace_utilization = (pour_mass_kg / max(1.0, furnace_capacity_kg)) * 100.0

        # Sand casting standard tolerance capability: typically ±0.8 to ±1.5 mm per ISO 8062-3 DGT
        effective_sigma = 0.22  # Sand casting dimensional variance
        c_pk = round(abs(tolerance_mm) / (3.0 * effective_sigma), 3)
        fpy = estimate_first_pass_yield(c_pk)

        # Mold cycle time: ~12 mins sand molding + 8 mins pour/shakeout per batch
        cycle_time_mins = 18.0 + (net_mass_kg * 0.4)
        safe_batch = max(1, batch_size)
        setup_time_mins = 60.0 / safe_batch  # Pattern setup and sand preparation

        # Energy demand: ~0.65 kWh per kg of molten steel/iron in induction furnace
        energy_kwh = pour_mass_kg * 0.65 * safe_batch

        diagnostics: List[str] = []
        recommendations: List[str] = []

        if not flask_fits:
            diagnostics.append(f"Part envelope ({length_mm}x{width_mm}x{height_mm}mm) exceeds sand flask size.")
            recommendations.append("Use pit molding or sectional core assembly for oversized castings.")
        if tolerance_mm < 0.50:
            diagnostics.append(f"Drawing tolerance ±{tolerance_mm}mm exceeds as-cast sand capability (ISO 8062).")
            recommendations.append("Add 3.0mm machining allowance on critical faces for secondary CNC skim pass.")
        if furnace_utilization > 90.0:
            diagnostics.append(f"Pour mass ({pour_mass_kg:.1f}kg) approaches furnace heat capacity limit.")

        return ProcessEvaluationResult(
            process_type=self.process_type,
            is_feasible=(flask_fits and furnace_utilization <= 95.0),
            process_capability_score=c_pk,
            first_pass_yield_pct=fpy,
            meets_yield_threshold=(fpy >= 85.0),
            primary_metric_name="pour_mass_kg",
            primary_metric_value=round(pour_mass_kg, 2),
            primary_metric_unit="kg",
            utilization_pct=round(furnace_utilization, 1),
            cycle_time_minutes=round(cycle_time_mins, 1),
            setup_time_minutes=round(setup_time_mins, 1),
            energy_demand_kwh=round(energy_kwh, 2),
            diagnostics=diagnostics,
            recommendations=recommendations,
        )


# ---------------------------------------------------------------------------
# Strategy 4: Structural Welding & Fabrication
# ---------------------------------------------------------------------------
class StructuralWeldingStrategy(ProcessFeasibilityStrategy):
    """Evaluates manual and robotic arc/MIG/TIG welding operations."""

    @property
    def process_type(self) -> ManufacturingProcessType:
        return ManufacturingProcessType.STRUCTURAL_WELDING

    def can_handle(self, process_id: str) -> bool:
        p = (process_id or "").lower()
        return any(
            token in p
            for token in ("weld", "welding", "mig", "tig", "arc", "weldment", "braze", "join")
        )

    def evaluate(
        self,
        length_mm: float,
        width_mm: float,
        height_mm: float,
        volume_cm3: float,
        tolerance_mm: float,
        alloy_spec: AlloySpecification,
        batch_size: int,
        process_params: Optional[Dict[str, Any]] = None,
    ) -> ProcessEvaluationResult:
        params = process_params or {}
        weld_length_mm = float(params.get("weld_length_mm", 2.0 * (length_mm + width_mm)))
        weld_throat_mm = float(params.get("weld_throat_mm", min(height_mm * 0.4, 6.0)))
        welder_amperage_rating = float(params.get("welder_amperage_rating", 300.0))

        # Check weldability of the alloy
        is_weldable = alloy_spec.weldable

        # Total weldment base metal mass check
        base_metal_mass_kg = (max(0.001, volume_cm3) * alloy_spec.density_g_cm3) / 1000.0

        # Deposition volume and wire demand
        # Cross sectional area of fillet weld ~ 0.5 * (throat * sqrt(2))^2 = throat^2
        weld_volume_cm3 = (weld_length_mm * (weld_throat_mm ** 2)) / 1000.0
        weld_metal_mass_kg = (weld_volume_cm3 * alloy_spec.density_g_cm3) / 1000.0

        # Deposition rate: ~1.8 kg/hr for MIG/GMAW, ~0.8 kg/hr for TIG/GTAW
        deposition_rate_kg_hr = 1.8
        arc_time_minutes = (weld_metal_mass_kg / deposition_rate_kg_hr) * 60.0
        # 40% operating factor (duty cycle, nozzle cleaning, repositioning)
        cycle_time_mins = arc_time_minutes / 0.40

        safe_batch = max(1, batch_size)
        setup_time_mins = 25.0 / safe_batch

        # Welding current demand: ~40A per mm of plate/throat thickness
        required_current_amps = min(350.0, weld_throat_mm * 42.0)
        current_utilization = (required_current_amps / max(50.0, welder_amperage_rating)) * 100.0

        # Welded assembly tolerance capability: typically ±1.0 to ±2.0 mm due to thermal shrinkage
        effective_sigma = 0.18
        c_pk = round(abs(tolerance_mm) / (3.0 * effective_sigma), 3)
        fpy = estimate_first_pass_yield(c_pk)

        # Energy consumption: (Volts * Amps * Hours) / 1000
        volts = 24.0
        arc_hours = (arc_time_minutes / 60.0) * safe_batch
        energy_kwh = (volts * required_current_amps * arc_hours) / 1000.0

        diagnostics: List[str] = []
        recommendations: List[str] = []

        if not is_weldable:
            diagnostics.append(f"Alloy {alloy_spec.common_name} is marked NON-WELDABLE (heat cracking risk).")
            recommendations.append("Switch to weldable grade (e.g. S235JR steel, 6082-T6, or 304 stainless).")
        if base_metal_mass_kg > 60.0:
            diagnostics.append(f"Heavy weldment structure ({base_metal_mass_kg:.1f}kg) requires mechanical positioner.")
        if tolerance_mm < 0.80:
            diagnostics.append(f"Tight tolerance ±{tolerance_mm}mm susceptible to weld thermal distortion.")
            recommendations.append("Use rigid clamping fixture, stitch welding sequence, or post-weld stress relief.")

        return ProcessEvaluationResult(
            process_type=self.process_type,
            is_feasible=(is_weldable and current_utilization <= 90.0),
            process_capability_score=c_pk,
            first_pass_yield_pct=fpy,
            meets_yield_threshold=(fpy >= 85.0),
            primary_metric_name="weld_deposition_mass",
            primary_metric_value=round(weld_metal_mass_kg, 3),
            primary_metric_unit="kg",
            utilization_pct=round(current_utilization, 1),
            cycle_time_minutes=round(cycle_time_mins, 1),
            setup_time_minutes=round(setup_time_mins, 1),
            energy_demand_kwh=round(energy_kwh, 2),
            diagnostics=diagnostics,
            recommendations=recommendations,
        )


# ---------------------------------------------------------------------------
# Strategy Registry & Dispatcher
# ---------------------------------------------------------------------------
ALL_STRATEGIES: List[ProcessFeasibilityStrategy] = [
    SubtractiveMachiningStrategy(),
    SheetMetalFormingStrategy(),
    FoundryCastingStrategy(),
    StructuralWeldingStrategy(),
]


def resolve_process_strategy(process_id: str) -> ProcessFeasibilityStrategy:
    """Resolve the appropriate manufacturing feasibility strategy for a given process.
    
    Defaults to SubtractiveMachiningStrategy if unspecified.
    """
    clean_id = (process_id or "").strip().lower()
    for strategy in ALL_STRATEGIES:
        if strategy.can_handle(clean_id):
            return strategy
    # Default fallback
    return ALL_STRATEGIES[0]
