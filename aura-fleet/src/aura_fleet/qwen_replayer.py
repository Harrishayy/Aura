"""Lightweight stand-in for the Auxin bridge that drives a robot from qwen_data.

Speaks the bridge's WS+/healthz contract on the robot's locked ports so the
aggregator pumps and translates it just like a real bridge. Reads
qwen_data/<robot_id>/robot.jsonl, resamples to 10 Hz, honours the same
/tmp/aura_inject_<robot_id> and /tmp/aura_pause_<robot_id> sentinels the
aggregator already writes.

Each robot gets its own ReplayerState + FastAPI app via make_app(robot_id),
so a single process can drive all three robots without shared state.

Module-level `app` is preserved for backwards compatibility (uvicorn CLI
+ AURA_QWEN_ROBOT_ID env var); it just calls make_app() under the hood.
"""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path

import anyio
import structlog
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

log = structlog.get_logger()

RATE_HZ = 10
SOURCE_RATE_HZ = 100
STEP = SOURCE_RATE_HZ // RATE_HZ

ANOMALY_EVENT_TYPES = {"gripper_slip", "collision", "joint_torque_spike", "anomaly", "error"}

_REPO_ROOT = Path(__file__).resolve().parents[3]


@dataclass
class ReplayerState:
    robot_id: str
    data_dir: Path
    inject_flag: Path
    pause_flag: Path
    rows: list[dict] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)
    subscribers: set[WebSocket] = field(default_factory=set)


def _default_data_dir(robot_id: str) -> Path:
    override = os.environ.get("AURA_QWEN_DATA_DIR")
    if override:
        return Path(override)
    return _REPO_ROOT / "qwen_data" / robot_id


def _load(state: ReplayerState) -> None:
    robot_path = state.data_dir / "robot.jsonl"
    events_path = state.data_dir / "episode_events.jsonl"

    with robot_path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                state.rows.append(json.loads(line))

    if events_path.exists() and events_path.stat().st_size > 0:
        with events_path.open() as f:
            for line in f:
                line = line.strip()
                if line:
                    state.events.append(json.loads(line))

    log.info(
        "qwen_replayer.loaded",
        rows=len(state.rows),
        events=len(state.events),
        dir=str(state.data_dir),
        robot_id=state.robot_id,
    )


def _row_anomaly_flags(row: dict) -> list[str]:
    flags: list[str] = []
    fault_flags = row.get("status", {}).get("fault_flags", {}) or {}
    for name, value in fault_flags.items():
        if value:
            flags.append(name)
    return flags


def _build_telemetry(row: dict, extra_flags: list[str]) -> dict:
    rs = row.get("robot_state", {})
    flags = _row_anomaly_flags(row) + extra_flags
    return {
        "type": "telemetry",
        "data": {
            "joint_positions": rs.get("q", []),
            "joint_torques": rs.get("dq", []),
            "end_effector_pose": {
                "gripper_state": rs.get("gripper_state", "OPEN"),
                "gripper_width": rs.get("gripper_width", 0.0),
                "tcp_position_xyz": rs.get("tcp_position_xyz", []),
                "tcp_orientation_xyzw": rs.get("tcp_orientation_xyzw", []),
            },
            "anomaly_flags": flags,
        },
    }


async def _broadcast(state: ReplayerState, payload: dict) -> None:
    if not state.subscribers:
        return
    msg = json.dumps(payload)
    for ws in list(state.subscribers):
        try:
            await ws.send_text(msg)
        except Exception:
            state.subscribers.discard(ws)


async def _tick_loop(state: ReplayerState) -> None:
    if not state.rows:
        log.warning("qwen_replayer.no_rows", robot_id=state.robot_id)
        return

    period = 1.0 / RATE_HZ
    idx = 0
    n = len(state.rows)

    while True:
        paused = state.pause_flag.exists()
        extra: list[str] = []
        if state.inject_flag.exists():
            extra.append("injected_anomaly")
            try:
                state.inject_flag.unlink()
            except FileNotFoundError:
                pass

        row = state.rows[idx % n]
        await _broadcast(state, _build_telemetry(row, extra))

        if not paused:
            idx += STEP
            if idx >= n:
                idx = 0
                log.info("qwen_replayer.loop_restart", robot_id=state.robot_id)

        await anyio.sleep(period)


def make_apps(robot_id: str, data_dir: Path | None = None) -> tuple[FastAPI, FastAPI]:
    """Return (ws_app, hz_app) sharing one ReplayerState. Only ws_app runs
    the lifespan tick loop; hz_app is a passive read-only /healthz endpoint
    against the same state."""
    state = ReplayerState(
        robot_id=robot_id,
        data_dir=data_dir or _default_data_dir(robot_id),
        inject_flag=Path(f"/tmp/aura_inject_{robot_id}"),
        pause_flag=Path(f"/tmp/aura_pause_{robot_id}"),
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        _load(state)
        async with anyio.create_task_group() as tg:
            tg.start_soon(_tick_loop, state)
            log.info("qwen_replayer.started", rate_hz=RATE_HZ, robot_id=state.robot_id)
            try:
                yield
            finally:
                tg.cancel_scope.cancel()

    ws_app = FastAPI(title=f"qwen-panda-replayer-{robot_id}", lifespan=lifespan)
    hz_app = FastAPI(title=f"qwen-panda-healthz-{robot_id}")

    @ws_app.get("/healthz")
    @hz_app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok", "robot_id": state.robot_id, "rows": len(state.rows)}

    @ws_app.websocket("/")
    async def ws_root(websocket: WebSocket) -> None:
        await websocket.accept()
        state.subscribers.add(websocket)
        log.info(
            "qwen_replayer.subscriber_connect",
            total=len(state.subscribers),
            robot_id=state.robot_id,
        )
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            state.subscribers.discard(websocket)
            log.info(
                "qwen_replayer.subscriber_disconnect",
                total=len(state.subscribers),
                robot_id=state.robot_id,
            )

    return ws_app, hz_app


def make_app(robot_id: str, data_dir: Path | None = None) -> FastAPI:
    """Backwards-compatible: returns the WS app (also exposes /healthz)."""
    ws_app, _hz = make_apps(robot_id, data_dir)
    return ws_app


app = make_app(os.environ.get("AURA_QWEN_ROBOT_ID", "robot_01"))
