"""DFN Alloy Registry and Material Assay Verification Engine.

Manages certified engineering metals, chemical composition standards,
hardness, tensile/yield properties, and OES (Optical Emission Spectrometry)
verification logic for Nigerian fabrication clusters.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Tuple


class AlloyFamily(str, Enum):
    ALUMINUM = "aluminum"
    CARBON_STEEL = "carbon_steel"
    ALLOY_STEEL = "alloy_steel"
    STAINLESS_STEEL = "stainless_steel"
    COPPER_BRASS = "copper_brass"
    CAST_IRON = "cast_iron"


class AlloyGrade(str, Enum):
    AL_6061_T6 = "6061_t6"
    AL_6063_T5 = "6063_t5"
    AL_6082_T6 = "6082_t6"
    AL_7075_T6 = "7075_t6"
    STEEL_MILD_S235 = "mild_steel_s235"
    STEEL_EN8_1045 = "en8_1045"
    STEEL_4140_CRMO = "alloy_steel_4140"
    STEEL_4340_NICRMO = "alloy_steel_4340"
    STAINLESS_304 = "stainless_304"
    STAINLESS_316L = "stainless_316l"
    BRASS_C36000 = "brass_c36000"
    BRONZE_PB1 = "phosphor_bronze_pb1"
    CAST_IRON_GG25 = "gray_iron_gg25"
    DUCTILE_IRON_GGG40 = "ductile_iron_ggg40"


@dataclass(frozen=True)
class AlloySpecification:
    grade: AlloyGrade
    family: AlloyFamily
    common_name: str
    density_g_cm3: float
    tensile_strength_mpa: float
    yield_strength_mpa: float
    hardness_hb: float
    machinability_index: float  # Base rating relative to free-cutting brass C36000 (1.00)
    base_material_cost_ngn_kg: float
    cutting_speed_m_min: float  # Recommended HSS/carbide cutting speed
    composition_nominal: Dict[str, Tuple[float, float]]  # Element -> (min_pct, max_pct)
    weldable: bool
    heat_treatable: bool


ALLOY_CATALOG: Dict[AlloyGrade, AlloySpecification] = {
    AlloyGrade.AL_6061_T6: AlloySpecification(
        grade=AlloyGrade.AL_6061_T6,
        family=AlloyFamily.ALUMINUM,
        common_name="6061-T6 Structural Aluminum",
        density_g_cm3=2.70,
        tensile_strength_mpa=310.0,
        yield_strength_mpa=276.0,
        hardness_hb=95.0,
        machinability_index=0.85,
        base_material_cost_ngn_kg=7500.0,
        cutting_speed_m_min=280.0,
        composition_nominal={
            "Mg": (0.80, 1.20),
            "Si": (0.40, 0.80),
            "Fe": (0.00, 0.70),
            "Cu": (0.15, 0.40),
            "Cr": (0.04, 0.35),
            "Al": (95.8, 98.6),
        },
        weldable=True,
        heat_treatable=True,
    ),
    AlloyGrade.AL_6063_T5: AlloySpecification(
        grade=AlloyGrade.AL_6063_T5,
        family=AlloyFamily.ALUMINUM,
        common_name="6063-T5 Architectural Extrusion",
        density_g_cm3=2.69,
        tensile_strength_mpa=185.0,
        yield_strength_mpa=145.0,
        hardness_hb=60.0,
        machinability_index=0.75,
        base_material_cost_ngn_kg=5800.0,
        cutting_speed_m_min=240.0,
        composition_nominal={
            "Mg": (0.45, 0.90),
            "Si": (0.20, 0.60),
            "Fe": (0.00, 0.35),
            "Al": (97.5, 99.3),
        },
        weldable=True,
        heat_treatable=False,
    ),
    AlloyGrade.AL_6082_T6: AlloySpecification(
        grade=AlloyGrade.AL_6082_T6,
        family=AlloyFamily.ALUMINUM,
        common_name="6082-T6 High-Strength Marine Alloy",
        density_g_cm3=2.70,
        tensile_strength_mpa=340.0,
        yield_strength_mpa=290.0,
        hardness_hb=100.0,
        machinability_index=0.82,
        base_material_cost_ngn_kg=8200.0,
        cutting_speed_m_min=260.0,
        composition_nominal={
            "Si": (0.70, 1.30),
            "Mg": (0.60, 1.20),
            "Mn": (0.40, 1.00),
            "Fe": (0.00, 0.50),
            "Al": (95.0, 98.3),
        },
        weldable=True,
        heat_treatable=True,
    ),
    AlloyGrade.AL_7075_T6: AlloySpecification(
        grade=AlloyGrade.AL_7075_T6,
        family=AlloyFamily.ALUMINUM,
        common_name="7075-T6 Aerospace Grade Aluminum",
        density_g_cm3=2.81,
        tensile_strength_mpa=570.0,
        yield_strength_mpa=505.0,
        hardness_hb=150.0,
        machinability_index=0.70,
        base_material_cost_ngn_kg=14500.0,
        cutting_speed_m_min=210.0,
        composition_nominal={
            "Zn": (5.10, 6.10),
            "Mg": (2.10, 2.90),
            "Cu": (1.20, 2.00),
            "Cr": (0.18, 0.28),
            "Al": (87.1, 91.4),
        },
        weldable=False,
        heat_treatable=True,
    ),
    AlloyGrade.STEEL_MILD_S235: AlloySpecification(
        grade=AlloyGrade.STEEL_MILD_S235,
        family=AlloyFamily.CARBON_STEEL,
        common_name="S235JR Structural Mild Steel",
        density_g_cm3=7.85,
        tensile_strength_mpa=410.0,
        yield_strength_mpa=235.0,
        hardness_hb=130.0,
        machinability_index=0.65,
        base_material_cost_ngn_kg=2400.0,
        cutting_speed_m_min=110.0,
        composition_nominal={
            "C": (0.05, 0.22),
            "Mn": (0.30, 1.40),
            "Si": (0.00, 0.40),
            "P": (0.00, 0.045),
            "S": (0.00, 0.045),
            "Fe": (97.5, 99.5),
        },
        weldable=True,
        heat_treatable=False,
    ),
    AlloyGrade.STEEL_EN8_1045: AlloySpecification(
        grade=AlloyGrade.STEEL_EN8_1045,
        family=AlloyFamily.CARBON_STEEL,
        common_name="EN8 / AISI 1045 Medium Carbon Shaft Steel",
        density_g_cm3=7.85,
        tensile_strength_mpa=650.0,
        yield_strength_mpa=450.0,
        hardness_hb=200.0,
        machinability_index=0.55,
        base_material_cost_ngn_kg=3200.0,
        cutting_speed_m_min=85.0,
        composition_nominal={
            "C": (0.40, 0.50),
            "Mn": (0.60, 0.90),
            "Si": (0.10, 0.35),
            "P": (0.00, 0.040),
            "S": (0.00, 0.040),
            "Fe": (98.0, 98.8),
        },
        weldable=False,
        heat_treatable=True,
    ),
    AlloyGrade.STEEL_4140_CRMO: AlloySpecification(
        grade=AlloyGrade.STEEL_4140_CRMO,
        family=AlloyFamily.ALLOY_STEEL,
        common_name="AISI 4140 Chrome-Moly High-Tensile Steel",
        density_g_cm3=7.85,
        tensile_strength_mpa=950.0,
        yield_strength_mpa=680.0,
        hardness_hb=280.0,
        machinability_index=0.45,
        base_material_cost_ngn_kg=5600.0,
        cutting_speed_m_min=65.0,
        composition_nominal={
            "C": (0.38, 0.43),
            "Cr": (0.80, 1.10),
            "Mn": (0.75, 1.00),
            "Mo": (0.15, 0.25),
            "Si": (0.15, 0.35),
            "Fe": (96.5, 97.7),
        },
        weldable=False,
        heat_treatable=True,
    ),
    AlloyGrade.STEEL_4340_NICRMO: AlloySpecification(
        grade=AlloyGrade.STEEL_4340_NICRMO,
        family=AlloyFamily.ALLOY_STEEL,
        common_name="AISI 4340 Heavy Duty Transmission Steel",
        density_g_cm3=7.85,
        tensile_strength_mpa=1100.0,
        yield_strength_mpa=850.0,
        hardness_hb=320.0,
        machinability_index=0.40,
        base_material_cost_ngn_kg=7800.0,
        cutting_speed_m_min=50.0,
        composition_nominal={
            "Ni": (1.65, 2.00),
            "Cr": (0.70, 0.90),
            "Mo": (0.20, 0.30),
            "C": (0.38, 0.43),
            "Mn": (0.60, 0.80),
            "Fe": (95.2, 96.4),
        },
        weldable=False,
        heat_treatable=True,
    ),
    AlloyGrade.STAINLESS_304: AlloySpecification(
        grade=AlloyGrade.STAINLESS_304,
        family=AlloyFamily.STAINLESS_STEEL,
        common_name="AISI 304 Food-Grade Stainless Steel",
        density_g_cm3=7.93,
        tensile_strength_mpa=550.0,
        yield_strength_mpa=240.0,
        hardness_hb=180.0,
        machinability_index=0.48,
        base_material_cost_ngn_kg=8500.0,
        cutting_speed_m_min=60.0,
        composition_nominal={
            "Cr": (17.5, 19.5),
            "Ni": (8.00, 10.5),
            "C": (0.00, 0.07),
            "Mn": (0.00, 2.00),
            "Si": (0.00, 1.00),
            "Fe": (66.5, 74.0),
        },
        weldable=True,
        heat_treatable=False,
    ),
    AlloyGrade.STAINLESS_316L: AlloySpecification(
        grade=AlloyGrade.STAINLESS_316L,
        family=AlloyFamily.STAINLESS_STEEL,
        common_name="AISI 316L Marine/Acid Resistant Stainless",
        density_g_cm3=8.00,
        tensile_strength_mpa=580.0,
        yield_strength_mpa=260.0,
        hardness_hb=190.0,
        machinability_index=0.45,
        base_material_cost_ngn_kg=11200.0,
        cutting_speed_m_min=55.0,
        composition_nominal={
            "Cr": (16.0, 18.0),
            "Ni": (10.0, 14.0),
            "Mo": (2.00, 3.00),
            "C": (0.00, 0.03),
            "Mn": (0.00, 2.00),
            "Fe": (61.5, 72.0),
        },
        weldable=True,
        heat_treatable=False,
    ),
    AlloyGrade.BRASS_C36000: AlloySpecification(
        grade=AlloyGrade.BRASS_C36000,
        family=AlloyFamily.COPPER_BRASS,
        common_name="C36000 Free-Cutting Brass",
        density_g_cm3=8.50,
        tensile_strength_mpa=400.0,
        yield_strength_mpa=180.0,
        hardness_hb=110.0,
        machinability_index=1.00,  # 100% benchmark
        base_material_cost_ngn_kg=9200.0,
        cutting_speed_m_min=220.0,
        composition_nominal={
            "Cu": (60.0, 63.0),
            "Pb": (2.50, 3.70),
            "Fe": (0.00, 0.35),
            "Zn": (33.0, 37.5),
        },
        weldable=False,
        heat_treatable=False,
    ),
    AlloyGrade.BRONZE_PB1: AlloySpecification(
        grade=AlloyGrade.BRONZE_PB1,
        family=AlloyFamily.COPPER_BRASS,
        common_name="PB1 Phosphor Bronze Bearing Alloy",
        density_g_cm3=8.80,
        tensile_strength_mpa=350.0,
        yield_strength_mpa=170.0,
        hardness_hb=100.0,
        machinability_index=0.60,
        base_material_cost_ngn_kg=12500.0,
        cutting_speed_m_min=90.0,
        composition_nominal={
            "Cu": (88.0, 90.5),
            "Sn": (9.50, 11.5),
            "P": (0.50, 1.20),
        },
        weldable=False,
        heat_treatable=False,
    ),
    AlloyGrade.CAST_IRON_GG25: AlloySpecification(
        grade=AlloyGrade.CAST_IRON_GG25,
        family=AlloyFamily.CAST_IRON,
        common_name="GG25 Flake Graphite Gray Cast Iron",
        density_g_cm3=7.20,
        tensile_strength_mpa=250.0,
        yield_strength_mpa=165.0,
        hardness_hb=210.0,
        machinability_index=0.75,
        base_material_cost_ngn_kg=1850.0,
        cutting_speed_m_min=95.0,
        composition_nominal={
            "C": (3.00, 3.40),
            "Si": (1.80, 2.30),
            "Mn": (0.60, 0.90),
            "P": (0.00, 0.20),
            "S": (0.00, 0.12),
            "Fe": (92.5, 94.5),
        },
        weldable=False,
        heat_treatable=False,
    ),
    AlloyGrade.DUCTILE_IRON_GGG40: AlloySpecification(
        grade=AlloyGrade.DUCTILE_IRON_GGG40,
        family=AlloyFamily.CAST_IRON,
        common_name="GGG40 Spheroidal Graphite Ductile Iron",
        density_g_cm3=7.10,
        tensile_strength_mpa=400.0,
        yield_strength_mpa=250.0,
        hardness_hb=150.0,
        machinability_index=0.70,
        base_material_cost_ngn_kg=2250.0,
        cutting_speed_m_min=105.0,
        composition_nominal={
            "C": (3.40, 3.85),
            "Si": (2.30, 2.90),
            "Mg": (0.03, 0.06),
            "Mn": (0.10, 0.30),
            "Fe": (92.5, 94.0),
        },
        weldable=False,
        heat_treatable=False,
    ),
}


def get_alloy_specification(grade_or_alias: str) -> Optional[AlloySpecification]:
    """Retrieve alloy specification from grade key or standardized alias."""
    norm = grade_or_alias.strip().lower().replace("-", "_").replace(" ", "_")
    # Exact lookup
    for grade, spec in ALLOY_CATALOG.items():
        if grade.value == norm or grade.name.lower() == norm:
            return spec

    # Alias matching
    alias_map = {
        "6061": AlloyGrade.AL_6061_T6,
        "6061_t6": AlloyGrade.AL_6061_T6,
        "6063": AlloyGrade.AL_6063_T5,
        "6063_t5": AlloyGrade.AL_6063_T5,
        "6082": AlloyGrade.AL_6082_T6,
        "7075": AlloyGrade.AL_7075_T6,
        "7075_t6": AlloyGrade.AL_7075_T6,
        "mild_steel": AlloyGrade.STEEL_MILD_S235,
        "s235": AlloyGrade.STEEL_MILD_S235,
        "en8": AlloyGrade.STEEL_EN8_1045,
        "1045": AlloyGrade.STEEL_EN8_1045,
        "4140": AlloyGrade.STEEL_4140_CRMO,
        "4340": AlloyGrade.STEEL_4340_NICRMO,
        "304": AlloyGrade.STAINLESS_304,
        "ss304": AlloyGrade.STAINLESS_304,
        "316l": AlloyGrade.STAINLESS_316L,
        "ss316l": AlloyGrade.STAINLESS_316L,
        "brass": AlloyGrade.BRASS_C36000,
        "c36000": AlloyGrade.BRASS_C36000,
        "bronze": AlloyGrade.BRONZE_PB1,
        "pb1": AlloyGrade.BRONZE_PB1,
        "gray_iron": AlloyGrade.CAST_IRON_GG25,
        "gg25": AlloyGrade.CAST_IRON_GG25,
        "ductile_iron": AlloyGrade.DUCTILE_IRON_GGG40,
        "ggg40": AlloyGrade.DUCTILE_IRON_GGG40,
    }

    matched_grade = alias_map.get(norm)
    if matched_grade:
        return ALLOY_CATALOG[matched_grade]
    return None


def verify_alloy_composition(
    target_grade: AlloyGrade,
    assay_percentages: Dict[str, float],
    allow_impurity_margin_pct: float = 0.05
) -> Dict[str, object]:
    """Verify an Optical Emission Spectrometry (OES) chemical assay against nominal bounds.
    
    Returns an audit report verifying conformance, identifying out-of-spec elements,
    and calculating chemical integrity score.
    """
    spec = ALLOY_CATALOG.get(target_grade)
    if not spec:
        return {
            "verified": False,
            "target_grade": target_grade.value if hasattr(target_grade, "value") else str(target_grade),
            "integrity_score": 0.0,
            "element_deviations": {},
            "status": "UNKNOWN_GRADE",
        }

    deviations: Dict[str, Dict[str, float]] = {}
    total_elements_checked = 0
    passed_elements = 0

    for element, (min_pct, max_pct) in spec.composition_nominal.items():
        total_elements_checked += 1
        measured = assay_percentages.get(element)

        if measured is None:
            # Missing critical alloying element
            deviations[element] = {
                "nominal_min": min_pct,
                "nominal_max": max_pct,
                "measured": -1.0,
                "deviation": round(min_pct, 3),
                "out_of_spec": True,
            }
            continue

        effective_min = max(0.0, min_pct * (1.0 - allow_impurity_margin_pct))
        effective_max = max_pct * (1.0 + allow_impurity_margin_pct)

        if measured < effective_min:
            deviations[element] = {
                "nominal_min": min_pct,
                "nominal_max": max_pct,
                "measured": measured,
                "deviation": round(min_pct - measured, 3),
                "out_of_spec": True,
            }
        elif measured > effective_max:
            deviations[element] = {
                "nominal_min": min_pct,
                "nominal_max": max_pct,
                "measured": measured,
                "deviation": round(measured - max_pct, 3),
                "out_of_spec": True,
            }
        else:
            passed_elements += 1

    integrity_score = round(passed_elements / max(total_elements_checked, 1), 3)
    is_conforming = (integrity_score >= 0.85) and (len(deviations) == 0)

    # Classify verification status
    if is_conforming:
        verification_status = "CERTIFIED_CONFORMING"
    elif integrity_score >= 0.70:
        verification_status = "SECONDARY_RETEST_REQUIRED"
    else:
        verification_status = "COMPOSITION_REJECTED"

    return {
        "verified": is_conforming,
        "target_grade": spec.grade.value,
        "common_name": spec.common_name,
        "integrity_score": integrity_score,
        "passed_elements": passed_elements,
        "total_elements_checked": total_elements_checked,
        "element_deviations": deviations,
        "verification_status": verification_status,
        "hardness_expected_hb": spec.hardness_hb,
        "yield_strength_expected_mpa": spec.yield_strength_mpa,
    }
