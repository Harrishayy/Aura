# Aura API Contract

Locked interface between the three workspaces. Every service is built against this; mismatches go through this doc, not ad-hoc Slack.

## Ports

| service | port | purpose |
| --- | --- | --- |
| Dashboard (Next.js) | 3000 | UI |
| Aura agent FastAPI | 8770 | `/healthz` + WS `/aura` (transcript broadcast) |
| Fleet aggregator | 8780 | `/fleet/*`, `/robot/{id}/*`, WS `/fleet`, WS `/selected` |
| Bridge: robot_01 | 8767 / 8766 | HTTP / WS (Auxin bridge) |
| Bridge: robot_02 | 8768 / 8771 | HTTP / WS |
| Bridge: robot_03 | 8769 / 8772 | HTTP / WS |

## Fleet HTTP endpoints (aggregator on :8780)

### `GET /fleet/status`

```json
{
  "robots": [
    {
      "id": "robot_01",
      "name": "Aura-Panda-01",
      "wallet_pubkey": "string",
      "status": "healthy | anomaly | idle | paused | offline",
      "grade": "A | B | C | D | F",
      "runway_hours": 42.0,
      "latest_event_ts": "2026-05-09T12:34:56Z",
      "video_url": "/videos/robot_01/third_person.mp4",
      "telemetry_ws_url": "ws://localhost:8766",
      "compliance_ws_url": "ws://localhost:8766"
    }
  ]
}
```

### `GET /robot/{id}/status`
Returns a single robot's status block (same shape as one entry of `/fleet/status`).

### `GET /robot/{id}/recent_events?n=N`
Returns the last `N` compliance events emitted by that robot's agent PDA.

```json
[
  {
    "hash": "sha256...",
    "severity": 2,
    "reason_code": "joint_torque_spike",
    "timestamp": "2026-05-09T12:34:56Z",
    "tx_signature": "...",
    "explorer_url": "https://explorer.solana.com/tx/...?cluster=devnet"
  }
]
```

### `POST /robot/{id}/inject_anomaly`
Triggers a fake HIGH-severity event on the next telemetry tick. No body.

### `POST /robot/{id}/pause`
Sets a pause flag the VideoSource reads on each tick — freezes the robot on its current frame. No body.

### `GET /robot/{id}/identity`
Returns the metadata JSON (name, manufacturer, serial, wallet pubkey, agent PDA, registration tx, episode hash).

## WebSocket schemas

### `ws://localhost:8770/aura` — Aura transcript broadcaster
The agent publishes; the dashboard's `AuraConversation` panel subscribes.

```ts
type AuraMessage = {
  type: "user_turn" | "assistant_turn" | "tool_call" | "tool_result" | "heartbeat";
  timestamp: string;        // ISO8601
  content: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: Record<string, unknown>;
  cost_lamports?: number;
  tx_signature?: string;
};
```

### `ws://localhost:8780/fleet` — fleet event multiplex
The aggregator publishes; dashboard subscribes.

```ts
type FleetMessage = {
  robot_id: "robot_01" | "robot_02" | "robot_03";
  type: "telemetry" | "compliance" | "payment" | "status_change";
  payload: Record<string, unknown>;
};
```

### `ws://localhost:8780/selected` — selected-robot channel
Dashboard publishes when the user clicks a tile; the agent subscribes for ambient context.

```ts
type SelectedMessage = { selected_robot_id: string | null };
```

## Tool argument shapes (agent → fleet)

All five tools accept an **optional** `robot_id`. If absent, the tool uses the currently-selected robot from the WS context.

| tool | args | cost (lamports) | description |
| --- | --- | --- | --- |
| `get_fleet_status` | `{}` | 0 | Aggregated fleet status (no `robot_id`). |
| `get_recent_events` | `{ robot_id?: str, n?: int }` | 0 | Last N compliance events. |
| `investigate_anomaly` | `{ robot_id?: str, event_id: str }` | 800000 | GPT-4o diagnosis around an event. **Costs SOL.** |
| `generate_incident_report` | `{ robot_id?: str, from_iso: str, to_iso: str }` | 0 | Triggers weasyprint pipeline. |
| `pause_robot` | `{ robot_id?: str }` | 0 | Freezes robot on current frame. |

## Robot identity payload

Path: `/robot_metadata/{robot_id}.json` (served by the dashboard as a static asset).

```json
{
  "name": "Aura-Panda-01",
  "manufacturer": "Franka Emika",
  "model": "Panda 7-DOF",
  "serial": "FE-PANDA-2024-0001",
  "deployment_date": "2026-04-01",
  "operator": "Aura Demo Fleet",
  "wallet_pubkey": "<pubkey>",
  "agent_pda": "<pda>",
  "registration_tx": "<tx_signature>",
  "explorer_url": "https://explorer.solana.com/address/<agent_pda>?cluster=devnet",
  "episode_hash": "<sha256 of episode dir tarball>",
  "image_url": "/robot_images/panda_01.png"
}
```

## Failure modes

- **Bridge dies** → aggregator returns `status: offline` for that robot. Dashboard greys out the tile.
- **ElevenLabs rate-limits** → voice loop falls back to OpenAI `tts-1`.
- **Devnet RPC slow** → all on-chain writes are best-effort with 5s timeouts; demo never blocks on confirmation.
- **Whisper slow** → agent supports a typed-text fallback via stdin override.
