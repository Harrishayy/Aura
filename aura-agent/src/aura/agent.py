"""AuraAgent: voice + tools + verbal confirmation flow.

Skeleton only. The confirmation flow (the demo's signature moment) is implemented
per playbook P9 — before dispatching any tool with cost_lamports > 0, the agent
speaks a confirmation prompt and waits for verbal yes/no.
"""

from __future__ import annotations

from dataclasses import dataclass

from .voice import VoiceLoop


@dataclass
class AuraAgent:
    """Voice loop + tool-use orchestration.

    NOTE: not a subclass — composes VoiceLoop so the reasoning client can be
    swapped without touching the audio path.
    """

    voice_loop: VoiceLoop

    async def run(self) -> None:
        raise NotImplementedError("AuraAgent.run — implement per playbook P9")
