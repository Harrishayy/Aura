# aura-agent — track T1

Voice loop + 5 fleet-aware tools + confirmation flow. Read root `../CLAUDE.md` first; this file only adds T1-specific rules.

## Layout

```
src/aura/
  voice.py          # P1: VoiceLoop class — mic → Whisper → reasoner → ElevenLabs TTS
  agent.py          # P9: AuraAgent(VoiceLoop) — adds tool dispatch + confirmation flow
  tools/
    __init__.py     # TOOLS registry (5 entries)
    fleet_client.py # httpx wrapper around aura-fleet aggregator (:8780)
    *.py            # one file per tool
scripts/
  run_aura.py       # entrypoint — anyio tasks, runs until SIGINT
tests/
  test_voice_smoke.py
```

## The 5 tools (locked in `docs/api_contract.md`)

| tool | cost | notes |
| --- | --- | --- |
| `get_fleet_status` | 0 | no `robot_id`; returns all |
| `get_recent_events` | 0 | `robot_id?`, `n?` |
| `investigate_anomaly` | **800_000 lamports** | the only paid tool — confirmation flow required |
| `generate_incident_report` | 0 | `robot_id?` (fleet-wide if absent) |
| `pause_robot` | 0 | `robot_id?` (all robots if absent) |

Every tool **must** log a compliance event on chain with `tool_name + args`. The on-chain log is ground truth. 5-second timeout per tool; on timeout return `ToolResult(success=False, reasoning="That timed out, want me to retry or skip?")`.

## Confirmation flow (the demo moment — do not break)

For any tool with `cost_lamports > 0`:

1. Do NOT execute the tool. Instead speak a confirmation prompt through TTS.
2. Record next user turn (max 5s).
3. Transcribe + classify intent:
   - regex `{yes, yeah, go, do it, proceed, confirm, sure}` → execute
   - regex `{no, stop, cancel, wait, hold}` → abort with `tool_result {aborted: true}`
   - ambiguous → one-shot **`gpt-4o-mini`** ("Does this utterance mean YES or NO? One word.") with 1s timeout. Default NO on timeout. (Playbook called for Claude Haiku 4.5; team swapped to OpenAI to avoid a second provider key. The redundancy pitch beat is sacrificed.)
4. Log both `confirmation_request` and `confirmation_resolved` as compliance events on chain.

The cost is **hardcoded per tool**. Never let the LLM parametrise the cost.

## Selected-robot ambient context

Subscribe to `ws://localhost:8780/selected`. When the dashboard sends `{ selected_robot_id: "robot_02" }`, inject `[CONTEXT] Operator now focused on robot robot_02.` as a system message. Tool calls without `robot_id` default to the selected robot.

## Latency targets (don't regress these)

- First-audio: <2.5s from end-of-recording.
- Last-audio: <5s for a 2-sentence reply.
- Print measured latency in dim grey after each turn so regressions are visible during dev.

If you can't hit these, do not add complexity — strip the pipeline. Sentence-chunked TTS is mandatory; never wait for the full reply before starting playback.

## Reasoning model

Aura's runtime model is **GPT-4o** with `tool_choice=auto`. Streaming tool-use loop: send → receive (may have `tool_calls`) → dispatch → append `tool` message → repeat until model returns final text. Stream final text through the TTS pipeline.

After every `tool_call`, before the next LLM turn, speak `tool_result.reasoning` aloud — keeps Aura responsive during slow tool calls.

## System prompt

Lives at the top of `agent.py`. Don't edit without coordinating — wording landed in the pitch.

```
You are Aura, the voice operations agent for an autonomous robot fleet of three Franka Emika Panda arms.
Each robot has its own Solana wallet and pays for its own cloud inference.
You have five tools: get_fleet_status, get_recent_events, investigate_anomaly, generate_incident_report, pause_robot.
Use them to answer questions truthfully. NEVER fabricate telemetry.
When a tool costs money, you MUST confirm verbally before calling it; the system handles the confirmation flow — just emit the tool_call normally.
The operator's currently-focused robot is provided in [CONTEXT] system messages; use it as the default robot_id.
Reply concisely; two sentences by default. Mention specific robot IDs when relevant.
```

## Don't

- Don't add a 6th tool. Don't add tool variants. Don't parametrise costs.
- Don't add new persistence layers. No conversation memory across restarts.
- Don't fall back to OpenAI `tts-1` proactively — only if ElevenLabs rate-limits at runtime.
- Don't replace Whisper with a self-hosted model.
- Don't write a Click/Typer CLI. `scripts/run_aura.py` is plain `if __name__ == "__main__"`.

## API keys

`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY` from `.env`. Crash loudly if missing — don't silently fall back.
