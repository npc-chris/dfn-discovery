"""Unit and Acceptance Tests for Pyrometer & Thermocouple Heat-Treatment Audit Gate (KAN-41 / US-C-04)."""

import pytest
from dfn_discovery.pyrometer_audit import (
    HeatTreatmentProcess,
    ThermocoupleSample,
    ThermocoupleLog,
    HeatTreatmentBatch,
    evaluate_dispatch_authorization,
)


@pytest.fixture
def grade_10_9_bolts_batch() -> HeatTreatmentBatch:
    """Fixture providing 200 high-tensile Grade 10.9 electroplated bolts requiring 4-hr 200°C baking."""
    return HeatTreatmentBatch(
        batch_id="BATCH-2026-BOLT-109",
        part_count=200,
        part_description="High-tensile Grade 10.9 electroplated M12 flange bolts",
        material_grade="Grade 10.9 Steel (35CrMo / 4140 Quenched & Tempered)",
        process=HeatTreatmentProcess.DE_EMBRITTLEMENT_BAKING,
        required_temp_c=200.0,
        temp_tolerance_c=10.0,  # [190.0°C - 210.0°C]
        required_soak_hours=4.0,
        thermocouple_log=None,
    )


def test_us_c_04_missing_thermocouple_log_blocks_dispatch(grade_10_9_bolts_batch: HeatTreatmentBatch):
    """Gherkin Acceptance Scenario:

    Given 200 high-tensile Grade 10.9 electroplated bolts requiring 4-hour baking at 200°C
    When Chukwudi attempts to click "Authorize Hub Dispatch" without attaching thermocouple data
    Then the system blocks the dispatch button
    And displays an alert: "MANDATORY LOG MISSING: Upload 4-hour 200°C furnace log to authorize release"
    And withholds the milestone disbursement until verified by hub quality.
    """
    decision = evaluate_dispatch_authorization(grade_10_9_bolts_batch)

    assert not decision.dispatch_authorized
    assert decision.milestone_disbursement_held
    assert decision.status == "BLOCKED_MISSING_LOG"
    assert (
        decision.alert_message
        == "MANDATORY LOG MISSING: Upload 4-hour 200°C furnace log to authorize release"
    )
    assert decision.actual_soak_duration_hours == 0.0


def test_empty_thermocouple_samples_blocks_dispatch(grade_10_9_bolts_batch: HeatTreatmentBatch):
    """Verify that an empty log attachment also triggers missing log lockout."""
    grade_10_9_bolts_batch.thermocouple_log = ThermocoupleLog(
        sensor_id="TC-FURNACE-01",
        is_calibrated=True,
        samples=[],
    )

    decision = evaluate_dispatch_authorization(grade_10_9_bolts_batch)
    assert not decision.dispatch_authorized
    assert decision.milestone_disbursement_held
    assert decision.status == "BLOCKED_MISSING_LOG"


def test_uncalibrated_sensor_is_rejected(grade_10_9_bolts_batch: HeatTreatmentBatch):
    """Verify that an unaccredited or expired thermocouple blocks dispatch."""
    # 4 hours of samples at 200°C
    samples = [
        ThermocoupleSample(timestamp_minutes=float(m), temperature_c=200.0)
        for m in range(0, 245, 5)
    ]
    grade_10_9_bolts_batch.thermocouple_log = ThermocoupleLog(
        sensor_id="TC-UNACCREDITED-99",
        is_calibrated=False,
        samples=samples,
    )

    decision = evaluate_dispatch_authorization(grade_10_9_bolts_batch)
    assert not decision.dispatch_authorized
    assert decision.milestone_disbursement_held
    assert decision.status == "BLOCKED_UNAUTHENTIC_SENSOR"
    assert "UNAUTHENTIC SENSOR" in decision.alert_message


def test_under_soak_time_triggers_quarantine(grade_10_9_bolts_batch: HeatTreatmentBatch):
    """Verify that an insufficient soak time (e.g. 2.5 hours vs 4.0 hours) triggers quarantine."""
    # Only 150 minutes (2.5 hours) of baking
    samples = [
        ThermocoupleSample(timestamp_minutes=float(m), temperature_c=200.0)
        for m in range(0, 155, 5)
    ]
    grade_10_9_bolts_batch.thermocouple_log = ThermocoupleLog(
        sensor_id="TC-FURNACE-01",
        is_calibrated=True,
        samples=samples,
    )

    decision = evaluate_dispatch_authorization(grade_10_9_bolts_batch)
    assert not decision.dispatch_authorized
    assert decision.milestone_disbursement_held
    assert decision.status == "BLOCKED_UNDER_SOAK"
    assert "UNDER-SOAK QUARANTINE" in decision.alert_message
    assert decision.actual_soak_duration_hours == pytest.approx(2.5, abs=0.05)


def test_thermal_excursion_triggers_exception(grade_10_9_bolts_batch: HeatTreatmentBatch):
    """Verify that temperature dropping below tolerance during baking triggers thermal excursion hold."""
    # 240 minutes, but furnace dropped to 175°C midway
    samples = []
    for m in range(0, 245, 5):
        temp = 172.0 if 60 <= m <= 90 else 200.0
        samples.append(ThermocoupleSample(timestamp_minutes=float(m), temperature_c=temp))

    grade_10_9_bolts_batch.thermocouple_log = ThermocoupleLog(
        sensor_id="TC-FURNACE-01",
        is_calibrated=True,
        samples=samples,
    )

    decision = evaluate_dispatch_authorization(grade_10_9_bolts_batch)
    assert not decision.dispatch_authorized
    assert decision.milestone_disbursement_held
    assert decision.status == "BLOCKED_THERMAL_EXCURSION"
    assert "THERMAL INVERSION EXCEPTION" in decision.alert_message


def test_compliant_heat_treatment_authorizes_dispatch(grade_10_9_bolts_batch: HeatTreatmentBatch):
    """Verify that a compliant 4-hour soak at 200°C unlocks dispatch and clears milestone disbursement."""
    # 245 minutes of samples tightly oscillating around 200°C ± 1.5°C
    samples = []
    for i, m in enumerate(range(0, 250, 5)):
        temp = 200.0 + (1.2 if i % 2 == 0 else -0.8)
        samples.append(ThermocoupleSample(timestamp_minutes=float(m), temperature_c=temp))

    grade_10_9_bolts_batch.thermocouple_log = ThermocoupleLog(
        sensor_id="TC-FURNACE-01",
        is_calibrated=True,
        samples=samples,
    )

    decision = evaluate_dispatch_authorization(grade_10_9_bolts_batch)
    assert decision.dispatch_authorized
    assert not decision.milestone_disbursement_held
    assert decision.status == "AUTHORIZED"
    assert "HUB DISPATCH AUTHORIZED" in decision.alert_message
    assert decision.actual_soak_duration_hours >= 4.0
    assert decision.mean_temperature_c == pytest.approx(200.2, abs=0.5)
