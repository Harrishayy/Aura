# aura-agent

Python voice agent. Whisper → reasoning model → ElevenLabs streaming TTS, with five fleet-aware tools and a verbal confirmation flow for any tool that costs SOL.

## Run

```bash
uv sync
uv run python scripts/run_aura.py
```

The agent's FastAPI server boots on `:8770` with `/healthz` and a WS broadcaster at `/aura` for the dashboard transcript panel.

## Layout

```
src/aura/
├── voice.py              # VoiceLoop: mic <-> Whisper <-> reasoning <-> ElevenLabs
├── agent.py              # AuraAgent: voice + tools + confirmation flow
├── server.py             # FastAPI: /healthz + WS /aura broadcaster
├── config.py             # env loading
└── tools/
    ├── __init__.py       # TOOLS registry
    ├── fleet_client.py   # httpx wrapper for the fleet aggregator
    ├── fleet_status.py
    ├── compliance.py
    ├── investigate.py    # the only tool that costs SOL
    ├── report.py
    └── pause.py
```

See `../docs/api_contract.md` for the locked WS / tool / endpoint contract.
