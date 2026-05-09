"""Tool 2: get_recent_events — last N compliance events for a robot. Cost: 0."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from . import ToolResult
    from .fleet_client import FleetClient


schema_get_recent_events = {
    "type": "function",
    "function": {
        "name": "get_recent_events",
        "description": "Returns the last N compliance events for the specified or selected robot.",
        "parameters": {
            "type": "object",
            "properties": {
                "robot_id": {"type": "string", "description": "Robot ID (defaults to selected)"},
                "n": {"type": "integer", "default": 5},
            },
            "required": [],
        },
    },
}


async def handle_get_recent_events(args: dict, client: "FleetClient") -> "ToolResult":
    raise NotImplementedError("Implement get_recent_events per playbook P5")
