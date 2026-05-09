"""FastAPI aggregator on :8780 — fleet HTTP + WS multiplex.

Placeholder mock data. Real implementation queries each bridge's /healthz,
joins with metadata, and forwards WS streams. See ../docs/api_contract.md.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import structlog
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect

from .config import load_fleet_config

log = structlog.get_logger()

_metadata_dir = Path(__file__).resolve().parents[3] / "aura-dashboard" / "public" / "robot_metadata"


def _mock_robot(robot_id: str, name: str, status: str, grade: str) -> dict:
    return {
        "id": robot_id,
        "name": name,
        "wallet_pubkey": "",
        "status": status,
        "grade": grade,
        "runway_hours": 42.0,
        "latest_event_ts": datetime.now(timezone.utc).isoformat(),
        "video_url": f"/videos/{robot_id}/third_person.mp4",
        "telemetry_ws_url": "ws://localhost:8766",
        "compliance_ws_url": "ws://localhost:8766",
    }


def _mock_fleet() -> list[dict]:
    return [
        _mock_robot("robot_01", "Aura-Panda-01", "healthy", "A"),
        _mock_robot("robot_02", "Aura-Panda-02", "anomaly", "C"),
        _mock_robot("robot_03", "Aura-Panda-03", "idle", "B"),
    ]


_fleet_subscribers: set[WebSocket] = set()
_selected_subscribers: set[WebSocket] = set()


async def _fleet_heartbeat() -> None:
    while True:
        await asyncio.sleep(5)
        if not _fleet_subscribers:
            continue
        msg = json.dumps(
            {
                "robot_id": "robot_01",
                "type": "telemetry",
                "payload": {"heartbeat": True, "ts": datetime.now(timezone.utc).isoformat()},
            }
        )
        for ws in list(_fleet_subscribers):
            try:
                await ws.send_text(msg)
            except Exception:
                _fleet_subscribers.discard(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        cfg = load_fleet_config()
        log.info("fleet.startup", robots=[r.id for r in cfg.robots], port=cfg.aggregator.port)
    except Exception as exc:
        log.warning("fleet.config.unreadable", error=str(exc))
    task = asyncio.create_task(_fleet_heartbeat())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="aura-fleet-aggregator", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok", "service": "aura-fleet"}


@app.get("/fleet/status")
async def fleet_status() -> dict:
    return {"robots": _mock_fleet()}


@app.get("/robot/{robot_id}/status")
async def robot_status(robot_id: str) -> dict:
    for r in _mock_fleet():
        if r["id"] == robot_id:
            return r
    raise HTTPException(status_code=404, detail=f"unknown robot: {robot_id}")


@app.get("/robot/{robot_id}/recent_events")
async def recent_events(robot_id: str, n: int = 5) -> list[dict]:
    return [
        {
            "hash": f"sha256:placeholder-{i}",
            "severity": 1,
            "reason_code": "placeholder",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "tx_signature": f"PLACEHOLDER_TX_{robot_id}_{i}",
            "explorer_url": f"https://explorer.solana.com/tx/PLACEHOLDER_TX_{robot_id}_{i}?cluster=devnet",
        }
        for i in range(min(n, 3))
    ]


@app.post("/robot/{robot_id}/inject_anomaly")
async def inject_anomaly(robot_id: str) -> dict:
    log.info("fleet.inject_anomaly", robot_id=robot_id)
    return {"injected": True, "robot_id": robot_id}


@app.post("/robot/{robot_id}/pause")
async def pause(robot_id: str) -> dict:
    flag = Path(f"/tmp/aura_pause_{robot_id}")
    flag.touch()
    log.info("fleet.pause", robot_id=robot_id, flag=str(flag))
    return {"paused": True, "robot_id": robot_id}


@app.get("/robot/{robot_id}/identity")
async def identity(robot_id: str) -> dict:
    path = _metadata_dir / f"{robot_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"no metadata for {robot_id}")
    return json.loads(path.read_text())


@app.websocket("/fleet")
async def fleet_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    _fleet_subscribers.add(websocket)
    log.info("fleet.subscriber.connect", total=len(_fleet_subscribers))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _fleet_subscribers.discard(websocket)
        log.info("fleet.subscriber.disconnect", total=len(_fleet_subscribers))


@app.websocket("/selected")
async def selected_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    _selected_subscribers.add(websocket)
    log.info("selected.subscriber.connect", total=len(_selected_subscribers))
    try:
        while True:
            data = await websocket.receive_text()
            log.info("selected.message", data=data)
            for sub in list(_selected_subscribers):
                if sub is websocket:
                    continue
                try:
                    await sub.send_text(data)
                except Exception:
                    _selected_subscribers.discard(sub)
    except WebSocketDisconnect:
        pass
    finally:
        _selected_subscribers.discard(websocket)
