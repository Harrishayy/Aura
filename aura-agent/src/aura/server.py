"""FastAPI app for the Aura agent.

Exposes:
- GET /healthz   liveness probe
- WS  /aura      transcript broadcaster (per docs/api_contract.md)

The WS endpoint accepts subscribers and emits a heartbeat every 5s so the
dashboard's AuraConversation panel can verify connectivity before the real
voice loop is wired up.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import structlog
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

log = structlog.get_logger()

_subscribers: set[WebSocket] = set()


async def _heartbeat() -> None:
    while True:
        await asyncio.sleep(5)
        if not _subscribers:
            continue
        message = {
            "type": "heartbeat",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "content": "agent alive",
        }
        await _broadcast(message)


async def _broadcast(message: dict) -> None:
    encoded = json.dumps(message)
    dead: list[WebSocket] = []
    for ws in _subscribers:
        try:
            await ws.send_text(encoded)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _subscribers.discard(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_heartbeat())
    log.info("aura-agent.startup", port=8770)
    try:
        yield
    finally:
        task.cancel()
        log.info("aura-agent.shutdown")


app = FastAPI(title="aura-agent", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok", "service": "aura-agent"}


@app.websocket("/aura")
async def aura_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    _subscribers.add(websocket)
    log.info("aura.subscriber.connect", total=len(_subscribers))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _subscribers.discard(websocket)
        log.info("aura.subscriber.disconnect", total=len(_subscribers))


async def publish_turn(message: dict) -> None:
    """Public hook the agent uses to push transcript messages to dashboard subscribers."""
    await _broadcast(message)
