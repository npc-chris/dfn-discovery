"""Shared PyTest fixtures for DFN Discovery Feasibility & Routing tests."""

import pytest
from dfn_discovery.alloy_registry import AlloyGrade, ALLOY_CATALOG
from dfn_discovery.clusters import WORKSHOP_REGISTRY, ClusterRegion, WorkshopProfile
from dfn_discovery.din_iso_2768 import ToleranceClass


@pytest.fixture
def sample_aluminum_spec():
    return ALLOY_CATALOG[AlloyGrade.AL_6061_T6]


@pytest.fixture
def sample_shaft_steel_spec():
    return ALLOY_CATALOG[AlloyGrade.STEEL_EN8_1045]


@pytest.fixture
def sample_stainless_spec():
    return ALLOY_CATALOG[AlloyGrade.STAINLESS_304]


@pytest.fixture
def sample_brass_spec():
    return ALLOY_CATALOG[AlloyGrade.BRASS_C36000]


@pytest.fixture
def lagos_workshop():
    return next(w for w in WORKSHOP_REGISTRY if w.workshop_id == "LAG-IKJ-01")


@pytest.fixture
def aba_workshop():
    return next(w for w in WORKSHOP_REGISTRY if w.workshop_id == "ABA-PHR-02")


@pytest.fixture
def nnewi_workshop():
    return next(w for w in WORKSHOP_REGISTRY if w.workshop_id == "NNW-OTL-01")
