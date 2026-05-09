"""VoiceLoop: Whisper -> reasoning model -> ElevenLabs streaming TTS.

Skeleton only. Real implementation lands here per the playbook P1.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field

SYSTEM_PROMPT = """You are Aura, the voice operations agent for an autonomous robot fleet.
The fleet has three Franka Emika Panda arms, each with its own Solana wallet.
You speak concisely. Two-sentence answers by default.
You never invent telemetry — if you don't have data, say so.
You confirm aloud before any action that costs money.
Your tone is calm, professional, slightly warm. You are not a chatbot;
you are a fleet operator's colleague."""


ReasoningClient = Callable[[list[dict]], AsyncIterator[str]]


@dataclass
class VoiceLoop:
    """Records mic, transcribes via Whisper, calls reasoning_client, streams TTS.

    Inject reasoning_client so AuraAgent (in agent.py) can swap in the
    tool-using version without subclass acrobatics.
    """

    reasoning_client: ReasoningClient
    voice_id: str
    system_prompt: str = SYSTEM_PROMPT
    history: list[dict] = field(default_factory=list)

    async def turn(self) -> tuple[str, str]:
        """Record one user turn, return (user_transcript, assistant_reply).

        TODO: implement record-until-silence, Whisper call, sentence-chunked TTS.
        """
        raise NotImplementedError("VoiceLoop.turn — implement per playbook P1")

    async def run(self) -> None:
        """Loop turn() until KeyboardInterrupt, broadcasting each turn over WS."""
        raise NotImplementedError("VoiceLoop.run — implement per playbook P1")
