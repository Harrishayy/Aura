"""Smoke test the voice loop without touching real APIs."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from unittest.mock import MagicMock

import pytest

from aura import voice
from aura.tools import TOOLS
from aura.voice import VoiceLoop


def test_tool_registry_has_five_tools() -> None:
    assert set(TOOLS.keys()) == {
        "get_fleet_status",
        "get_recent_events",
        "investigate_anomaly",
        "generate_incident_report",
        "pause_robot",
    }


def test_only_investigate_costs_sol() -> None:
    paid = [name for name, spec in TOOLS.items() if spec.cost_lamports > 0]
    assert paid == ["investigate_anomaly"]
    assert TOOLS["investigate_anomaly"].cost_lamports == 800_000


@pytest.mark.parametrize("name", list(TOOLS.keys()))
def test_each_tool_has_llm_schema(name: str) -> None:
    schema = TOOLS[name].schema_for_llm
    assert schema["type"] == "function"
    assert schema["function"]["name"] == name
    assert "parameters" in schema["function"]


@pytest.mark.asyncio
async def test_turn_returns_tuple_under_100ms(monkeypatch) -> None:
    async def fake_record() -> bytes:
        return b"WAVE"

    async def fake_transcribe(wav: bytes, client) -> str:
        return "what is the fleet status"

    async def fake_tts(text: str, voice_id: str, client) -> AsyncIterator[bytes]:
        yield b"\x00\x01" * 16
        yield b"\x02\x03" * 16

    speaker = MagicMock()
    speaker.write = MagicMock()
    speaker.stop = MagicMock()
    speaker.close = MagicMock()

    monkeypatch.setattr(voice, "_record_until_silence", fake_record)
    monkeypatch.setattr(voice, "_transcribe_whisper", fake_transcribe)
    monkeypatch.setattr(voice, "_stream_tts", fake_tts)
    monkeypatch.setattr(voice, "_open_speaker", lambda: speaker)
    monkeypatch.setattr(voice, "AsyncOpenAI", lambda **_: MagicMock())
    monkeypatch.setattr(voice, "AsyncElevenLabs", lambda **_: MagicMock())

    async def fake_reasoning(messages):
        for token in ["All ", "three ", "robots ", "are ", "healthy.", " Standing ", "by."]:
            yield token

    loop = VoiceLoop(reasoning_client=fake_reasoning, voice_id="test-voice")

    start = time.monotonic()
    user, assistant = await loop.turn()
    elapsed = time.monotonic() - start

    assert isinstance(user, str) and user
    assert isinstance(assistant, str) and assistant
    assert "healthy" in assistant
    assert elapsed < 0.1, f"turn() took {elapsed:.3f}s, expected <0.1s"
    assert len(loop.history) == 2
    assert loop.history[0] == {"role": "user", "content": user}
    assert loop.history[1] == {"role": "assistant", "content": assistant}
