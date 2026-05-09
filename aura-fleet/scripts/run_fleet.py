"""
Boots all three Auxin bridge subprocesses + the fleet aggregator.
Press Ctrl+C for graceful shutdown.
"""

from __future__ import annotations

import asyncio
import os
import signal
import sys
from pathlib import Path

import httpx
import structlog
import uvicorn

_FLEET_ROOT = Path(__file__).resolve().parents[1]
if str(_FLEET_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(_FLEET_ROOT / "src"))

from aura_fleet.config import load_fleet_config  # noqa: E402

log = structlog.get_logger(__name__)

_BRIDGE_SCRIPT = Path("/Volumes/ROS2_SSD/Aura/Auxin_Automata/sdk/scripts/run_bridge.py")

_ANSI = {
    "robot_01": "\033[36m",   # cyan
    "robot_02": "\033[32m",   # green
    "robot_03": "\033[33m",   # yellow
    "reset":    "\033[0m",
}


async def _stream_output(stream: asyncio.StreamReader, robot_id: str, label: str) -> None:
    color = _ANSI.get(robot_id, "")
    reset = _ANSI["reset"]
    prefix = f"{color}[{robot_id}]{reset}"
    async for line in stream:
        sys.stdout.write(f"{prefix} {line.decode(errors='replace').rstrip()}\n")
        sys.stdout.flush()


async def _spawn_bridge(robot, base_env: dict[str, str]) -> asyncio.subprocess.Process:
    episode_path = robot.episode
    if not os.path.isabs(episode_path):
        episode_path = str(_FLEET_ROOT / episode_path)

    keypair_path = os.path.expanduser(robot.keypair)

    env = {
        **base_env,
        "AUXIN_SOURCE": "video",
        "AUXIN_VIDEO_EPISODE_DIR": episode_path,
        "AUXIN_ROBOT_ID": robot.id,
        "HW_KEYPAIR_PATH": keypair_path,
        "BRIDGE_HEALTHZ_PORT": str(robot.bridge_http_port),
        "BRIDGE_WS_PORT": str(robot.bridge_ws_port),
        "AUXIN_PRIVACY": "direct",
        "PROMETHEUS_ENABLED": "false",
    }

    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        str(_BRIDGE_SCRIPT),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    log.info("bridge.spawned", robot_id=robot.id, pid=proc.pid, http_port=robot.bridge_http_port)
    return proc


async def _health_monitor(robot, proc: asyncio.subprocess.Process) -> None:
    url = f"http://localhost:{robot.bridge_http_port}/healthz"
    async with httpx.AsyncClient(timeout=3.0) as client:
        while True:
            await asyncio.sleep(5)
            if proc.returncode is not None:
                log.error(
                    "bridge.died",
                    robot_id=robot.id,
                    returncode=proc.returncode,
                )
                return
            try:
                resp = await client.get(url)
                log.info("bridge.health", robot_id=robot.id, status=resp.status_code)
            except Exception as exc:
                log.warning("bridge.health_unreachable", robot_id=robot.id, error=str(exc))


async def main() -> None:
    cfg = load_fleet_config()
    base_env = dict(os.environ)

    procs: list[asyncio.subprocess.Process] = []
    tasks: list[asyncio.Task] = []

    for robot in cfg.robots:
        proc = await _spawn_bridge(robot, base_env)
        procs.append(proc)

        tasks.append(asyncio.create_task(
            _stream_output(proc.stdout, robot.id, "stdout"),
            name=f"{robot.id}-stdout",
        ))
        tasks.append(asyncio.create_task(
            _stream_output(proc.stderr, robot.id, "stderr"),
            name=f"{robot.id}-stderr",
        ))
        tasks.append(asyncio.create_task(
            _health_monitor(robot, proc),
            name=f"{robot.id}-health",
        ))

    agg_config = uvicorn.Config(
        "aura_fleet.aggregator:app",
        host="0.0.0.0",
        port=cfg.aggregator.port,
        log_level="info",
    )
    agg_server = uvicorn.Server(agg_config)
    tasks.append(asyncio.create_task(agg_server.serve(), name="aggregator"))

    log.info("fleet.started", robots=[r.id for r in cfg.robots], aggregator_port=cfg.aggregator.port)

    loop = asyncio.get_running_loop()

    def _shutdown(sig: signal.Signals) -> None:
        log.info("fleet.shutdown_signal", signal=sig.name)
        for task in tasks:
            task.cancel()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _shutdown, sig)

    try:
        await asyncio.gather(*tasks, return_exceptions=True)
    finally:
        agg_server.should_exit = True
        for proc in procs:
            if proc.returncode is None:
                try:
                    proc.terminate()
                except ProcessLookupError:
                    pass

        await asyncio.sleep(3)

        for proc in procs:
            if proc.returncode is None:
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass

        log.info("fleet.stopped")


if __name__ == "__main__":
    asyncio.run(main())
