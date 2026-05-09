"""FastAPI aggregator on :8780 — fleet HTTP + WS multiplex.

Queries each bridge's /healthz for live status; falls back to offline when
bridge is unreachable. Multiplexes all three bridge WS streams into /fleet.
See docs/api_contract.md for the locked interface.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import httpx
import structlog
import websockets
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect

from .config import RobotConfig, load_fleet_config
from .encord_labels import get_label_store

log = structlog.get_logger()

_metadata_dir = Path(__file__).resolve().parents[3] / "aura-dashboard" / "public" / "robot_metadata"

_GRADES = {"robot_01": "A", "robot_02": "C", "robot_03": "B"}
_RUNWAY = {"robot_01": 42.0, "robot_02": 38.0, "robot_03": 51.0}

_fleet_subscribers: set[WebSocket] = set()
_selected_subscribers: set[WebSocket] = set()

_cfg = None


def _get_cfg():
    global _cfg
    if _cfg is None:
        _cfg = load_fleet_config()
    return _cfg


def _robot_cfg(robot_id: str) -> RobotConfig | None:
    for r in _get_cfg().robots:
        if r.id == robot_id:
            return r
    return None


def _read_wallet_pubkey(robot_id: str) -> str:
    path = _metadata_dir / f"{robot_id}.json"
    if path.exists():
        try:
            meta = json.loads(path.read_text())
            return meta.get("wallet_pubkey", "")
        except Exception:
            pass
    return ""


async def _fetch_bridge_status(robot: RobotConfig) -> dict:
    url = f"http://localhost:{robot.bridge_http_port}/healthz"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(url)
            data = resp.json() if resp.status_code == 200 else {}
            bridge_status = data.get("status", "healthy")
            status = "healthy" if bridge_status in ("ok", "healthy") else "anomaly"
    except Exception:
        status = "offline"

    return {
        "id": robot.id,
        "name": robot.name,
        "wallet_pubkey": _read_wallet_pubkey(robot.id),
        "status": status,
        "grade": _GRADES.get(robot.id, "B"),
        "runway_hours": _RUNWAY.get(robot.id, 42.0),
        "latest_event_ts": datetime.now(timezone.utc).isoformat(),
        "video_url": f"/videos/{robot.id}/third_person.mp4",
        "telemetry_ws_url": f"ws://localhost:{robot.bridge_ws_port}",
        "compliance_ws_url": f"ws://localhost:{robot.bridge_ws_port}",
    }


_REASON_CODE_LABELS: dict[int, str] = {
    0x0001: "anomaly",
    0x0002: "oracle_denied",
    0x03E9: "replay_session_start",
    0x03EA: "replay_session_end",
}

_EXPLORER_BASE = "https://explorer.solana.com"


def _translate_bridge_message(robot_id: str, raw_payload: dict) -> dict | None:
    """
    Translate an Auxin bridge WS message into the FleetMessage shape
    that T3's socket.ts / store.ts expects.

    Auxin bridge emits:
      {type: "telemetry",        data: TelemetryFrame dict}
      {type: "compliance_event", data: {hash, severity, reason_code, tx_signature, timestamp}}
      {type: "payment_event",    data: {signature, amount_lamports, provider, is_private, timestamp, ...}}

    T3 expects FleetMessage:
      {robot_id, type: "telemetry"|"compliance"|"payment", payload: ...}
    where:
      telemetry payload  → {t, joints, torques, gripper: {open, force}}
      compliance payload → {hash, severity, reason_code, timestamp, tx_signature, explorer_url}
      payment payload    → {amount_lamports, provider_pubkey, tx_signature, explorer_url, timestamp, privacy_routed}
    """
    msg_type = raw_payload.get("type", "")
    data = raw_payload.get("data", {})

    if msg_type == "telemetry":
        ee = data.get("end_effector_pose", {})
        gripper_state = ee.get("gripper_state", "OPEN")
        payload = {
            "t": int(datetime.now(timezone.utc).timestamp() * 1000),
            "joints": data.get("joint_positions", []),
            "torques": data.get("joint_torques", []),
            "gripper": {
                "open": gripper_state != "CLOSED",
                "force": ee.get("gripper_width", 0.0),
            },
            "anomaly_flags": data.get("anomaly_flags", []),
        }
        return {"robot_id": robot_id, "type": "telemetry", "payload": payload}

    if msg_type == "compliance_event":
        reason_int = data.get("reason_code", 0x0001)
        reason_str = _REASON_CODE_LABELS.get(reason_int, f"0x{reason_int:04x}")
        tx_sig = data.get("tx_signature") or ""
        explorer_url = (
            f"{_EXPLORER_BASE}/tx/{tx_sig}?cluster=devnet" if tx_sig else ""
        )
        payload = {
            "hash": data.get("hash", ""),
            "severity": data.get("severity", 1),
            "reason_code": reason_str,
            "timestamp": data.get("timestamp", datetime.now(timezone.utc).isoformat()),
            "tx_signature": tx_sig,
            "explorer_url": explorer_url,
        }
        return {"robot_id": robot_id, "type": "compliance", "payload": payload}

    if msg_type == "payment_event":
        tx_sig = data.get("signature") or ""
        provider = data.get("provider") or ""
        explorer_url = (
            f"{_EXPLORER_BASE}/tx/{tx_sig}?cluster=devnet" if tx_sig else ""
        )
        payload = {
            "amount_lamports": data.get("amount_lamports", 0),
            "provider_pubkey": provider,
            "tx_signature": tx_sig,
            "explorer_url": explorer_url,
            "timestamp": data.get("timestamp", datetime.now(timezone.utc).isoformat()),
            "privacy_routed": bool(data.get("is_private", False)),
        }
        return {"robot_id": robot_id, "type": "payment", "payload": payload}

    # status_change and other types forwarded as-is (e.g. risk_report)
    return None


async def _bridge_ws_pump(robot: RobotConfig) -> None:
    uri = f"ws://localhost:{robot.bridge_ws_port}"
    while True:
        try:
            async with websockets.connect(uri, open_timeout=5) as ws:
                log.info("bridge_ws.connected", robot_id=robot.id, uri=uri)
                async for raw in ws:
                    if not _fleet_subscribers:
                        continue
                    try:
                        raw_payload = json.loads(raw)
                        translated = _translate_bridge_message(robot.id, raw_payload)
                        if translated is None:
                            continue
                        msg = json.dumps(translated)
                    except Exception:
                        continue
                    for sub in list(_fleet_subscribers):
                        try:
                            await sub.send_text(msg)
                        except Exception:
                            _fleet_subscribers.discard(sub)
        except Exception as exc:
            log.warning("bridge_ws.disconnected", robot_id=robot.id, error=str(exc))
        await asyncio.sleep(5)


async def _fleet_heartbeat() -> None:
    while True:
        await asyncio.sleep(5)
        if not _fleet_subscribers:
            continue
        msg = json.dumps({
            "robot_id": "fleet",
            "type": "heartbeat",
            "payload": {"ts": datetime.now(timezone.utc).isoformat()},
        })
        for ws in list(_fleet_subscribers):
            try:
                await ws.send_text(msg)
            except Exception:
                _fleet_subscribers.discard(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = load_fleet_config()
    log.info("fleet.startup", robots=[r.id for r in cfg.robots], port=cfg.aggregator.port)
    get_label_store()
    tasks = [asyncio.create_task(_fleet_heartbeat())]
    for robot in cfg.robots:
        tasks.append(asyncio.create_task(_bridge_ws_pump(robot)))
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()


app = FastAPI(title="aura-fleet-aggregator", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok", "service": "aura-fleet"}


@app.get("/fleet/status")
async def fleet_status() -> dict:
    cfg = _get_cfg()
    robots = await asyncio.gather(*[_fetch_bridge_status(r) for r in cfg.robots])
    return {"robots": list(robots)}


@app.get("/robot/{robot_id}/status")
async def robot_status(robot_id: str) -> dict:
    robot = _robot_cfg(robot_id)
    if robot is None:
        raise HTTPException(status_code=404, detail=f"unknown robot: {robot_id}")
    return await _fetch_bridge_status(robot)


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
    flag = Path(f"/tmp/aura_inject_{robot_id}")
    flag.touch()
    log.info("fleet.inject_anomaly", robot_id=robot_id, flag=str(flag))
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


@app.get("/robot/{robot_id}/encord_labels")
async def encord_labels_window(robot_id: str, t0: float = 0.0, t1: float = 30.0) -> dict:
    if _robot_cfg(robot_id) is None:
        raise HTTPException(404, f"unknown robot: {robot_id}")
    store = get_label_store()
    labels = store.get_labels_in_window(robot_id, t0, t1)
    prov = store.get_provenance(robot_id)
    return {
        "robot_id": robot_id,
        "t0": t0,
        "t1": t1,
        "labels": labels,
        "encord_label_hash": prov.get("encord_label_hash", ""),
        "attestation_tx": prov.get("attestation_tx", ""),
        "attestation_explorer_url": prov.get("attestation_explorer_url", ""),
    }


@app.get("/robot/{robot_id}/encord_labels/at_frame")
async def encord_labels_at_frame(robot_id: str, frame: int = 0) -> dict:
    if _robot_cfg(robot_id) is None:
        raise HTTPException(404, f"unknown robot: {robot_id}")
    store = get_label_store()
    labels = store.get_labels_at_frame(robot_id, frame)
    return {"robot_id": robot_id, "frame_index": frame, "labels": labels}


@app.get("/robot/{robot_id}/encord_provenance")
async def encord_provenance_endpoint(robot_id: str) -> dict:
    if _robot_cfg(robot_id) is None:
        raise HTTPException(404, f"unknown robot: {robot_id}")
    prov = get_label_store().get_provenance(robot_id)
    if not prov:
        raise HTTPException(404, f"no provenance for {robot_id}")
    return prov


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
        log.info("selected.subscriber.disconnect", total=len(_selected_subscribers))
