# aura-fleet — track T2

VideoSource for Franka VLA episodes + multi-bridge runner + HTTP/WS aggregator. Read root `../CLAUDE.md` first; this file only adds T2-specific rules.

## Layout

```
src/aura_fleet/
  aggregator.py             # aiohttp/FastAPI server on :8780 — implements the locked contract
fixtures/episodes/
  robot_01/  robot_02/  robot_03/   # each: cameras/, robot.jsonl, episode_events.jsonl, etc.
  SCHEMA.md                 # the dataset contract — read this before touching VideoSource
fleet.yaml                  # fleet config (3 robots, ports, episode dirs, keypair paths)
scripts/
  run_fleet.py              # spawns 3 bridges + aggregator
  smoke_video_source.py
  register_robots.py        # T4 — on-chain registration via Auxin's initialize_agent
```

The `VideoSource` class lives in **`Auxin_Automata/sdk/src/auxin_sdk/sources/video.py`** (NOT in this workspace). That is the one file in Auxin we're allowed to add. Path-dependency is wired in `pyproject.toml`.

## Auxin is immutable — the one rule

Beyond adding `video.py` to the SDK, the **only** allowed change to Auxin is a 5-line factory addition in `run_bridge.py` to support `AUXIN_SOURCE=video`. If you find yourself rewriting `bridge.py`, **stop and reconsider**. The aggregator (`aura-fleet/src/aura_fleet/aggregator.py`) is where new logic goes.

## Port assignments (locked in `docs/api_contract.md`)

| service | HTTP | WS |
| --- | --- | --- |
| aggregator | 8780 | 8780 (`/fleet`, `/selected`) |
| bridge robot_01 | 8767 | 8766 |
| bridge robot_02 | 8768 | 8771 |
| bridge robot_03 | 8769 | 8772 |

## Aggregator endpoints (every one is in the contract)

- `GET /fleet/status` — joins per-bridge `/healthz` with metadata from `aura-dashboard/public/robot_metadata/`.
- `GET /robot/{id}/status` — single-robot block.
- `GET /robot/{id}/recent_events?n=N` — queries Solana **directly** for ComplianceEvents emitted by that robot's agent PDA. Bridges don't expose this. Use `solana-py` + `parseProgramLogs`.
- `POST /robot/{id}/inject_anomaly` — writes `/tmp/aura_inject_{robot_id}` sentinel. The VideoSource picks it up on the next tick, adds `injected_anomaly` to `anomaly_flags`, and deletes the file.
- `POST /robot/{id}/pause` — writes `/tmp/aura_pause_{robot_id}`. The VideoSource freezes on the current frame while the file exists.
- `GET /robot/{id}/identity` — proxies the static metadata JSON from the dashboard.
- `WS /fleet` — multiplexes telemetry/compliance/payment events from all 3 bridge WS streams. Each message tagged with `robot_id`.

## VideoSource — the fiddly bits

(Use **Opus 4.7** when authoring or modifying this — timestamp alignment is where things break.)

1. Load `robot.jsonl` into memory at startup — small enough (6000 rows for 60s @ 100Hz).
2. Resample from source rate to `rate_hz` (default 10): pick the row whose timestamp is closest to current episode time.
3. Joint count: Franka is 7-DOF but Auxin's existing `TelemetryFrame` may expect 6 — drop joint 7 or pad. Flag in code with a `TODO` if the schemas differ; don't silently mismatch.
4. Anomaly mapping: maintain a pointer into `episode_events.jsonl`. Events whose type is in `{gripper_slip, collision, joint_torque_spike, anomaly, error}` get appended to `anomaly_flags` for the matching tick. All other event types (`pick_started`, `pick_completed`, etc.) are ignored.
5. `loop=True` for demo (30+ minutes runtime). On loop restart, log a `loop_restart` structlog event.
6. Use `anyio.sleep`, never `time.sleep`.

`fixtures/episodes/SCHEMA.md` is the contract between VideoSource and downstream consumers. Read it; don't guess.

## Multi-bridge runner — `scripts/run_fleet.py`

- Spawns 3 bridges via `asyncio.create_subprocess_exec` with env vars (`AUXIN_SOURCE=video`, `AUXIN_VIDEO_EPISODE_DIR`, `HW_KEYPAIR_PATH`, `BRIDGE_HEALTHZ_PORT`, `BRIDGE_WS_PORT`, `AUXIN_PRIVACY=direct`, `PROMETHEUS_ENABLED=false`).
- Stream subprocess stdout/stderr with `[robot_01]`, `[robot_02]`, `[robot_03]` colored prefixes.
- Health-poll each bridge every 5s. If one dies, log and continue — other robots stay up.
- Graceful SIGINT shutdown of all children.

## RAM discipline — 16GB laptop must not OOM

If memory is tight (in this order):
1. `AUXIN_PRIVACY=direct` (no privacy providers).
2. `PROMETHEUS_ENABLED=false` (kill metrics).
3. `rate_hz=5` instead of 10.
4. Drop to 2 robots (and tell T4 — pitch script must adjust).

## Don't

- Don't expose `recent_events` through the bridges. Go to chain directly from the aggregator.
- Don't proxy bridge WS streams 1:1 — multiplex them with `robot_id` tags into `WS /fleet`.
- Don't add new privacy or compliance providers; use existing Auxin ones.
- Don't add a database. State lives on chain or in `/tmp` sentinel files.
- Don't generalise to N robots.

## End-of-block validation (P6)

`run_fleet.py` starts cleanly → `GET /fleet/status` returns 3 healthy robots → `WS /fleet` streams telemetry from all 3 → `POST /robot/robot_02/inject_anomaly` causes a compliance event on chain within 2s.
