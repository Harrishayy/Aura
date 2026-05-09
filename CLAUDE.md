# Aura — agent guidance (root)

This file is loaded by every collaborator's Claude. **Source of truth is `AURA.pdf`** (the Prompt Engineering Playbook) and **`docs/api_contract.md`** (the locked interface). When this file disagrees with either, those win — update this file.

Aura is a voice-native operations agent for a fleet of three Franka Emika Panda arms, each with its own Solana wallet on devnet. Built in a 4-hour hackathon by a 4-person team. Demo at 16:00.

## Workspaces & track ownership

| dir | track | owner-domain | language |
| --- | --- | --- | --- |
| `aura-agent/` | T1 | voice loop + 5 tools + confirmation flow | Python 3.11 (uv) |
| `aura-fleet/` | T2 | VideoSource + multi-bridge runner + HTTP/WS aggregator | Python 3.11 (uv) |
| `aura-dashboard/` | T3 | Next.js 14 factory floor + per-robot view + transcript panel | TypeScript (pnpm) |
| `docs/` + identity | T4 | api_contract, on-chain registration, pitch, run sheet | — |

Each workspace has its own `CLAUDE.md` with track-specific rules. Read it before editing inside that workspace.

## Hard constraints (every track)

These are non-negotiable. Pushing back on the user is correct if asked to violate one.

1. **Auxin Automata is immutable infrastructure.** The only allowed change is adding `sdk/src/auxin_sdk/sources/video.py` (a new file) and a 5-line factory addition to `run_bridge.py` for `AUXIN_SOURCE=video`. Do not refactor `bridge.py`. Do not add new Solana instructions — every on-chain action uses the existing program.
2. **`docs/api_contract.md` is the locked contract.** Don't change port numbers, tool shapes, WS message schemas, or endpoint paths without the user explicitly approving a contract bump.
3. **Three robots, not N.** No generalization to arbitrary fleet sizes. `robot_01`, `robot_02`, `robot_03` are hardcoded everywhere.
4. **No new files outside the playbook scope.** Don't invent README polish, additional docs, helper scripts, or "cleanup" PRs. The playbook lists every file we ship.
5. **After 15:45 on demo day: no code changes.** Whatever works at 15:45 ships. If the user asks for a "quick fix" after that point, push back and propose a Plan B from `docs/run_sheet.md` instead.

## Anti-goals — what Aura explicitly does NOT do

Stating these aloud in the pitch is a strength. Don't drift into them mid-build:

- No live camera, no vision tool. Aura is voice + telemetry only.
- No persistent conversation memory across restarts.
- No streaming voice cloning. Hardcoded ElevenLabs voice ID.
- No self-hosted Whisper. OpenAI API only.
- No real-time video sync to telemetry. 1–2s drift is fine.
- No fleet-size generalization, no auth layer, no production hardening, no Dockerfile.

If a teammate's prompt drifts toward any of these, flag it.

## Architecture (one-line per hop)

```
Aura voice agent (8770) ──── tools ──── Fleet aggregator (8780) ──── 3× Auxin bridges ──── Solana devnet
       │                                       │
       └──── WS /aura ──┐         ┌── WS /fleet ──┘
                        ▼         ▼
                 Dashboard (3000)
                        │
                        └── WS /selected ──→ agent (ambient context)
```

Ports are locked in `docs/api_contract.md`. The dashboard polls `/fleet/status` and subscribes to `/fleet`; the agent subscribes to `/selected` for the operator's currently-focused robot.

## Sync points (Saturday)

| time | what locks |
| --- | --- |
| 12:30 | Sync 1 — API contracts. Done. See `docs/api_contract.md`. |
| 13:30 | Sync 2 — fleet endpoint URLs published; dashboard hardcodes them. |
| 14:30 | Sync 3 — integration. Agent ↔ live fleet. Dashboard ↔ live fleet. |
| 15:30 | Sync 4 — dress rehearsal. T4 leads. |
| 15:45 | **Hard freeze.** No code changes after this. |

Do not propose interface changes that miss a sync window. If a track is blocked on another, surface it loudly rather than working around it.

## Triage under time pressure (from playbook §9)

Apply these proactively when a track is behind — don't wait to be asked:

- **T1 behind at 14:30** → drop the proactive watcher; reactive-only is fine.
- **T1 behind at 15:15** → keep the confirmation flow if at all possible (it's the demo moment).
- **T2 behind at 14:00** → ship 2 robots; T4 adjusts pitch.
- **T2 OOM** → drop privacy providers, kill Prometheus, set `rate_hz=5`. Then drop to 2 robots.
- **T3 behind at 14:30** → ship factory floor only; demo by hovering, no click-through.
- **T3 behind at 15:00** → skip the persistent transcript panel; demo via terminal stdout.
- **Auxin breaks at venue** → fall back to pre-recorded Friday integration clip.

## Model selection (per playbook Appendix A)

When the user asks "what model should I use for this prompt?", default to:

- **Sonnet 4.6** — boilerplate, integration code, React/Tailwind, schema work, WS plumbing. (P1, P3, P4, P5, P6, P7, P10, etc.)
- **Opus 4.7** — fiddly reasoning: timestamp alignment (P2 VideoSource), wiring + confirmation flow (P9), pitch prose (P8).
- **Haiku 4.5** — Aura's runtime confirmation classifier only (one-word YES/NO, 1s budget).
- **GPT-4o** — Aura's runtime reasoning model (sponsor credits, mature streaming tool-use). Not for code generation.

## Style & code

- Follow whatever conventions are already in the file you're editing. Don't introduce new patterns.
- Don't add comments explaining what code does. Don't write multi-line docstrings unless the playbook explicitly asks for one.
- Don't add `try/except` for failures that won't happen. Trust the contract.
- Numerics in dashboards: JetBrains Mono. Headings: Inter. No gradients, no glow, no shadows beyond shadcn defaults.
- Latency target for the voice loop: <2.5s first-audio, <5s last-audio for a 2-sentence reply.

## When in doubt

1. Read the relevant `P{n}` block in `AURA.pdf` — every prompt is scoped to one developer-hour.
2. Check `docs/api_contract.md` for the interface.
3. Ask the user — better a 30-second clarification than 30 minutes of wrong direction.
