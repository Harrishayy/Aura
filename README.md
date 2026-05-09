# Aura

Voice-native operations agent for an autonomous robot fleet. The operator surveys a factory-floor dashboard, clicks a robot, and speaks. Aura understands, queries the fleet, optionally pays for cloud inference from the selected robot's own Solana wallet (with verbal confirmation), logs every action on chain, and replies in voice.

See `AURA.pdf` for the full playbook.

## Workspaces

- **`aura-dashboard/`** — Next.js 14 + Tailwind + shadcn/ui. Factory floor + per-robot views + Aura transcript panel.
- **`aura-agent/`** — Python voice agent. Whisper → GPT-4o → ElevenLabs, five fleet-aware tools, confirmation flow.
- **`aura-fleet/`** — Python multi-bridge runner + fleet HTTP/WS aggregator. Replays Franka VLA episodes as live telemetry across three Auxin bridges.

## Prerequisites

- Node 20+ and pnpm 10+
- Python 3.11+
- [uv](https://docs.astral.sh/uv/) — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- (Optional) Solana CLI for on-chain registration
- (Optional) `Auxin_Automata/` checked out alongside this repo for the bridge + SDK

## Setup

```bash
pnpm install
pnpm install:py
cp .env.example .env  # then fill in API keys
```

## Run

```bash
pnpm dev
```

Boots three concurrent services:

| service | port | url |
| --- | --- | --- |
| dashboard | 3000 | http://localhost:3000 |
| agent (FastAPI + WS broadcaster) | 8770 | http://localhost:8770/healthz |
| fleet aggregator | 8780 | http://localhost:8780/fleet/status |

## Layout

```
aura/
├── docs/api_contract.md   # locked port + WS schema contract
├── aura-agent/            # Python: voice + tools
├── aura-fleet/            # Python: bridges + aggregator
└── aura-dashboard/        # Next.js
```
