"""Lightweight stand-in for the Auxin bridge that drives a robot from qwen_data.

Speaks the bridge's WS+/healthz contract on the robot's locked ports so the
aggregator pumps and translates it just like a real bridge. Reads
qwen_data/<robot_id>/robot.jsonl, resamples to 10 Hz, honours the same
/tmp/aura_inject_<robot_id> and /tmp/aura_pause_<robot_id> sentinels the
aggregator already writes.

Emits the same three WS message shapes the real Auxin bridge does (verified
against ../Auxin_Automata/sdk/src/auxin_sdk/bridge.py):

  {"type": "telemetry",        "data": TelemetryFrame}
  {"type": "compliance_event", "data": {hash, severity, reason_code, signature, flags, timestamp}}
  {"type": "payment_event",    "data": {signature, amount_lamports, provider, privacy_provider, is_private, timestamp}}

The aggregator's _translate_bridge_message already maps these to FleetMessage
shape for the dashboard's ComplianceLog + PaymentTicker components.

When ../Auxin_Automata/sdk is on PYTHONPATH (or installed as auxin-sdk), real
SDK schema + hashing modules are used. Otherwise we fall back to inline
canonical hashing that produces byte-identical output for the same payload.

Each robot gets its own ReplayerState + FastAPI app via make_app(robot_id),
so a single process can drive all three robots without shared state.

Module-level `app` is preserved for backwards compatibility (uvicorn CLI
+ AURA_QWEN_ROBOT_ID env var); it just calls make_app() under the hood.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import anyio
import structlog
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

log = structlog.get_logger()

RATE_HZ = 10
SOURCE_RATE_HZ = 100
STEP = SOURCE_RATE_HZ // RATE_HZ

ANOMALY_EVENT_TYPES = {"gripper_slip", "collision", "joint_torque_spike", "anomaly", "error"}

# Auxin reason-code constants — match ../Auxin_Automata/sdk/src/auxin_sdk/program/client.py
REASON_CODE_ANOMALY = 0x0001
REASON_CODE_ORACLE_DENIED = 0x0002
REASON_CODE_REPLAY_SESSION_START = 0x03E9
REASON_CODE_REPLAY_SESSION_END = 0x03EA

COMPLIANCE_SEVERITY_NORMAL = 1
COMPLIANCE_SEVERITY_ANOMALY = 2

# Auxin bridge constants
PAYMENT_AMOUNT_LAMPORTS = 10_000  # 0.00001 SOL per inference, matches sdk default
PAYMENT_INTERVAL_TICKS = 50       # one payment every ~5s at 10Hz

_REPO_ROOT = Path(__file__).resolve().parents[3]
_METADATA_DIR = _REPO_ROOT / "aura-dashboard" / "public" / "robot_metadata"

# Mount the upstream Auxin SDK if it's a sibling of the repo.
_AUXIN_SDK_SRC = _REPO_ROOT.parent / "Auxin_Automata" / "sdk" / "src"
if _AUXIN_SDK_SRC.is_dir() and str(_AUXIN_SDK_SRC) not in sys.path:
    sys.path.insert(0, str(_AUXIN_SDK_SRC))

try:
    from auxin_sdk.hashing import sha256_hex as _sdk_sha256_hex
    from auxin_sdk.schema import TelemetryFrame as _SdkTelemetryFrame

    _AUXIN_SDK_AVAILABLE = True
    log.info("auxin_sdk.mounted", path=str(_AUXIN_SDK_SRC))
except Exception as exc:
    _AUXIN_SDK_AVAILABLE = False
    log.info("auxin_sdk.unavailable", reason=str(exc))


_BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58encode(payload: bytes) -> str:
    """Minimal base58 encoder — used for synthetic-but-realistic tx signatures."""
    n = int.from_bytes(payload, "big")
    out = ""
    while n > 0:
        n, r = divmod(n, 58)
        out = _BASE58_ALPHABET[r] + out
    # preserve leading-zero bytes as '1's
    pad = 0
    for b in payload:
        if b == 0:
            pad += 1
        else:
            break
    return ("1" * pad) + out


def _synthetic_tx_signature(robot_id: str, kind: str, seed: str) -> str:
    """Deterministic 88-char base58 signature for demo events.

    Format: sha512(robot_id|kind|seed) → 64 bytes → base58 → first 88 chars.
    Solana sigs are 64 bytes encoded base58 (~88 chars), so this looks legit
    in the dashboard explorer link-out even though it doesn't resolve.
    """
    digest = hashlib.sha512(f"{robot_id}|{kind}|{seed}".encode("utf-8")).digest()
    encoded = _b58encode(digest)
    return encoded[:88].ljust(88, "1")


def _frame_hash(payload: dict) -> str:
    """Compute the canonical SHA-256 of a TelemetryFrame-shaped payload.

    Uses auxin_sdk.hashing if available; otherwise inlines the SDK's exact
    canonical-JSON algorithm so hashes match byte-for-byte.
    """
    if _AUXIN_SDK_AVAILABLE:
        try:
            return _sdk_sha256_hex(_SdkTelemetryFrame(**payload))
        except Exception:
            pass
    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), allow_nan=False, default=str
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _load_metadata(robot_id: str) -> dict:
    path = _METADATA_DIR / f"{robot_id}.json"
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            return {}
    return {}

_SUB_QUEUE_MAX = 64
_SEND_TIMEOUT_S = 1.0


@dataclass(eq=False)
class _ReplayerSubscriber:
    ws: WebSocket
    queue: asyncio.Queue[str] = field(default_factory=lambda: asyncio.Queue(maxsize=_SUB_QUEUE_MAX))
    dropped: int = 0


@dataclass
class ReplayerState:
    robot_id: str
    data_dir: Path
    inject_flag: Path
    pause_flag: Path
    rows: list[dict] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)
    subscribers: set[_ReplayerSubscriber] = field(default_factory=set)
    wallet_pubkey: str = ""
    agent_pda: str = ""
    provider_pubkey: str = ""
    privacy_provider: str = "direct"
    compliance_count: int = 0
    payment_count: int = 0
    last_payment_idx: int = -PAYMENT_INTERVAL_TICKS


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

    meta = _load_metadata(state.robot_id)
    state.wallet_pubkey = meta.get("wallet_pubkey", "")
    state.agent_pda = meta.get("agent_pda", "")
    # Provider pubkey for M2M payments — fall back to a stable demo provider
    # so the explorer link-out is non-empty. Real Auxin uses PROVIDER_PUBKEY env.
    state.provider_pubkey = (
        os.environ.get("PROVIDER_PUBKEY")
        or meta.get("provider_pubkey")
        or "AuRaInferenceProvider1111111111111111111111"
    )
    state.privacy_provider = os.environ.get("AUXIN_PRIVACY", "direct")

    log.info(
        "qwen_replayer.loaded",
        rows=len(state.rows),
        events=len(state.events),
        dir=str(state.data_dir),
        robot_id=state.robot_id,
        wallet_pubkey=state.wallet_pubkey[:8] + "…" if state.wallet_pubkey else "",
        agent_pda=state.agent_pda[:8] + "…" if state.agent_pda else "",
        privacy=state.privacy_provider,
    )


def _row_anomaly_flags(row: dict) -> list[str]:
    flags: list[str] = []
    fault_flags = row.get("status", {}).get("fault_flags", {}) or {}
    for name, value in fault_flags.items():
        if value:
            flags.append(name)
    return flags


def _build_telemetry_frame(row: dict, extra_flags: list[str]) -> dict:
    """Build a TelemetryFrame-shaped dict matching auxin_sdk.schema.TelemetryFrame."""
    rs = row.get("robot_state", {})
    q = rs.get("q") or []
    dq = rs.get("dq") or []
    flags = _row_anomaly_flags(row) + extra_flags
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "joint_positions": list(q) if q else [0.0],
        "joint_velocities": list(dq) if dq else [0.0] * max(len(q), 1),
        "joint_torques": list(dq) if dq else [0.0] * max(len(q), 1),
        "end_effector_pose": {
            "gripper_state": rs.get("gripper_state", "OPEN"),
            "gripper_width": rs.get("gripper_width", 0.0),
            "tcp_position_xyz": rs.get("tcp_position_xyz", []),
            "tcp_orientation_xyzw": rs.get("tcp_orientation_xyzw", []),
        },
        "anomaly_flags": flags,
    }


def _build_telemetry_message(frame: dict) -> dict:
    return {"type": "telemetry", "data": frame}


def _build_compliance_message(
    state: ReplayerState,
    frame: dict,
    severity: int,
    reason_code: int,
) -> dict:
    """Mirror Auxin bridge.py:652 — {"type": "compliance_event", "data": {...}}."""
    state.compliance_count += 1
    telemetry_hash = _frame_hash(frame)
    sig = _synthetic_tx_signature(
        state.robot_id, "compliance", f"{telemetry_hash}|{state.compliance_count}"
    )
    return {
        "type": "compliance_event",
        "data": {
            "hash": telemetry_hash,
            "severity": severity,
            "reason_code": reason_code,
            "signature": sig,
            "tx_signature": sig,  # alias — aggregator looks under either key
            "flags": frame.get("anomaly_flags", []),
            "timestamp": frame["timestamp"],
        },
    }


def _build_payment_message(state: ReplayerState, frame: dict) -> dict:
    """Mirror Auxin bridge.py:720 — {"type": "payment_event", "data": {...}}."""
    state.payment_count += 1
    sig = _synthetic_tx_signature(
        state.robot_id, "payment", f"{frame['timestamp']}|{state.payment_count}"
    )
    return {
        "type": "payment_event",
        "data": {
            "signature": sig,
            "amount_lamports": PAYMENT_AMOUNT_LAMPORTS,
            "provider": state.provider_pubkey,
            "privacy_provider": state.privacy_provider,
            "is_private": state.privacy_provider != "direct",
            "timestamp": frame["timestamp"],
            "oracle_reason": "approved",
        },
    }


async def _broadcast(state: ReplayerState, payload: dict) -> None:
    """Non-blocking fan-out: enqueue to each subscriber with drop-oldest backpressure.

    The actual socket write happens in each subscriber's own pump task, so the
    tick loop never stalls on a slow consumer.
    """
    if not state.subscribers:
        return
    msg = json.dumps(payload)
    for sub in list(state.subscribers):
        q = sub.queue
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
                sub.dropped += 1
            except asyncio.QueueEmpty:
                pass
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass


async def _subscriber_pump(state: ReplayerState, sub: _ReplayerSubscriber) -> None:
    try:
        while True:
            msg = await sub.queue.get()
            try:
                await asyncio.wait_for(sub.ws.send_text(msg), timeout=_SEND_TIMEOUT_S)
            except (asyncio.TimeoutError, Exception):
                break
    finally:
        state.subscribers.discard(sub)
        try:
            await sub.ws.close()
        except Exception:
            pass


async def _tick_loop(state: ReplayerState) -> None:
    if not state.rows:
        log.warning("qwen_replayer.no_rows", robot_id=state.robot_id)
        return

    period = 1.0 / RATE_HZ
    idx = 0
    n = len(state.rows)
    tick = 0

    # Session-start compliance event (matches Auxin reason_code 0x03E9).
    session_frame = _build_telemetry_frame(state.rows[0], ["replay_session_start"])
    await _broadcast(
        state,
        _build_compliance_message(
            state, session_frame, COMPLIANCE_SEVERITY_NORMAL, REASON_CODE_REPLAY_SESSION_START
        ),
    )

    while True:
        paused = state.pause_flag.exists()
        injected = False
        extra: list[str] = []
        if state.inject_flag.exists():
            extra.append("injected_anomaly")
            injected = True
            try:
                state.inject_flag.unlink()
            except FileNotFoundError:
                pass

        row = state.rows[idx % n]
        frame = _build_telemetry_frame(row, extra)
        await _broadcast(state, _build_telemetry_message(frame))

        # (b) anomaly path — Auxin bridge.py:567-583
        if frame["anomaly_flags"]:
            severity = (
                COMPLIANCE_SEVERITY_ANOMALY if injected else COMPLIANCE_SEVERITY_NORMAL
            )
            await _broadcast(
                state,
                _build_compliance_message(state, frame, severity, REASON_CODE_ANOMALY),
            )
        # (c) payment path — fire every PAYMENT_INTERVAL_TICKS healthy ticks
        elif tick - state.last_payment_idx >= PAYMENT_INTERVAL_TICKS:
            state.last_payment_idx = tick
            await _broadcast(state, _build_payment_message(state, frame))

        if not paused:
            idx += STEP
            tick += 1
            if idx >= n:
                idx = 0
                log.info("qwen_replayer.loop_restart", robot_id=state.robot_id)
                end_frame = _build_telemetry_frame(state.rows[0], ["replay_session_end"])
                await _broadcast(
                    state,
                    _build_compliance_message(
                        state,
                        end_frame,
                        COMPLIANCE_SEVERITY_NORMAL,
                        REASON_CODE_REPLAY_SESSION_END,
                    ),
                )

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
        sub = _ReplayerSubscriber(ws=websocket)
        state.subscribers.add(sub)
        pump = asyncio.create_task(_subscriber_pump(state, sub))
        log.info(
            "qwen_replayer.subscriber_connect",
            total=len(state.subscribers),
            robot_id=state.robot_id,
        )
        # Re-emit a session_start so the aggregator pump's history backfill
        # contains it even if the pump connected after the boot-time emission.
        if state.rows:
            session_frame = _build_telemetry_frame(state.rows[0], ["replay_session_start"])
            try:
                msg = json.dumps(
                    _build_compliance_message(
                        state,
                        session_frame,
                        COMPLIANCE_SEVERITY_NORMAL,
                        REASON_CODE_REPLAY_SESSION_START,
                    )
                )
                sub.queue.put_nowait(msg)
            except Exception:
                pass
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            state.subscribers.discard(sub)
            pump.cancel()
            log.info(
                "qwen_replayer.subscriber_disconnect",
                total=len(state.subscribers),
                robot_id=state.robot_id,
                dropped_frames=sub.dropped,
            )

    return ws_app, hz_app


def make_app(robot_id: str, data_dir: Path | None = None) -> FastAPI:
    """Backwards-compatible: returns the WS app (also exposes /healthz)."""
    ws_app, _hz = make_apps(robot_id, data_dir)
    return ws_app


app = make_app(os.environ.get("AURA_QWEN_ROBOT_ID", "robot_01"))
