"""DFN Metrology, Quality Inspection & On-Site Rectification Test Suite.

Standards:
- ISO 2859-1: Sampling procedures for inspection by attributes (KAN-60)
- ISO 9001 Section 8.7: First-article lockout & non-conformance hold (KAN-39, KAN-43)
- ISO 1101: GD&T runout evaluation on V-blocks (KAN-42)
- ISO 10012: On-site mobile metrology rectification (KAN-53)
"""

import pytest
from hypothesis import given, strategies as st

from dfn_discovery.inspection import (
    BatchManifest,
    DtiRunoutAuditService,
    HubMeasurement,
    NcrGenerator,
    OnSiteRectificationDispatcher,
    ShopMeasurement,
    calculate_iso_sample_size,
    calculate_tool_wear_offset,
    evaluate_double_blind_audit,
    evaluate_first_article,
    generate_blind_manifest,
    select_pseudorandom_indices,
    verify_sacrificial_piece,
)


# ---------------------------------------------------------------------------
# KAN-60: Double-Blind Hub Inspection Sampling
# ---------------------------------------------------------------------------

def test_kan60_pilot_batch_sampling_and_blind_masking():
    """Verify pilot batch of 200 mounting brackets selects 5 units with masked shop readings."""
    manifest = BatchManifest(
        batch_id="BATCH-BRACKET-200",
        job_id="JOB-MOUNT-01",
        shop_id="SHOP-BENIN-01",
        total_quantity=200,
        is_pilot=True,
        seed=42,
        shop_measurements=[
            ShopMeasurement(
                part_index=i,
                dimension_name="bend_angle_deg",
                nominal_value=90.0,
                tolerance_upper=0.1,
                tolerance_lower=-0.1,
                measured_value=90.0,
            )
            for i in range(200)
        ],
    )

    blind_manifest = generate_blind_manifest(manifest)
    assert len(blind_manifest.sample_indices) == 5
    assert len(blind_manifest.sample_items) == 5

    # Enforce blind measurement entry masking shop values
    for item in blind_manifest.sample_items:
        assert item.nominal_value == 90.0
        assert not hasattr(item, "measured_value")


def test_kan60_acceptance_criteria_escrow_authorization():
    """Given 200 brackets with 90.0° shop reading, hub verification at 90.1° authorizes escrow."""
    manifest = BatchManifest(
        batch_id="BATCH-BRACKET-200",
        job_id="JOB-MOUNT-01",
        shop_id="SHOP-BENIN-01",
        total_quantity=200,
        is_pilot=True,
        shop_measurements=[
            ShopMeasurement(
                part_index=15,
                dimension_name="bend_angle_deg",
                nominal_value=90.0,
                tolerance_upper=0.1,
                tolerance_lower=-0.1,
                measured_value=90.0,
            )
        ],
    )

    hub_measurements = [
        HubMeasurement(
            part_index=15,
            dimension_name="bend_angle_deg",
            hub_measured_value=90.1,
        )
    ]

    report = evaluate_double_blind_audit(manifest, hub_measurements)
    assert report.verification_status == "PASSED"
    assert report.authorize_escrow_disbursement is True
    assert report.trust_score_impact > 0
    assert len(report.audit_seal_sha256) == 64


@given(
    lot_a=st.integers(min_value=10, max_value=200),
    lot_b=st.integers(min_value=201, max_value=1000),
)
def test_metamorphic_sampling_monotonicity(lot_a, lot_b):
    """Metamorphic Invariant: Larger batch sizes strictly require >= sample size."""
    size_a = calculate_iso_sample_size(lot_a)
    size_b = calculate_iso_sample_size(lot_b)
    assert size_b >= size_a


# ---------------------------------------------------------------------------
# KAN-39: First-Article Rejection & Lockout
# ---------------------------------------------------------------------------

def test_kan39_first_article_lockout_and_wear_offset():
    """Sunday logs 48.045 mm on lathe bushing; trips lockout with -0.022 mm tool offset."""
    res = evaluate_first_article(
        batch_id="BATCH-BUSHING-01",
        part_id="bushing-first-article",
        operator_id="Sunday",
        machine_id="CNC-LATHE-01",
        dimension_name="outer_diameter_mm",
        measured_value=48.045,
        nominal_value=48.000,
        tolerance_upper=0.025,
        tolerance_lower=0.0,
    )

    assert res.status == "FIRST_ARTICLE_REJECTED"
    assert res.batch_locked is True
    assert res.batch_progress_disabled is True
    assert res.lockout_reason == "FIRST ARTICLE REJECTED: BATCH LOCKED"
    assert res.recommended_wear_offset_mm == -0.022
    assert res.target_dimension_mm == 48.023


def test_kan39_sacrificial_piece_unlocks_production():
    """Passing measurement on sacrificial piece unlocks batch production."""
    evaluate_first_article(
        batch_id="BATCH-BUSHING-02",
        part_id="bushing-first-article",
        operator_id="Sunday",
        machine_id="CNC-LATHE-01",
        dimension_name="outer_diameter_mm",
        measured_value=48.045,
        nominal_value=48.000,
        tolerance_upper=0.025,
        tolerance_lower=0.0,
    )

    sacrificial_res = verify_sacrificial_piece(
        batch_id="BATCH-BUSHING-02",
        measured_value=48.015,
        nominal_value=48.000,
        tolerance_upper=0.025,
        tolerance_lower=0.0,
    )

    assert sacrificial_res.status == "UNLOCKED_SACRIFICIAL_PASSED"
    assert sacrificial_res.batch_locked is False
    assert sacrificial_res.batch_progress_disabled is False


# ---------------------------------------------------------------------------
# KAN-42: DTI Runout Audit
# ---------------------------------------------------------------------------

def test_kan42_dti_runout_acceptance_criteria():
    """Roller on V-blocks with 0.03 mm TIR on <= 0.05 mm spec passes with DTI-402 certificate."""
    service = DtiRunoutAuditService()
    record = service.audit_runout(
        part_id="roller-402",
        profile="cylindrical_roller",
        gdt_runout_spec_mm=0.05,
        measured_tir_mm=0.03,
        datums=["A", "B"],
        gauge_id="DTI-402",
        gauge_calibration_date="2026-06-01T00:00:00Z",
        audit_timestamp="2026-11-22T20:00:00Z",
    )

    assert record.status == "PASSED"
    assert record.can_progress_traveler is True
    assert record.is_within_gdt_limit is True
    assert record.gauge_id == "DTI-402"
    assert record.is_calibration_current is True


def test_kan42_expired_calibration_rejection():
    """Expired gauge calibration halts traveler progression."""
    service = DtiRunoutAuditService()
    record = service.audit_runout(
        part_id="roller-403",
        profile="cylindrical_roller",
        gdt_runout_spec_mm=0.05,
        measured_tir_mm=0.02,
        datums=["A", "B"],
        gauge_id="DTI-EXPIRED",
        gauge_calibration_date="2024-01-01T00:00:00Z",
        audit_timestamp="2026-11-22T20:00:00Z",
    )

    assert record.status == "REJECTED_CALIBRATION_EXPIRED"
    assert record.can_progress_traveler is False


# ---------------------------------------------------------------------------
# KAN-43: Non-Conformance Report (NCR) Generator
# ---------------------------------------------------------------------------

def test_kan43_clevis_ncr_acceptance_criteria():
    """Solar tracker clevis with 121.8 mm pitch trips HOLD_NCR and ₦12,500 offset rework."""
    generator = NcrGenerator()
    doc = generator.generate_ncr(
        job_traveler_id="TRV-CLEVIS-99",
        part_id="clevis-01",
        part_description="Solar Tracker Clevis",
        measured_dimension=121.8,
        nominal_dimension=120.0,
        tolerance_upper=0.05,
        tolerance_lower=-0.05,
        caliper_photo_url="https://fabnetwork.com.ng/qc/clevis.jpg",
        inspector_id="Inspector-01",
        customer_id="student_founder_team_01",
        supervisor_id="Dr. Balogun",
    )

    assert doc.status == "HOLD_NCR"
    assert doc.rework_package.cost_ngn == 12500.0
    assert doc.rework_package.currency == "NGN"
    assert doc.rework_package.option_code == "RWK-OFFSET-BUSHING-01"

    recipients = {n["recipient_id"] for n in doc.notifications}
    assert "Dr. Balogun" in recipients
    assert "student_founder_team_01" in recipients


# ---------------------------------------------------------------------------
# KAN-53: Emergency On-Site Metrology Rectification
# ---------------------------------------------------------------------------

def test_kan53_emergency_rectification_dispatch_acceptance_criteria():
    """Kiln shaft keyway at 24.72 mm halts release, targets 25.012 mm, dispatches by 3:45 AM."""
    dispatcher = OnSiteRectificationDispatcher()
    mission = dispatcher.dispatch_emergency_mission(
        job_id="JOB-KILN-999",
        part_description="Kiln Shaft Keyway",
        measured_keyway_mm=24.72,
        nominal_keyway_mm=25.0,
        tolerance_upper_mm=0.021,
        tolerance_lower_mm=0.0,
        gauge_block_photos=["https://fabnetwork.com.ng/qc/keyway.jpg"],
        assembly_location="Agbara Industrial Estate",
        logged_by="Danladi",
    )

    assert mission.halt_supplier_disbursement is True
    assert mission.traveler_status == "LOCKED_FITMENT_ERROR"
    assert mission.target_keyway_dimension_mm == 25.012
    assert mission.required_skim_cut_mm == 0.28
    assert mission.technician_dispatch_eta == "03:30 AM WAT"
    assert "Portable magnetic milling rig" in mission.equipment_assigned

    completed = dispatcher.verify_restoration_sign_off(
        mission_id=mission.mission_id,
        post_skim_dimension_mm=25.012,
        technician_id="Tech-01",
        plant_manager_sign_off="Danladi",
    )

    assert completed.status == "RECTIFIED_VERIFIED"
    assert completed.traveler_status == "UNLOCKED_RECTIFIED"
