"""Tool 1: get_fleet_status — aggregated fleet status. Cost: 0."""

from __future__ import annotations

import anyio

from .fleet_client import TOOL_TIMEOUT_S, FleetClient, timed_out

schema_get_fleet_status = {
    "type": "function",
    "function": {
        "name": "get_fleet_status",
        "description": "Returns aggregated status of all robots in the fleet.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
}


def _summarise(robots: list[dict]) -> str:
    if not robots:
        return "No robots online."
    parts = [f"{r.get('name', r['id'])} grade {r.get('grade', '?')}, {r.get('status', '?')}" for r in robots]
    return ". ".join(parts) + "."


async def handle_get_fleet_status(args: dict, client: FleetClient):
    from . import ToolResult

    try:
        with anyio.fail_after(TOOL_TIMEOUT_S):
            status = await client.get_fleet_status()
    except TimeoutError:
        return ToolResult(tool_name="get_fleet_status", success=False, reasoning=timed_out())

    tx = await client.trigger_compliance_log(
        "fleet", {"tool_name": "get_fleet_status", "args": args}
    )
    return ToolResult(
        tool_name="get_fleet_status",
        success=True,
        result=status,
        tx_signature=tx,
        reasoning=_summarise(status.get("robots", [])),
    )
