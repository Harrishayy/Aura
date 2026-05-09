"""Smoke test the voice loop without touching real APIs."""

from __future__ import annotations

import pytest

from aura.tools import TOOLS


def test_tool_registry_has_five_tools() -> None:
    assert set(TOOLS.keys()) == {
        "get_fleet_status",
        "get_recent_events",
        "investigate_anomaly",
        "generate_incident_report",
        "pause_robot",
    }


def test_only_investigate_costs_sol() -> None:
    paid = [name for name, spec in TOOLS.items() if spec.cost_lamports > 0]
    assert paid == ["investigate_anomaly"]
    assert TOOLS["investigate_anomaly"].cost_lamports == 800_000


@pytest.mark.parametrize("name", list(TOOLS.keys()))
def test_each_tool_has_llm_schema(name: str) -> None:
    schema = TOOLS[name].schema_for_llm
    assert schema["type"] == "function"
    assert schema["function"]["name"] == name
    assert "parameters" in schema["function"]
