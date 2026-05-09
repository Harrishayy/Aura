"""Thin httpx wrapper around the fleet aggregator (port 8780)."""

from __future__ import annotations

import httpx

from ..config import get_settings


class FleetClient:
    def __init__(self, base_url: str | None = None, timeout: float = 5.0) -> None:
        self._base = (base_url or get_settings().aura_fleet_http).rstrip("/")
        self._client = httpx.AsyncClient(base_url=self._base, timeout=timeout)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get_fleet_status(self) -> dict:
        r = await self._client.get("/fleet/status")
        r.raise_for_status()
        return r.json()

    async def get_robot_status(self, robot_id: str) -> dict:
        r = await self._client.get(f"/robot/{robot_id}/status")
        r.raise_for_status()
        return r.json()

    async def get_recent_events(self, robot_id: str, n: int = 5) -> list[dict]:
        r = await self._client.get(f"/robot/{robot_id}/recent_events", params={"n": n})
        r.raise_for_status()
        return r.json()

    async def pause_robot(self, robot_id: str) -> None:
        r = await self._client.post(f"/robot/{robot_id}/pause")
        r.raise_for_status()

    async def get_identity(self, robot_id: str) -> dict:
        r = await self._client.get(f"/robot/{robot_id}/identity")
        r.raise_for_status()
        return r.json()

    # The two methods below are wired through the bridge process via Auxin's existing
    # program; left as TODOs until the Auxin SDK path-dep is uncommented.

    async def trigger_inference_payment(
        self, robot_id: str, lamports: int, reason: str
    ) -> str:
        raise NotImplementedError(
            "Wire to Auxin's stream_compute_payment via the bridge for {robot_id}"
        )

    async def trigger_compliance_log(self, robot_id: str, payload: dict) -> str:
        raise NotImplementedError(
            "Wire to Auxin's log_compliance_event via the bridge for {robot_id}"
        )
