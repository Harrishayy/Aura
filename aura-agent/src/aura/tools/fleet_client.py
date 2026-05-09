"""Thin httpx wrapper around the fleet aggregator (port 8780) plus the
selected-robot ambient-context subscriber.

Tool handlers call FleetClient for the data fetches that hit the aggregator,
and `trigger_inference_payment` / `trigger_compliance_log` for the on-chain
side. The latter two require Auxin SDK (commented out in pyproject.toml until
T2 wires the bridges); they no-op + warn until then so tool dispatch stays
unblocked.
"""

from __future__ import annotations

import contextlib
import json
from typing import TYPE_CHECKING

import anyio
import httpx
import structlog

from ..config import get_settings

if TYPE_CHECKING:
    pass

log = structlog.get_logger()


def _selected_ws_url() -> str:
    base = get_settings().aura_fleet_http.replace("http://", "ws://").replace("https://", "wss://")
    return base.rstrip("/") + "/selected"


class SelectedRobotContext:
    """Holds the dashboard's currently-selected robot_id. Updates via WS."""

    def __init__(self, ws_url: str | None = None) -> None:
        self._ws_url = ws_url or _selected_ws_url()
        self._current: str | None = None

    def current(self) -> str | None:
        return self._current

    async def run(self) -> None:
        """Subscribe to /selected forever, reconnecting on drop."""
        import websockets  # local import — only needed when running

        backoff = 0.5
        warned = False
        while True:
            try:
                async with websockets.connect(self._ws_url) as ws:
                    log.info("selected.connected", url=self._ws_url)
                    backoff = 0.5
                    warned = False
                    async for raw in ws:
                        with contextlib.suppress(json.JSONDecodeError, KeyError):
                            self._current = json.loads(raw).get("selected_robot_id")
                            log.info("selected.update", robot_id=self._current)
            except (OSError, Exception) as exc:  # noqa: BLE001 — reconnect on any ws/network error
                if not warned:
                    log.warning(
                        "selected.disconnect",
                        error=str(exc),
                        retry_in=backoff,
                        note="suppressing further reconnect logs until reconnected",
                    )
                    warned = True
                else:
                    log.debug("selected.reconnect_failed", error=str(exc), retry_in=backoff)
                await anyio.sleep(backoff)
                backoff = min(backoff * 2, 10.0)


class FleetClient:
    def __init__(
        self,
        base_url: str | None = None,
        timeout: float = 5.0,
        selected: SelectedRobotContext | None = None,
    ) -> None:
        self._base = (base_url or get_settings().aura_fleet_http).rstrip("/")
        self._client = httpx.AsyncClient(base_url=self._base, timeout=timeout)
        self.selected = selected

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

    async def get_encord_labels(self, robot_id: str, t0: float, t1: float) -> dict:
        r = await self._client.get(
            f"/robot/{robot_id}/encord_labels", params={"t0": t0, "t1": t1}
        )
        r.raise_for_status()
        return r.json()

    async def get_encord_provenance(self, robot_id: str) -> dict:
        r = await self._client.get(f"/robot/{robot_id}/encord_provenance")
        r.raise_for_status()
        return r.json()

    # The two methods below are wired through the bridge process via Auxin's existing
    # program; left as TODOs until the Auxin SDK path-dep is uncommented.
    async def trigger_inference_payment(
        self, robot_id: str, lamports: int, reason: str
    ) -> str | None:
        # TODO: wire to Auxin's stream_compute_payment via the bridge for {robot_id}.
        # Returns the tx signature once the auxin-sdk path-dep is uncommented in
        # pyproject.toml. Until then, we return None and tools surface a missing
        # tx_signature in the on-chain receipt — voice round-trip remains unblocked.
        log.warning(
            "auxin.payment.skipped",
            reason="auxin_sdk_unavailable",
            robot_id=robot_id,
            lamports=lamports,
            note=reason,
        )
        return None

    async def trigger_compliance_log(self, robot_id: str, payload: dict) -> str | None:
        # TODO: wire to Auxin's log_compliance_event via the bridge for {robot_id}.
        log.warning(
            "auxin.compliance.skipped",
            reason="auxin_sdk_unavailable",
            robot_id=robot_id,
            payload=payload,
        )
        return None


def resolve_robot_id(args: dict, client: FleetClient) -> str | None:
    """args.robot_id, else client.selected.current(), else None."""
    rid = args.get("robot_id")
    if rid:
        return rid
    if client.selected is not None:
        return client.selected.current()
    return None


TOOL_TIMEOUT_S = 5.0


def timed_out() -> str:
    return "That timed out, want me to retry or skip?"
