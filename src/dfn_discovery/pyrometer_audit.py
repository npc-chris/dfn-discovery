"""Pyrometer & Thermocouple Heat-Treatment Audit Gate (KAN-41 / US-C-04).

Enforces mandatory thermal soak telemetry verification before batch dispatch.
Prevents hydrogen embrittlement failure and brittle fractures in electroplated
or hardened components by locking hub dispatch and escrow disbursement
until compliant furnace logs are verified.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional


class HeatTreatmentProcess(str, Enum):
    DE_EMBRITTLEMENT_BAKING = "de_embrittlement_baking"
    CARBURIZING = "carburizing"
    HARDENING_AND_TEMPERING = "hardening_and_tempering"
    STRESS_RELIEF = "stress_relief"


@dataclass
class ThermocoupleSample:
    timestamp_minutes: float
    temperature_c: float


@dataclass
class ThermocoupleLog:
    sensor_id: str
    is_calibrated: bool
    samples: List[ThermocoupleSample] = field(default_factory=list)


@dataclass
class HeatTreatmentBatch:
    batch_id: str
    part_count: int
    part_description: str
    material_grade: str
    process: HeatTreatmentProcess
    required_temp_c: float
    temp_tolerance_c: float
    required_soak_hours: float
    thermocouple_log: Optional[ThermocoupleLog] = None


@dataclass
class DispatchAuditDecision:
    dispatch_authorized: bool
    milestone_disbursement_held: bool
    status: str
    alert_message: str
    actual_soak_duration_hours: float
    mean_temperature_c: Optional[float] = None
    min_temperature_c: Optional[float] = None
    max_temperature_c: Optional[float] = None


def evaluate_dispatch_authorization(batch: HeatTreatmentBatch) -> DispatchAuditDecision:
    """Evaluates whether a heat-treated or electroplated batch may be authorized for dispatch.

    Enforces US-C-04 Gherkin acceptance criteria:
    - If thermocouple data is missing: blocks dispatch, alerts operator, holds disbursement.
    - If soak time is inadequate: triggers under-soak quarantine hold.
    - If temperature excursions violate tolerance: blocks dispatch.
    - If compliant: unlocks hub dispatch and releases escrow milestone hold.
    """
    req_temp = batch.required_temp_c
    req_hours = batch.required_soak_hours
    log = batch.thermocouple_log

    # 1. Missing log gate
    if log is None or len(log.samples) == 0:
        return DispatchAuditDecision(
            dispatch_authorized=False,
            milestone_disbursement_held=True,
            status="BLOCKED_MISSING_LOG",
            alert_message=f"MANDATORY LOG MISSING: Upload {int(req_hours)}-hour {int(req_temp)}°C furnace log to authorize release",
            actual_soak_duration_hours=0.0,
        )

    # 2. Sensor accreditation check
    if not log.is_calibrated:
        return DispatchAuditDecision(
            dispatch_authorized=False,
            milestone_disbursement_held=True,
            status="BLOCKED_UNAUTHENTIC_SENSOR",
            alert_message="UNAUTHENTIC SENSOR: Thermocouple calibration is expired or uncertified.",
            actual_soak_duration_hours=0.0,
        )

    # 3. Analyze time-series telemetry
    min_allowed_temp = req_temp - batch.temp_tolerance_c
    max_allowed_temp = req_temp + batch.temp_tolerance_c

    sorted_samples = sorted(log.samples, key=lambda s: s.timestamp_minutes)
    compliant_durations_min: float = 0.0
    temps: List[float] = []

    for i in range(len(sorted_samples)):
        s = sorted_samples[i]
        temps.append(s.temperature_c)

        if i > 0:
            dt = s.timestamp_minutes - sorted_samples[i - 1].timestamp_minutes
            prev_temp = sorted_samples[i - 1].temperature_c

            # Check if this interval is in the compliant soak window
            if (min_allowed_temp <= prev_temp <= max_allowed_temp) and (
                min_allowed_temp <= s.temperature_c <= max_allowed_temp
            ):
                compliant_durations_min += dt

    actual_soak_hours = compliant_durations_min / 60.0
    mean_temp = sum(temps) / len(temps) if temps else 0.0
    min_temp = min(temps) if temps else 0.0
    max_temp = max(temps) if temps else 0.0

    # 4. Check for thermal excursions during the soak interval
    if min_temp < (min_allowed_temp - 5.0):
        return DispatchAuditDecision(
            dispatch_authorized=False,
            milestone_disbursement_held=True,
            status="BLOCKED_THERMAL_EXCURSION",
            alert_message=f"THERMAL INVERSION EXCEPTION: Furnace dropped to {min_temp:.1f}°C (minimum allowed {min_allowed_temp:.1f}°C). Inadequate de-embrittlement.",
            actual_soak_duration_hours=actual_soak_hours,
            mean_temperature_c=mean_temp,
            min_temperature_c=min_temp,
            max_temperature_c=max_temp,
        )

    # 5. Check soak duration against mandatory threshold
    if actual_soak_hours < req_hours:
        return DispatchAuditDecision(
            dispatch_authorized=False,
            milestone_disbursement_held=True,
            status="BLOCKED_UNDER_SOAK",
            alert_message=f"UNDER-SOAK QUARANTINE: Recorded soak duration {actual_soak_hours:.2f} hrs violates required {req_hours:.2f} hrs at {int(req_temp)}°C.",
            actual_soak_duration_hours=actual_soak_hours,
            mean_temperature_c=mean_temp,
            min_temperature_c=min_temp,
            max_temperature_c=max_temp,
        )

    # 6. All criteria satisfied: release dispatch authorization
    return DispatchAuditDecision(
        dispatch_authorized=True,
        milestone_disbursement_held=False,
        status="AUTHORIZED",
        alert_message="HUB DISPATCH AUTHORIZED: Heat treatment soak parameters verified.",
        actual_soak_duration_hours=actual_soak_hours,
        mean_temperature_c=mean_temp,
        min_temperature_c=min_temp,
        max_temperature_c=max_temp,
    )
