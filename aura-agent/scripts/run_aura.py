"""Boots the full Aura agent: server + voice + tools + selected-robot subscriber.

Loads .env, instantiates FleetClient + SelectedRobotContext + AuraAgent,
runs FastAPI server + voice loop + selected-WS subscriber as anyio tasks
until SIGINT.

Modes:
- default | --voice    full P9: voice + tools + confirmation flow
- --chat-only          text-only AuraAgent (stdin/stdout) — same tool loop,
                       same confirmation flow, no audio. Useful for testing.
- --server-only        just the FastAPI WS broadcaster (for dashboard dev)
"""

from __future__ import annotations

import argparse
import logging

import anyio
import structlog
import uvicorn

from aura.agent import AuraAgent, TextAgent
from aura.config import get_settings
from aura.tools.fleet_client import FleetClient, SelectedRobotContext

log = structlog.get_logger()


def _quiet_logs_for_chat() -> None:
    """Silence info/debug noise so the chat REPL prompt stays clean."""
    structlog.configure(
        wrapper_class=structlog.make_filtering_bound_logger(logging.WARNING),
    )


def _server(settings, log_level: str = "info") -> uvicorn.Server:
    config = uvicorn.Config(
        "aura.server:app",
        host="0.0.0.0",
        port=settings.agent_port,
        log_level=log_level,
    )
    return uvicorn.Server(config)


async def run_full_agent() -> None:
    settings = get_settings()
    selected = SelectedRobotContext()
    fleet = FleetClient(selected=selected)
    agent = AuraAgent(voice_id=settings.atlas_voice_id, fleet=fleet, selected=selected)

    server = _server(settings)
    try:
        async with anyio.create_task_group() as tg:
            tg.start_soon(server.serve)
            tg.start_soon(selected.run)
            tg.start_soon(agent.run)
    finally:
        await fleet.aclose()


async def run_text_agent() -> None:
    settings = get_settings()
    selected = SelectedRobotContext()
    fleet = FleetClient(selected=selected)
    agent = TextAgent(voice_id=settings.atlas_voice_id, fleet=fleet, selected=selected)

    server = _server(settings, log_level="warning")
    print("Aura text mode. Ctrl-C or empty line to quit.\n")
    try:
        async with anyio.create_task_group() as tg:
            tg.start_soon(server.serve)
            tg.start_soon(selected.run)
            tg.start_soon(agent.run)
    finally:
        await fleet.aclose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Aura agent.")
    parser.add_argument(
        "--voice",
        action="store_true",
        help="Alias for default: voice + tools + confirmation flow.",
    )
    parser.add_argument(
        "--chat-only",
        action="store_true",
        help="Text-only AuraAgent (stdin/stdout). No audio. Same tool loop + confirmation flow.",
    )
    parser.add_argument(
        "--server-only",
        action="store_true",
        help="Just the FastAPI WS broadcaster — no voice loop.",
    )
    args = parser.parse_args()

    if args.server_only:
        settings = get_settings()
        uvicorn.run(
            "aura.server:app",
            host="0.0.0.0",
            port=settings.agent_port,
            reload=True,
            log_level="info",
        )
        return

    if args.chat_only:
        _quiet_logs_for_chat()
        anyio.run(run_text_agent)
        return

    anyio.run(run_full_agent)


if __name__ == "__main__":
    main()
