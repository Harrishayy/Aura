"""Per-tool smoke tests. Run after implementing each handler in src/aura/tools/."""

from __future__ import annotations

import asyncio

from aura.tools import TOOLS
from aura.tools.fleet_client import FleetClient


async def main() -> None:
    client = FleetClient()
    try:
        for name, spec in TOOLS.items():
            print(f"--- {name} (cost: {spec.cost_lamports} lamports) ---")
            try:
                result = await spec.handler({"robot_id": "robot_01"}, client)
                print(result.model_dump_json(indent=2))
            except NotImplementedError as exc:
                print(f"SKIP: {exc}")
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
