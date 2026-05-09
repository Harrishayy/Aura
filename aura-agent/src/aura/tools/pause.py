"""Tool 5: pause_robot — freezes the VideoSource on its current frame. Cost: 0."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from . import ToolResult
    from .fleet_client import FleetClient


schema_pause_robot = {
    "type": "function",
    "function": {
        "name": "pause_robot",
        "description": "Pauses the specified or selected robot. The VideoSource freezes on the current frame.",
        "parameters": {
            "type": "object",
            "properties": {"robot_id": {"type": "string"}},
            "required": [],
        },
    },
}


async def handle_pause_robot(args: dict, client: "FleetClient") -> "ToolResult":
    raise NotImplementedError("Implement pause_robot per playbook P5")
