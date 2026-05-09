"""Boots the Aura voice agent.

Default: FastAPI server only (healthz + WS broadcaster on :8770) so the
dashboard's AuraConversation panel has something to subscribe to.

`--voice`: also runs a chat-only VoiceLoop (Whisper -> GPT-4o -> ElevenLabs)
in-process for P1 end-of-block validation. Tools + confirmation flow
land in agent.py per playbook P9.
"""

from __future__ import annotations

import argparse
from collections.abc import AsyncIterator

import anyio
import structlog
import uvicorn
from openai import AsyncOpenAI

from aura.config import get_settings
from aura.voice import VoiceLoop

log = structlog.get_logger()


async def gpt4o_text_stream(messages: list[dict]) -> AsyncIterator[str]:
    """Plain GPT-4o streaming, no tools. P9 replaces this with a tool-using client."""
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    stream = await client.chat.completions.create(
        model=settings.aura_reasoning_model,
        messages=messages,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta


async def serve_with_voice() -> None:
    settings = get_settings()
    config = uvicorn.Config(
        "aura.server:app", host="0.0.0.0", port=settings.agent_port, log_level="info"
    )
    server = uvicorn.Server(config)
    loop = VoiceLoop(reasoning_client=gpt4o_text_stream, voice_id=settings.atlas_voice_id)

    async with anyio.create_task_group() as tg:
        tg.start_soon(server.serve)
        tg.start_soon(loop.run)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Aura agent.")
    parser.add_argument(
        "--voice",
        action="store_true",
        help="Also run an in-process chat-only VoiceLoop (P1 validation).",
    )
    args = parser.parse_args()

    if args.voice:
        anyio.run(serve_with_voice)
        return

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
