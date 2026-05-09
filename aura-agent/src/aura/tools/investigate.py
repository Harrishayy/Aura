"""Tool 3: investigate_anomaly — GPT-4o diagnosis around a flagged event.

The ONLY tool that costs SOL. Cost is hardcoded at 800_000 lamports (0.0008 SOL),
well under Auxin's 0.001 per-tx cap. Do NOT parametrise this over the LLM.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from . import ToolResult
    from .fleet_client import FleetClient


COST_LAMPORTS = 800_000

DIAGNOSTIC_PROMPT = """You are an industrial robotics diagnostician.
Given this telemetry window from a Franka Emika Panda arm around a flagged
compliance event, identify the proximate cause and recommend an action.
Reply as JSON: { proximate_cause, severity_assessment, recommended_action,
confidence_pct }. Be concise; this will be read aloud to a human operator."""


schema_investigate_anomaly = {
    "type": "function",
    "function": {
        "name": "investigate_anomaly",
        "description": (
            "Diagnose a flagged compliance event using GPT-4o. "
            "Costs 800000 lamports (~0.0008 SOL). Requires verbal confirmation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "robot_id": {"type": "string"},
                "event_id": {"type": "string", "description": "tx_signature of the event"},
            },
            "required": ["event_id"],
        },
    },
}


async def handle_investigate_anomaly(args: dict, client: "FleetClient") -> "ToolResult":
    raise NotImplementedError("Implement investigate_anomaly per playbook P5")
