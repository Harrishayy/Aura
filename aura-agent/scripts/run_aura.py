"""Boots the Aura voice agent.

For now this just runs the FastAPI server (healthz + WS broadcaster on :8770)
so the dashboard's AuraConversation panel has something to subscribe to.
The full voice loop wiring lands in src/aura/agent.py per playbook P9.
"""

from __future__ import annotations

import uvicorn

from aura.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "aura.server:app",
        host="0.0.0.0",
        port=settings.agent_port,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    main()
