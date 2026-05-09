"""Entry point: ``python -m aura`` starts the FastAPI server with the voice loop."""

from __future__ import annotations

from collections.abc import AsyncIterator

import uvicorn
from openai import AsyncOpenAI

from .config import get_settings
from .server import app
from .voice import VoiceLoop


async def _openai_streaming_client(messages: list[dict]) -> AsyncIterator[str]:
    """Streaming reasoning client backed by OpenAI."""
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    stream = await client.chat.completions.create(
        model=settings.aura_reasoning_model,
        messages=messages,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


def main() -> None:
    settings = get_settings()
    voice_loop = VoiceLoop(
        reasoning_client=_openai_streaming_client,
        voice_id=settings.atlas_voice_id,
    )
    # Attach to app.state so the lifespan can pick it up.
    app.state.voice_loop = voice_loop
    uvicorn.run(app, host="0.0.0.0", port=settings.agent_port)


if __name__ == "__main__":
    main()
