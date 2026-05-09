# aura-fleet

Three Auxin bridges in parallel, each replaying a real Franka Emika Panda VLA episode as live telemetry. A FastAPI aggregator on `:8780` exposes the fleet endpoints from `../docs/api_contract.md` to the dashboard and the agent.

## Run

```bash
uv sync
uv run python scripts/run_fleet.py
```

The aggregator boots immediately. Spawning three real Auxin bridge subprocesses requires `Auxin_Automata/` checked out alongside this repo and the `auxin-sdk` path-dep uncommented in `pyproject.toml`.

## Layout

```
src/aura_fleet/
├── aggregator.py       # FastAPI on :8780 (/fleet/status, WS /fleet, WS /selected)
├── video_source.py     # VideoSource(TelemetrySource) skeleton — real impl in Auxin SDK
└── config.py
scripts/
├── run_fleet.py        # spawns 3 bridges + aggregator
├── register_robots.py  # on-chain initialize_agent for each robot
└── smoke_video_source.py
fixtures/
└── episodes/{robot_01,robot_02,robot_03}/  # VLA episode replays
fleet.yaml              # 3 robots, ports, keypair paths, episode dirs
```
