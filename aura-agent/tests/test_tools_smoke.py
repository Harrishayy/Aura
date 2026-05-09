"""Per-tool smoke tests with a mocked FleetClient. No live fleet, no real OpenAI."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from aura.tools import TOOLS, ToolResult
from aura.tools import investigate as investigate_module


def _mock_client(**overrides) -> MagicMock:
    client = MagicMock()
    client._base = "http://localhost:8780"
    client.selected = None
    client.get_fleet_status = AsyncMock(
        return_value={
            "robots": [
                {"id": "robot_01", "name": "Aura-Panda-01", "grade": "A", "status": "healthy"},
                {"id": "robot_02", "name": "Aura-Panda-02", "grade": "C", "status": "anomaly"},
                {"id": "robot_03", "name": "Aura-Panda-03", "grade": "B", "status": "idle"},
            ]
        }
    )
    client.get_robot_status = AsyncMock(return_value={"id": "robot_01", "status": "healthy"})
    client.get_recent_events = AsyncMock(
        return_value=[
            {
                "tx_signature": "TX_ABC",
                "reason_code": "joint_torque_spike",
                "severity": 2,
                "timestamp": "2026-05-09T12:34:56Z",
            }
        ]
    )
    client.pause_robot = AsyncMock(return_value=None)
    client.trigger_compliance_log = AsyncMock(return_value="TX_LOG")
    client.trigger_inference_payment = AsyncMock(return_value="TX_PAY")
    for k, v in overrides.items():
        setattr(client, k, v)
    return client


@pytest.mark.asyncio
async def test_get_fleet_status_summarises_three_robots() -> None:
    client = _mock_client()
    result: ToolResult = await TOOLS["get_fleet_status"].handler({}, client)
    assert result.success
    assert "Aura-Panda-01" in result.reasoning
    assert "grade A" in result.reasoning
    assert result.tx_signature == "TX_LOG"
    client.trigger_compliance_log.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_recent_events_uses_explicit_robot_id() -> None:
    client = _mock_client()
    result = await TOOLS["get_recent_events"].handler({"robot_id": "robot_02", "n": 3}, client)
    assert result.success
    assert result.robot_id == "robot_02"
    assert "joint_torque_spike" in result.reasoning
    client.get_recent_events.assert_awaited_once_with("robot_02", n=3)


@pytest.mark.asyncio
async def test_get_recent_events_falls_back_to_selected() -> None:
    selected = MagicMock()
    selected.current = MagicMock(return_value="robot_03")
    client = _mock_client(selected=selected)
    result = await TOOLS["get_recent_events"].handler({}, client)
    assert result.success
    assert result.robot_id == "robot_03"


@pytest.mark.asyncio
async def test_get_recent_events_errors_with_no_robot() -> None:
    client = _mock_client()
    result = await TOOLS["get_recent_events"].handler({}, client)
    assert not result.success
    assert "no robot" in result.reasoning.lower() or "none selected" in result.reasoning.lower()


@pytest.mark.asyncio
async def test_pause_robot_specific_id() -> None:
    client = _mock_client()
    result = await TOOLS["pause_robot"].handler({"robot_id": "robot_02"}, client)
    assert result.success
    assert result.robot_id == "robot_02"
    assert "robot_02 paused" in result.reasoning
    client.pause_robot.assert_awaited_once_with("robot_02")


@pytest.mark.asyncio
async def test_pause_robot_pauses_all_when_no_id() -> None:
    client = _mock_client()
    result = await TOOLS["pause_robot"].handler({}, client)
    assert result.success
    assert result.robot_id is None
    assert "all three" in result.reasoning.lower()
    assert client.pause_robot.await_count == 3


@pytest.mark.asyncio
async def test_generate_incident_report_returns_url() -> None:
    client = _mock_client()
    args = {"robot_id": "robot_01", "from_iso": "2026-05-09T12:00:00Z", "to_iso": "2026-05-09T13:00:00Z"}
    result = await TOOLS["generate_incident_report"].handler(args, client)
    assert result.success
    assert result.result["report_url"].startswith("http://localhost:8780/reports/robot_01/")


@pytest.mark.asyncio
async def test_investigate_anomaly_costs_sol_and_returns_diagnosis(monkeypatch) -> None:
    client = _mock_client()
    fake_resp = MagicMock()
    fake_resp.choices = [
        MagicMock(message=MagicMock(content=json.dumps({
            "proximate_cause": "gripper slip during pick",
            "severity_assessment": "moderate",
            "recommended_action": "pause for inspection",
            "confidence_pct": 78,
        })))
    ]
    fake_oa = MagicMock()
    fake_oa.chat.completions.create = AsyncMock(return_value=fake_resp)
    monkeypatch.setattr(investigate_module, "AsyncOpenAI", lambda **_: fake_oa)

    result = await TOOLS["investigate_anomaly"].handler(
        {"robot_id": "robot_02", "event_id": "TX_ABC"}, client
    )
    assert result.success
    assert result.cost_lamports == 800_000
    assert result.tx_signature == "TX_PAY"
    assert "gripper slip" in result.reasoning
    assert "pause for inspection" in result.reasoning
    client.trigger_inference_payment.assert_awaited_once_with(
        "robot_02", 800_000, "anomaly diagnosis"
    )


@pytest.mark.asyncio
async def test_investigate_anomaly_requires_event_id() -> None:
    """investigate.py validates event_id up-front — without it, returns
    success=False and asks the operator for an ID rather than billing the
    fleet for a diagnosis on nothing."""
    client = _mock_client()
    result = await TOOLS["investigate_anomaly"].handler({"robot_id": "robot_01"}, client)
    assert not result.success
    assert result.cost_lamports == 800_000
    assert "event" in result.reasoning.lower()
