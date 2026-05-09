"""Aura tool registry.

Five tools, each wrapping a fleet endpoint. Every tool logs an Auxin compliance
event with tool_name + args; tool 3 (`investigate_anomaly`) additionally fires
a real on-chain SOL payment.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from .compliance import handle_get_recent_events, schema_get_recent_events
from .fleet_status import handle_get_fleet_status, schema_get_fleet_status
from .investigate import handle_investigate_anomaly, schema_investigate_anomaly
from .pause import handle_pause_robot, schema_pause_robot
from .report import handle_generate_incident_report, schema_generate_incident_report


class ToolResult(BaseModel):
    tool_name: str
    success: bool
    robot_id: str | None = None
    result: Any = None
    cost_lamports: int = 0
    tx_signature: str | None = None
    reasoning: str = Field(
        ..., description="Spoken summary of what the tool did, narrated to the user"
    )


@dataclass(frozen=True)
class ToolSpec:
    schema_for_llm: dict
    handler: Callable[..., Awaitable[ToolResult]]
    cost_lamports: int = 0


TOOLS: dict[str, ToolSpec] = {
    "get_fleet_status": ToolSpec(schema_get_fleet_status, handle_get_fleet_status, 0),
    "get_recent_events": ToolSpec(schema_get_recent_events, handle_get_recent_events, 0),
    "investigate_anomaly": ToolSpec(
        schema_investigate_anomaly, handle_investigate_anomaly, 800_000
    ),
    "generate_incident_report": ToolSpec(
        schema_generate_incident_report, handle_generate_incident_report, 0
    ),
    "pause_robot": ToolSpec(schema_pause_robot, handle_pause_robot, 0),
}


__all__ = ["ToolResult", "ToolSpec", "TOOLS"]
