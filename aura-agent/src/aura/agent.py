"""AuraAgent: voice + tools + verbal confirmation flow.

Per playbook P9. Reuses voice.py's audio helpers; adds tool-using GPT-4o
reasoning, the confirmation flow for paid tools (Haiku 4.5 fallback classifier),
selected-robot ambient context, and dashboard broadcasting.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime

import anyio
import httpx
import numpy as np
import structlog
from elevenlabs.client import AsyncElevenLabs
from openai import APIError as OpenAIAPIError
from openai import AsyncOpenAI

from .config import get_settings
from .server import publish_turn
from .tools import TOOLS, ToolResult
from .tools.fleet_client import FleetClient, SelectedRobotContext
from .voice import (
    DIM,
    RESET,
    SENTENCE_RE,
    _open_speaker,
    _record_until_silence,
    _stream_tts,
    _transcribe_whisper,
)

log = structlog.get_logger()


SYSTEM_PROMPT = """You are Aura, the voice operations agent for an autonomous robot fleet of three Franka Emika Panda arms.
Each robot has its own Solana wallet and pays for its own cloud inference.
You have five tools: get_fleet_status, get_recent_events, investigate_anomaly, generate_incident_report, pause_robot.
Use them to answer questions truthfully. NEVER fabricate telemetry.
When a tool costs money, you MUST confirm verbally before calling it; the system handles the confirmation flow — just emit the tool_call normally.
The operator's currently-focused robot is provided in [CONTEXT] system messages; use it as the default robot_id.
Reply concisely; two sentences by default. Mention specific robot IDs when relevant."""


YES_RE = re.compile(r"\b(yes|yeah|yep|go|do it|proceed|confirm|sure)\b", re.I)
NO_RE = re.compile(r"\b(no|nope|stop|cancel|wait|hold|abort)\b", re.I)

CONFIRMATION_TEMPLATES = {
    "investigate_anomaly": (
        "That call to GPT-4o for anomaly diagnosis will cost about half a cent of SOL. Proceed?"
    ),
}

MAX_TOOL_HOPS = 8
CONFIRMATION_RECORD_S = 5.0
CLASSIFIER_TIMEOUT_S = 1.0
CLASSIFIER_MODEL = "gpt-4o-mini"  # one-word yes/no classifier (playbook called for Haiku 4.5; using OpenAI to avoid a second provider key)


def _format_confirmation(tool_name: str, cost_lamports: int) -> str:
    template = CONFIRMATION_TEMPLATES.get(tool_name)
    if template:
        return template
    return f"That call costs {cost_lamports / 1_000_000_000:.4f} SOL. Proceed?"


def _serialise_tool_calls(msg) -> dict:
    return {
        "role": "assistant",
        "content": msg.content or "",
        "tool_calls": [
            {
                "id": tc.id,
                "type": "function",
                "function": {"name": tc.function.name, "arguments": tc.function.arguments},
            }
            for tc in msg.tool_calls
        ],
    }


@dataclass
class AuraAgent:
    """Voice + tools + confirmation flow.

    Reuses voice.py helpers directly rather than subclassing VoiceLoop — the
    tool-loop overrides the entire turn() pipeline so VoiceLoop's chat-only
    turn() would be dead weight.
    """

    voice_id: str
    fleet: FleetClient
    selected: SelectedRobotContext | None = None
    system_prompt: str = SYSTEM_PROMPT
    history: list[dict] = field(default_factory=list)

    async def run(self) -> None:
        try:
            while True:
                await self.turn()
        except (KeyboardInterrupt, asyncio.CancelledError):
            log.info("aura_agent.shutdown")

    async def turn(self) -> tuple[str, str]:
        settings = get_settings()
        oa = AsyncOpenAI(api_key=settings.openai_api_key)
        el = AsyncElevenLabs(api_key=settings.elevenlabs_api_key)

        wav = await _record_until_silence()
        record_end = time.monotonic()
        user_text = await _transcribe_whisper(wav, oa)
        await self._broadcast({"type": "user_turn", "content": user_text})

        messages = self._build_messages(user_text)
        final_reply = await self._tool_loop(messages, oa, el, record_end)

        self.history.extend(
            [
                {"role": "user", "content": user_text},
                {"role": "assistant", "content": final_reply},
            ]
        )
        await self._broadcast({"type": "assistant_turn", "content": final_reply})
        return user_text, final_reply

    def _build_messages(self, user_text: str) -> list[dict]:
        sel = self.selected.current() if self.selected else None
        msgs: list[dict] = [{"role": "system", "content": self.system_prompt}]
        if sel:
            msgs.append(
                {"role": "system", "content": f"[CONTEXT] Operator now focused on robot {sel}."}
            )
        msgs.extend(self.history)
        msgs.append({"role": "user", "content": user_text})
        return msgs

    def _inject_default_robot_id(self, args: dict) -> dict:
        if args.get("robot_id"):
            return args
        if self.selected and self.selected.current():
            return {**args, "robot_id": self.selected.current()}
        return args

    async def _tool_loop(
        self,
        messages: list[dict],
        oa: AsyncOpenAI,
        el: AsyncElevenLabs,
        record_end: float,
    ) -> str:
        tools_spec = [t.schema_for_llm for t in TOOLS.values()]

        for _ in range(MAX_TOOL_HOPS):
            resp = await oa.chat.completions.create(
                model=get_settings().aura_reasoning_model,
                messages=messages,
                tools=tools_spec,
                tool_choice="auto",
            )
            msg = resp.choices[0].message

            if not msg.tool_calls:
                final = (msg.content or "").strip()
                messages.append({"role": "assistant", "content": final})
                await self._stream_speech(final, el, record_end)
                return final

            messages.append(_serialise_tool_calls(msg))
            for tc in msg.tool_calls:
                name = tc.function.name
                args = self._inject_default_robot_id(json.loads(tc.function.arguments or "{}"))
                spec = TOOLS.get(name)

                await self._broadcast(
                    {
                        "type": "tool_call",
                        "content": f"{name}({json.dumps(args, default=str)})",
                        "tool_name": name,
                        "tool_args": args,
                        "cost_lamports": spec.cost_lamports if spec else 0,
                    }
                )

                if spec is None:
                    result = ToolResult(
                        tool_name=name, success=False, reasoning=f"Unknown tool {name}."
                    )
                    aborted = False
                elif spec.cost_lamports > 0:
                    confirmed = await self._confirm(
                        name, spec.cost_lamports, args, oa, el
                    )
                    if not confirmed:
                        result = ToolResult(
                            tool_name=name,
                            success=False,
                            cost_lamports=spec.cost_lamports,
                            robot_id=args.get("robot_id"),
                            reasoning="Cancelled.",
                        )
                        aborted = True
                    else:
                        result = await self._safe_dispatch(name, spec, args)
                        aborted = False
                else:
                    result = await self._safe_dispatch(name, spec, args)
                    aborted = False

                content = (
                    json.dumps({"aborted": True})
                    if aborted
                    else json.dumps(result.model_dump(mode="json"), default=str)
                )
                messages.append(
                    {"role": "tool", "tool_call_id": tc.id, "content": content}
                )

                await self._broadcast(
                    {
                        "type": "tool_result",
                        "content": result.reasoning or "",
                        "tool_name": name,
                        "tool_args": args,
                        "tool_result": result.model_dump(mode="json"),
                        "cost_lamports": result.cost_lamports,
                        "tx_signature": result.tx_signature,
                    }
                )
                if result.reasoning:
                    await self._narrate(result.reasoning, el)

        return "I'm stuck in a tool loop, want to try again?"

    async def _safe_dispatch(self, name: str, spec, args: dict) -> ToolResult:
        """Run a tool handler; convert network/handler failures into a ToolResult so the loop continues."""
        try:
            return await spec.handler(args, self.fleet)
        except httpx.HTTPError as exc:
            log.warning("tool.network_error", tool=name, error=str(exc))
            return ToolResult(
                tool_name=name,
                success=False,
                cost_lamports=spec.cost_lamports,
                robot_id=args.get("robot_id"),
                reasoning="The fleet aggregator isn't responding. Is the fleet running on port 8780?",
            )
        except Exception as exc:  # noqa: BLE001 — last-resort safety net so the agent doesn't die mid-conversation
            log.warning("tool.exception", tool=name, error=str(exc))
            return ToolResult(
                tool_name=name,
                success=False,
                cost_lamports=spec.cost_lamports,
                robot_id=args.get("robot_id"),
                reasoning=f"Tool {name} failed: {exc}",
            )

    async def _confirm(
        self,
        tool_name: str,
        cost_lamports: int,
        args: dict,
        oa: AsyncOpenAI,
        el: AsyncElevenLabs,
    ) -> bool:
        prompt = _format_confirmation(tool_name, cost_lamports)
        scope = args.get("robot_id") or "fleet"

        await self.fleet.trigger_compliance_log(
            scope,
            {"tool_name": "confirmation_request", "for_tool": tool_name, "args": args},
        )
        await self._broadcast(
            {
                "type": "tool_call",
                "content": prompt,
                "tool_name": "confirmation_request",
                "tool_args": {"for_tool": tool_name},
                "cost_lamports": cost_lamports,
            }
        )

        await self._narrate(prompt, el)

        wav = await _record_until_silence(max_s=CONFIRMATION_RECORD_S)
        utterance = await _transcribe_whisper(wav, oa)
        log.info("confirmation.utterance", text=utterance, for_tool=tool_name)

        decision = self._classify_yes_no_regex(utterance)
        if decision == "ambiguous":
            decision = await self._classify_yes_no_llm(utterance, oa)

        await self.fleet.trigger_compliance_log(
            scope,
            {
                "tool_name": "confirmation_resolved",
                "for_tool": tool_name,
                "decision": decision,
                "utterance": utterance,
            },
        )
        await self._broadcast(
            {
                "type": "tool_result",
                "content": f"Decision: {decision}",
                "tool_name": "confirmation_resolved",
                "tool_args": {"for_tool": tool_name},
                "tool_result": {"decision": decision, "utterance": utterance},
            }
        )
        return decision == "yes"

    @staticmethod
    def _classify_yes_no_regex(utterance: str) -> str:
        yes_hit = bool(YES_RE.search(utterance))
        no_hit = bool(NO_RE.search(utterance))
        if yes_hit and not no_hit:
            return "yes"
        if no_hit and not yes_hit:
            return "no"
        return "ambiguous"

    async def _classify_yes_no_llm(self, utterance: str, oa: AsyncOpenAI) -> str:
        try:
            with anyio.fail_after(CLASSIFIER_TIMEOUT_S):
                resp = await oa.chat.completions.create(
                    model=CLASSIFIER_MODEL,
                    max_tokens=4,
                    messages=[
                        {
                            "role": "user",
                            "content": (
                                f"Does this utterance mean YES or NO? Reply with one word.\n\n{utterance}"
                            ),
                        }
                    ],
                )
        except (TimeoutError, OpenAIAPIError) as exc:
            log.warning("classifier.failed", error=str(exc))
            return "no"

        text = (resp.choices[0].message.content or "").strip().lower()
        if "yes" in text:
            return "yes"
        return "no"

    async def _narrate(self, text: str, el: AsyncElevenLabs) -> None:
        text = text.strip()
        if not text:
            return
        speaker = await anyio.to_thread.run_sync(_open_speaker)
        try:
            async for chunk in _stream_tts(text, self.voice_id, el):
                arr = np.frombuffer(chunk, dtype=np.int16)
                await anyio.to_thread.run_sync(speaker.write, arr)
        finally:
            await anyio.to_thread.run_sync(speaker.stop)
            await anyio.to_thread.run_sync(speaker.close)

    async def _stream_speech(
        self, text: str, el: AsyncElevenLabs, record_end: float
    ) -> None:
        text = text.strip()
        if not text:
            return
        sentences = [s.strip() for s in SENTENCE_RE.split(text) if s.strip()] or [text]

        first_audio_ts: float | None = None
        last_audio_ts: float | None = None
        speaker = await anyio.to_thread.run_sync(_open_speaker)
        try:
            for sentence in sentences:
                async for chunk in _stream_tts(sentence, self.voice_id, el):
                    if first_audio_ts is None:
                        first_audio_ts = time.monotonic()
                    arr = np.frombuffer(chunk, dtype=np.int16)
                    await anyio.to_thread.run_sync(speaker.write, arr)
                    last_audio_ts = time.monotonic()
        finally:
            await anyio.to_thread.run_sync(speaker.stop)
            await anyio.to_thread.run_sync(speaker.close)

        if first_audio_ts is not None and last_audio_ts is not None:
            print(
                f"{DIM}[latency: first-audio {first_audio_ts - record_end:.2f}s "
                f"| last-audio {last_audio_ts - record_end:.2f}s]{RESET}"
            )

    async def _broadcast(self, payload: dict) -> None:
        msg = {
            "timestamp": datetime.now(UTC).isoformat(),
            **{k: v for k, v in payload.items() if v is not None},
        }
        await publish_turn(msg)


class TextAgent(AuraAgent):
    """Text-mode AuraAgent: stdin/stdout instead of mic/TTS.

    Same tool loop, same confirmation flow, same on-chain logging — only the
    I/O is swapped. Useful for testing P9 end-to-end without audio hardware.
    """

    async def turn(self) -> tuple[str, str]:
        settings = get_settings()
        oa = AsyncOpenAI(api_key=settings.openai_api_key)

        user_text = await self._read_line("you > ")
        if not user_text:
            return "", ""
        await self._broadcast({"type": "user_turn", "content": user_text})

        messages = self._build_messages(user_text)
        final_reply = await self._tool_loop(messages, oa, el=None, record_end=time.monotonic())

        self.history.extend(
            [
                {"role": "user", "content": user_text},
                {"role": "assistant", "content": final_reply},
            ]
        )
        await self._broadcast({"type": "assistant_turn", "content": final_reply})
        return user_text, final_reply

    @staticmethod
    async def _read_line(prompt: str) -> str:
        try:
            line = await anyio.to_thread.run_sync(input, prompt)
        except EOFError as exc:
            raise KeyboardInterrupt from exc
        return line.strip()

    async def _narrate(self, text: str, el) -> None:
        if text.strip():
            print(f"  [aura] {text.strip()}")

    async def _stream_speech(self, text: str, el, record_end: float) -> None:
        if text.strip():
            print(f"aura > {text.strip()}")

    async def _confirm(
        self,
        tool_name: str,
        cost_lamports: int,
        args: dict,
        oa: AsyncOpenAI,
        el,
    ) -> bool:
        prompt = _format_confirmation(tool_name, cost_lamports)
        scope = args.get("robot_id") or "fleet"

        await self.fleet.trigger_compliance_log(
            scope,
            {"tool_name": "confirmation_request", "for_tool": tool_name, "args": args},
        )
        await self._broadcast(
            {
                "type": "tool_call",
                "content": prompt,
                "tool_name": "confirmation_request",
                "tool_args": {"for_tool": tool_name},
                "cost_lamports": cost_lamports,
            }
        )

        print(f"\naura > {prompt}")
        utterance = await self._read_line("you > ")
        log.info("confirmation.utterance", text=utterance, for_tool=tool_name)

        decision = self._classify_yes_no_regex(utterance)
        if decision == "ambiguous":
            decision = await self._classify_yes_no_llm(utterance, oa)

        await self.fleet.trigger_compliance_log(
            scope,
            {
                "tool_name": "confirmation_resolved",
                "for_tool": tool_name,
                "decision": decision,
                "utterance": utterance,
            },
        )
        await self._broadcast(
            {
                "type": "tool_result",
                "content": f"Decision: {decision}",
                "tool_name": "confirmation_resolved",
                "tool_args": {"for_tool": tool_name},
                "tool_result": {"decision": decision, "utterance": utterance},
            }
        )
        return decision == "yes"
