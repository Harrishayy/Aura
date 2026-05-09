"""Tool 1: get_fleet_status — aggregated fleet status. Cost: 0."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from . import ToolResult
    from .fleet_client import FleetClient


schema_get_fleet_status = {
    "type": "function",
    "function": {
        "name": "get_fleet_status",
        "description": "Returns aggregated status of all robots in the fleet.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
}


async def handle_get_fleet_status(args: dict, client: "FleetClient") -> "ToolResult":
    from . import ToolResult  # avoid cycle at import time

    raise NotImplementedError("Implement get_fleet_status per playbook P5")
    # status = await client.get_fleet_status()
    # return ToolResult(
    #     tool_name="get_fleet_status",
    #     success=True,
    #     result=status,
    #     reasoning="All three robots online. ...",
    # )
