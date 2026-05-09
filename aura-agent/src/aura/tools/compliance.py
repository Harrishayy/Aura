"""Tool 2: get_recent_events — last N compliance events for a robot. Cost: 0."""

from __future__ import annotations

import anyio

from .fleet_client import TOOL_TIMEOUT_S, FleetClient, resolve_robot_id, timed_out

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


def _summarise(robot_id: str, events: list[dict]) -> str:
    if not events:
        return f"Robot {robot_id} has no recent compliance events."
    parts = [f"{e.get('reason_code', 'event')} severity {e.get('severity', '?')}" for e in events[:5]]
    return f"Robot {robot_id}: " + "; ".join(parts) + "."


async def handle_get_recent_events(args: dict, client: FleetClient):
    from . import ToolResult

    robot_id = resolve_robot_id(args, client)
    if not robot_id:
        return ToolResult(
            tool_name="get_recent_events",
            success=False,
            reasoning="No robot specified and none selected.",
        )

    n = int(args.get("n", 5))
    try:
        with anyio.fail_after(TOOL_TIMEOUT_S):
            events = await client.get_recent_events(robot_id, n=n)
    except TimeoutError:
        return ToolResult(
            tool_name="get_recent_events", success=False, robot_id=robot_id, reasoning=timed_out()
        )

    tx = await client.trigger_compliance_log(
        robot_id, {"tool_name": "get_recent_events", "args": args}
    )
    return ToolResult(
        tool_name="get_recent_events",
        success=True,
        robot_id=robot_id,
        result=events,
        tx_signature=tx,
        reasoning=_summarise(robot_id, events),
    )
