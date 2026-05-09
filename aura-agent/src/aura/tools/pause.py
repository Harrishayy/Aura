"""Tool 5: pause_robot — freezes the VideoSource on its current frame. Cost: 0."""

from __future__ import annotations

import anyio

from .fleet_client import TOOL_TIMEOUT_S, FleetClient, resolve_robot_id, timed_out

ALL_ROBOTS = ("robot_01", "robot_02", "robot_03")

schema_pause_robot = {
    "type": "function",
    "function": {
        "name": "pause_robot",
        "description": (
            "Pauses the specified or selected robot. With no robot_id and no "
            "selected robot, pauses all three. Freezes the VideoSource on the "
            "current frame."
        ),
        "parameters": {
            "type": "object",
            "properties": {"robot_id": {"type": "string"}},
            "required": [],
        },
    },
}


async def handle_pause_robot(args: dict, client: FleetClient):
    from . import ToolResult

    robot_id = resolve_robot_id(args, client)
    targets = (robot_id,) if robot_id else ALL_ROBOTS

    try:
        with anyio.fail_after(TOOL_TIMEOUT_S):
            for r in targets:
                await client.pause_robot(r)
    except TimeoutError:
        return ToolResult(
            tool_name="pause_robot", success=False, robot_id=robot_id, reasoning=timed_out()
        )

    tx = await client.trigger_compliance_log(
        robot_id or "fleet", {"tool_name": "pause_robot", "args": args}
    )
    if robot_id:
        reasoning = (
            f"Robot {robot_id} paused. Resume with 'unpause robot {robot_id}' "
            "or click resume in the dashboard."
        )
    else:
        reasoning = "All three robots paused."
    return ToolResult(
        tool_name="pause_robot",
        success=True,
        robot_id=robot_id,
        tx_signature=tx,
        reasoning=reasoning,
    )
