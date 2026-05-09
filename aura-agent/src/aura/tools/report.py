"""Tool 4: generate_incident_report — triggers Auxin's weasyprint pipeline. Cost: 0."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from . import ToolResult
    from .fleet_client import FleetClient


schema_generate_incident_report = {
    "type": "function",
    "function": {
        "name": "generate_incident_report",
        "description": "Generates a PDF incident report for one robot or fleet-wide.",
        "parameters": {
            "type": "object",
            "properties": {
                "robot_id": {"type": "string"},
                "from_iso": {"type": "string", "format": "date-time"},
                "to_iso": {"type": "string", "format": "date-time"},
            },
            "required": ["from_iso", "to_iso"],
        },
    },
}


async def handle_generate_incident_report(args: dict, client: "FleetClient") -> "ToolResult":
    raise NotImplementedError("Implement generate_incident_report per playbook P5")
