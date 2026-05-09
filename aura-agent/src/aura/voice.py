"""VoiceLoop: mic -> Whisper -> reasoning_client -> sentence-chunked ElevenLabs TTS.

Per playbook P1. Chat-only loop here; tools come in P5; wiring in P9.
"""

from __future__ import annotations

import asyncio
import io
import re
import time
import wave
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

import anyio
import numpy as np
import sounddevice as sd
import structlog
from elevenlabs.client import AsyncElevenLabs
from openai import AsyncOpenAI

from .config import get_settings
from .server import publish_turn

log = structlog.get_logger()

SYSTEM_PROMPT = """You are Aura, the voice operations agent for an autonomous robot fleet.
The fleet has three Franka Emika Panda arms, each with its own Solana wallet.
You speak concisely. Two-sentence answers by default.
You never invent telemetry — if you don't have data, say so.
You confirm aloud before any action that costs money.
Your tone is calm, professional, slightly warm. You are not a chatbot;
you are a fleet operator's colleague."""


class ReasoningClient(Protocol):
    def __call__(self, messages: list[dict]) -> AsyncIterator[str]: ...


SAMPLE_RATE = 16_000
CHUNK_S = 0.1
SILENCE_THRESHOLD = 0.012
SILENCE_DURATION_S = 1.2
MAX_RECORDING_S = 30
SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
DIM = "\x1b[90m"
RESET = "\x1b[0m"


async def _record_until_silence() -> bytes:
    """Record from default mic until 1.2s of silence after voice; return 16kHz mono WAV."""
    chunk_size = int(SAMPLE_RATE * CHUNK_S)
    max_silence_chunks = int(SILENCE_DURATION_S / CHUNK_S)
    voiced = 0
    silent = 0
    chunks: list[np.ndarray] = []

    stream = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32")
    await anyio.to_thread.run_sync(stream.start)
    try:
        deadline = time.monotonic() + MAX_RECORDING_S
        while time.monotonic() < deadline:
            data, _ = await anyio.to_thread.run_sync(stream.read, chunk_size)
            chunks.append(data.copy())
            rms = float(np.sqrt(np.mean(data**2)))
            if rms > SILENCE_THRESHOLD:
                voiced += 1
                silent = 0
            elif voiced > 0:
                silent += 1
                if silent >= max_silence_chunks:
                    break
    finally:
        await anyio.to_thread.run_sync(stream.stop)
        await anyio.to_thread.run_sync(stream.close)

    audio = np.concatenate(chunks).flatten() if chunks else np.zeros(0, dtype=np.float32)
    pcm16 = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm16.tobytes())
    return buf.getvalue()


async def _transcribe_whisper(wav_bytes: bytes, client: AsyncOpenAI) -> str:
    resp = await client.audio.transcriptions.create(
        model="whisper-1",
        file=("turn.wav", wav_bytes, "audio/wav"),
    )
    return resp.text.strip()


async def _stream_tts(text: str, voice_id: str, client: AsyncElevenLabs) -> AsyncIterator[bytes]:
    """Yield 16kHz s16le PCM chunks for `text` from ElevenLabs."""
    stream = client.text_to_speech.stream(
        voice_id=voice_id,
        text=text,
        model_id="eleven_turbo_v2_5",
        output_format="pcm_16000",
    )
    async for chunk in stream:
        if chunk:
            yield chunk


def _open_speaker() -> sd.OutputStream:
    s = sd.OutputStream(samplerate=SAMPLE_RATE, channels=1, dtype="int16")
    s.start()
    return s


@dataclass
class VoiceLoop:
    """Records mic, transcribes via Whisper, calls reasoning_client, streams sentence-chunked TTS."""

    reasoning_client: ReasoningClient
    voice_id: str
    system_prompt: str = SYSTEM_PROMPT
    history: list[dict] = field(default_factory=list)

    async def turn(self) -> tuple[str, str]:
        settings = get_settings()
        oa = AsyncOpenAI(api_key=settings.openai_api_key)
        el = AsyncElevenLabs(api_key=settings.elevenlabs_api_key)

        wav = await _record_until_silence()
        record_end = time.monotonic()
        user_text = await _transcribe_whisper(wav, oa)

        messages: list[dict] = [
            {"role": "system", "content": self.system_prompt},
            *self.history,
            {"role": "user", "content": user_text},
        ]

        pcm_q: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=64)
        first_audio_ts: float | None = None
        last_audio_ts: float | None = None
        reply_parts: list[str] = []

        async def player() -> None:
            nonlocal first_audio_ts, last_audio_ts
            speaker = await anyio.to_thread.run_sync(_open_speaker)
            try:
                while True:
                    chunk = await pcm_q.get()
                    if chunk is None:
                        return
                    if first_audio_ts is None:
                        first_audio_ts = time.monotonic()
                    arr = np.frombuffer(chunk, dtype=np.int16)
                    await anyio.to_thread.run_sync(speaker.write, arr)
                    last_audio_ts = time.monotonic()
            finally:
                await anyio.to_thread.run_sync(speaker.stop)
                await anyio.to_thread.run_sync(speaker.close)

        async def synth_one(sentence: str) -> None:
            async for chunk in _stream_tts(sentence, self.voice_id, el):
                await pcm_q.put(chunk)

        async def producer() -> None:
            buffer = ""
            async with anyio.create_task_group() as synth_tg:
                async for token in self.reasoning_client(messages):
                    reply_parts.append(token)
                    buffer += token
                    while True:
                        m = SENTENCE_RE.search(buffer)
                        if not m:
                            break
                        sentence = buffer[: m.end()].strip()
                        buffer = buffer[m.end() :]
                        if sentence:
                            synth_tg.start_soon(synth_one, sentence)
                if buffer.strip():
                    synth_tg.start_soon(synth_one, buffer.strip())
            await pcm_q.put(None)

        async with anyio.create_task_group() as tg:
            tg.start_soon(player)
            tg.start_soon(producer)

        reply = "".join(reply_parts).strip()
        self.history.extend(
            [{"role": "user", "content": user_text}, {"role": "assistant", "content": reply}]
        )

        if first_audio_ts is not None and last_audio_ts is not None:
            print(
                f"{DIM}[latency: first-audio {first_audio_ts - record_end:.2f}s "
                f"| last-audio {last_audio_ts - record_end:.2f}s]{RESET}"
            )

        now = datetime.now(UTC).isoformat()
        await publish_turn({"type": "user_turn", "timestamp": now, "content": user_text})
        await publish_turn({"type": "assistant_turn", "timestamp": now, "content": reply})

        return user_text, reply

    async def run(self) -> None:
        try:
            while True:
                await self.turn()
        except (KeyboardInterrupt, asyncio.CancelledError):
            log.info("voice_loop.shutdown")
