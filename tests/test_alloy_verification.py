"""Unit tests for Alloy Registry and OES chemical assay verification."""

import pytest
from dfn_discovery.alloy_registry import (
    AlloyGrade,
    AlloyFamily,
    get_alloy_specification,
    verify_alloy_composition,
    ALLOY_CATALOG,
)


def test_alloy_catalog_completeness():
    assert len(ALLOY_CATALOG) >= 12
    # Verify density and strengths are positive physical values
    for grade, spec in ALLOY_CATALOG.items():
        assert spec.density_g_cm3 > 2.0
        assert spec.tensile_strength_mpa > 100.0
        assert spec.yield_strength_mpa > 50.0
        assert spec.machinability_index > 0.1
        assert spec.base_material_cost_ngn_kg > 1000.0


def test_alloy_alias_resolution():
    assert get_alloy_specification("6061-t6") is not None
    assert get_alloy_specification("6061") == ALLOY_CATALOG[AlloyGrade.AL_6061_T6]
    assert get_alloy_specification("EN8") == ALLOY_CATALOG[AlloyGrade.STEEL_EN8_1045]
    assert get_alloy_specification("304") == ALLOY_CATALOG[AlloyGrade.STAINLESS_304]
    assert get_alloy_specification("Brass") == ALLOY_CATALOG[AlloyGrade.BRASS_C36000]
    assert get_alloy_specification("UnknownAlloy99") is None


def test_oes_chemical_assay_conforming_6061():
    # Valid 6061-T6 assay
    assay = {
        "Mg": 0.95,
        "Si": 0.58,
        "Fe": 0.30,
        "Cu": 0.25,
        "Cr": 0.15,
        "Al": 97.5,
    }
    result = verify_alloy_composition(AlloyGrade.AL_6061_T6, assay)
    assert result["verified"] is True
    assert result["verification_status"] == "CERTIFIED_CONFORMING"
    assert result["integrity_score"] == 1.0
    assert len(result["element_deviations"]) == 0


def test_oes_chemical_assay_interception_scrapped_metal():
    # Attempting to pass soft low-magnesium alloy as structural 6061-T6
    compromised_assay = {
        "Mg": 0.15,  # Too low (nominal 0.80 - 1.20)
        "Si": 0.10,  # Too low
        "Fe": 1.20,  # High iron contamination
        "Cu": 0.02,
        "Al": 98.2,
    }
    result = verify_alloy_composition(AlloyGrade.AL_6061_T6, compromised_assay)
    assert result["verified"] is False
    assert result["verification_status"] == "COMPOSITION_REJECTED"
    assert "Mg" in result["element_deviations"]
    assert "Fe" in result["element_deviations"]
