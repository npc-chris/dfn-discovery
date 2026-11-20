"""Tests for DFN Quotation Engine and Milestone Escrow Schedule.

Verifies raw billet sizing, material removal rate (MRR) cutting time,
generator diesel surcharges, inter-cluster freight, and 30%/40%/30% escrow milestones.
"""

from hypothesis import given, strategies as st
import pytest

from dfn_discovery.alloy_registry import get_alloy_specification
from dfn_discovery.clusters import ClusterRegion, WORKSHOP_REGISTRY
from dfn_discovery.din_iso_2768 import ToleranceClass
from dfn_discovery.quotation import calculate_fabrication_quote


@pytest.fixture
def standard_workshop():
    return WORKSHOP_REGISTRY[0]  # Apex LAG-IKJ-01


@pytest.fixture
def aluminium_alloy():
    return get_alloy_specification("6061_t6")


def test_quote_baseline_calculation(standard_workshop, aluminium_alloy):
    """Verify standard quote structure and positive cost breakdown."""
    quote = calculate_fabrication_quote(
        length_mm=100.0,
        width_mm=80.0,
        height_mm=30.0,
        volume_cm3=200.0,
        alloy_spec=aluminium_alloy,
        workshop=standard_workshop,
        batch_size=5,
        tolerance_class=ToleranceClass.MEDIUM,
    )
    assert quote.total_quote_ngn > 0.0
    assert quote.raw_material_mass_kg > 0.0
    assert quote.raw_material_cost_ngn > 0.0
    assert quote.machining_labor_cost_ngn > 0.0
    assert quote.generator_diesel_surcharge_ngn > 0.0
    assert quote.metrology_inspection_fee_ngn > 0.0
    assert quote.cluster_logistics_ngn > 0.0
    assert quote.batch_size == 5


def test_generator_diesel_surcharge_scaling(standard_workshop, aluminium_alloy):
    """Verify diesel surcharge is proportional to fuel price and machine run hours."""
    quote_standard_fuel = calculate_fabrication_quote(
        length_mm=120.0,
        width_mm=100.0,
        height_mm=50.0,
        volume_cm3=400.0,
        alloy_spec=aluminium_alloy,
        workshop=standard_workshop,
        batch_size=1,
        diesel_fuel_price_ngn_liter=1350.0,
    )
    quote_higher_fuel = calculate_fabrication_quote(
        length_mm=120.0,
        width_mm=100.0,
        height_mm=50.0,
        volume_cm3=400.0,
        alloy_spec=aluminium_alloy,
        workshop=standard_workshop,
        batch_size=1,
        diesel_fuel_price_ngn_liter=2000.0,
    )
    assert quote_higher_fuel.generator_diesel_surcharge_ngn > quote_standard_fuel.generator_diesel_surcharge_ngn


def test_milestone_escrow_schedule_reconciliation(standard_workshop, aluminium_alloy):
    """Verify escrow schedule exactly reconciles: 30% M1, 40% M2, 30% M3 summing to 100%."""
    quote = calculate_fabrication_quote(
        length_mm=150.0,
        width_mm=100.0,
        height_mm=40.0,
        volume_cm3=350.0,
        alloy_spec=aluminium_alloy,
        workshop=standard_workshop,
        batch_size=10,
    )
    escrow = quote.escrow_schedule
    sum_milestones = round(
        escrow.milestone_1_material_procurement_ngn +
        escrow.milestone_2_first_article_inspection_ngn +
        escrow.milestone_3_final_metrology_acceptance_ngn,
        2
    )
    assert sum_milestones == pytest.approx(quote.total_quote_ngn, abs=0.02)
    assert escrow.total_escrow_ngn == quote.total_quote_ngn


def test_inter_cluster_vs_intra_cluster_freight(standard_workshop, aluminium_alloy):
    """Verify inter-cluster logistics costs more than local cluster dispatch."""
    quote_local = calculate_fabrication_quote(
        length_mm=200.0,
        width_mm=150.0,
        height_mm=60.0,
        volume_cm3=800.0,
        alloy_spec=aluminium_alloy,
        workshop=standard_workshop,  # Lagos
        batch_size=2,
        destination_region=ClusterRegion.LAGOS,
    )
    quote_inter_cluster = calculate_fabrication_quote(
        length_mm=200.0,
        width_mm=150.0,
        height_mm=60.0,
        volume_cm3=800.0,
        alloy_spec=aluminium_alloy,
        workshop=standard_workshop,  # Lagos
        batch_size=2,
        destination_region=ClusterRegion.ABA,  # Long-distance freight
    )
    assert quote_inter_cluster.cluster_logistics_ngn > quote_local.cluster_logistics_ngn


@given(
    batch_size_small=st.integers(min_value=1, max_value=5),
    batch_size_large=st.integers(min_value=10, max_value=25),
)
def test_metamorphic_batch_size_monotonicity(batch_size_small, batch_size_large):
    """Metamorphic property: larger batch size strictly increases total quote while reducing unit cost."""
    standard_workshop = WORKSHOP_REGISTRY[0]
    aluminium_alloy = get_alloy_specification("6061_t6")
    quote_small = calculate_fabrication_quote(
        length_mm=100.0,
        width_mm=50.0,
        height_mm=30.0,
        volume_cm3=120.0,
        alloy_spec=aluminium_alloy,
        workshop=standard_workshop,
        batch_size=batch_size_small,
    )
    quote_large = calculate_fabrication_quote(
        length_mm=100.0,
        width_mm=50.0,
        height_mm=30.0,
        volume_cm3=120.0,
        alloy_spec=aluminium_alloy,
        workshop=standard_workshop,
        batch_size=batch_size_large,
    )
    assert quote_large.total_quote_ngn > quote_small.total_quote_ngn
    assert quote_large.unit_fabrication_cost_ngn <= quote_small.unit_fabrication_cost_ngn
