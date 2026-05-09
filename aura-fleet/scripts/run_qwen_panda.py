"""Demo entrypoint: qwen-panda replayers (all 3 robots) + fleet aggregator.

Skips Auxin entirely. Each robot gets its own replayer FastAPI instance
(via qwen_replayer.make_app), bound to both the locked WS port and HTTP
healthz port. The aggregator runs in-process on the fleet port.
"""

from __future__ import annotations

import asyncio
import signal
import sys
from pathlib import Path

import structlog
import uvicorn

_FLEET_ROOT = Path(__file__).resolve().parents[1]
if str(_FLEET_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(_FLEET_ROOT / "src"))

from aura_fleet.config import load_fleet_config  # noqa: E402
from aura_fleet.qwen_replayer import make_apps  # noqa: E402

log = structlog.get_logger("qwen-panda")


def _server(app, port: int, level: str = "warning") -> uvicorn.Server:
    return uvicorn.Server(uvicorn.Config(
        app, host="0.0.0.0", port=port, log_level=level,
    ))


async def main() -> None:
    cfg = load_fleet_config()

    servers: list[uvicorn.Server] = []
    tasks: list[asyncio.Task] = []

    for robot in cfg.robots:
        ws_app, hz_app = make_apps(robot.id)

        ws_srv = _server(ws_app, robot.bridge_ws_port)
        hz_srv = _server(hz_app, robot.bridge_http_port)
        servers += [ws_srv, hz_srv]

        tasks.append(asyncio.create_task(ws_srv.serve(), name=f"{robot.id}-ws"))
        tasks.append(asyncio.create_task(hz_srv.serve(), name=f"{robot.id}-hz"))

        log.info(
            "qwen_panda.replayer_mounted",
            robot_id=robot.id,
            ws_port=robot.bridge_ws_port,
            http_port=robot.bridge_http_port,
        )

    agg_srv = _server("aura_fleet.aggregator:app", cfg.aggregator.port, level="info")
    servers.append(agg_srv)
    tasks.append(asyncio.create_task(agg_srv.serve(), name="aggregator"))

    log.info(
        "qwen_panda.starting",
        robots=[r.id for r in cfg.robots],
        agg_port=cfg.aggregator.port,
    )

    loop = asyncio.get_running_loop()

    def _shutdown(sig: signal.Signals) -> None:
        log.info("qwen_panda.shutdown_signal", signal=sig.name)
        for s in servers:
            s.should_exit = True
        for t in tasks:
            t.cancel()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _shutdown, sig)

    try:
        await asyncio.gather(*tasks, return_exceptions=True)
    finally:
        log.info("qwen_panda.stopped")


if __name__ == "__main__":
    asyncio.run(main())
