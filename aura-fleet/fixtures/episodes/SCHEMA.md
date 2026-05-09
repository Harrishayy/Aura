# Episode fixture schema

Synthetic LeRobot-format episodes for three Franka Emika Panda arms.
`VideoSource` reads these files; do not change field names without updating that class.

## Directory layout

```
fixtures/episodes/{robot_id}/
├── cameras/
│   ├── third_person_d405/
│   │   ├── frames.jsonl     # one row per frame at 30fps
│   │   └── metadata.json    # camera serial, fps, resolution
│   └── wrist_d405/
│       ├── frames.jsonl
│       └── metadata.json
├── episode_events.jsonl     # sparse event log (may be empty)
├── robot.jsonl              # per-tick joint state at 10Hz
└── session_metadata.json    # task description, duration, success flag
```

## robot.jsonl

One JSON object per line. 10 Hz for robot_01 and robot_02 (300 rows = 30 s),
10 Hz for robot_03 (150 rows = 15 s).

```json
{
  "robot_state": {
    "q":  [0.312, -0.148, 0.731, -1.204, 0.089, 0.562, 0.041],
    "dq": [0.015, -0.022, 0.008, -0.031, 0.004, 0.012, -0.003],
    "tcp_position_xyz":     [0.412, 0.023, 0.341],
    "tcp_orientation_xyzw": [0.024, 0.0, 0.0, 0.9997],
    "gripper_state":  "OPEN",
    "gripper_width":  0.08
  },
  "status": {
    "fault_flags": {
      "control_exception": false,
      "gripper_fault":     false,
      "ik_rejected":       false,
      "workspace_clamped": false
    }
  },
  "timestamp_ns": 1746748800000000000
}
```

| field | type | unit | notes |
|---|---|---|---|
| `robot_state.q` | `float[7]` | radians | Franka 7-DOF joint positions, joints 1–7 |
| `robot_state.dq` | `float[7]` | rad/s | Joint velocities, same order as `q` |
| `robot_state.tcp_position_xyz` | `float[3]` | metres | End-effector position in robot base frame |
| `robot_state.tcp_orientation_xyzw` | `float[4]` | — | Unit quaternion (x, y, z, w) |
| `robot_state.gripper_state` | `"OPEN"\|"CLOSED"` | — | Binary gripper state |
| `robot_state.gripper_width` | `float` | metres | Finger gap; ~0.08 m open, ~0.002 m closed |
| `status.fault_flags.*` | `bool` | — | Any `true` value maps to an anomaly flag |
| `timestamp_ns` | `int` | nanoseconds | Unix epoch; same epoch as `frames.jsonl.host_timestamp_ns` |

### Joint convention

- 7 degrees of freedom (Franka Panda).
- Angles in radians; velocities in rad/s; torques (not recorded here) in N·m.
- Joint numbering follows Franka documentation: joint 1 = proximal, joint 7 = wrist.
- `VideoSource` passes all 7 values to `TelemetryFrame.joint_positions` unchanged.
  If a downstream consumer expects 6 DOF, drop the last element (`q[6]`).

## frames.jsonl (per camera)

One JSON object per line. 30 fps. Two cameras per robot: `third_person_d405`, `wrist_d405`.

```json
{"host_timestamp_ns": 1746748800000000000, "rgb_video_frame": 0, "frame_index": 0}
```

| field | type | notes |
|---|---|---|
| `host_timestamp_ns` | `int` | Unix epoch nanoseconds — **same epoch** as `robot.jsonl.timestamp_ns` |
| `rgb_video_frame` | `int` | 0-indexed frame number in the corresponding `rgb.mp4` |
| `frame_index` | `int` | Sequential index within this episode (equals `rgb_video_frame` for synthetic data) |

### Timestamp alignment

`robot.jsonl` is 10 Hz; `frames.jsonl` is 30 Hz. To find the video frame closest to robot
row `i`, compute `robot_ts = timestamp_ns[i]` then binary-search `frames.jsonl` for the
nearest `host_timestamp_ns`. The two files share the same epoch (`BASE_NS = 1_746_748_800_000_000_000`),
so maximum drift is `1/(2 × 30 Hz) ≈ 16 ms`.

## episode_events.jsonl

One JSON object per line. Events are sparse (0–10 per episode). Empty file = no events.

```json
{"timestamp": 12.0, "type": "gripper_slip", "payload": {"severity": "high", "gripper_width_delta": 0.031}}
```

| field | type | notes |
|---|---|---|
| `timestamp` | `float` | Seconds from episode start (not Unix epoch) |
| `type` | `str` | See table below |
| `payload` | `dict` | Event-specific metadata; always present (may be `{}`) |

### Event types

| type | anomaly_flag | notes |
|---|---|---|
| `gripper_slip` | `gripper_slip` | Mapped to `anomaly_flags` by `VideoSource` |
| `collision` | `collision` | Mapped to `anomaly_flags` |
| `joint_torque_spike` | `joint_torque_spike` | Mapped to `anomaly_flags` |
| `anomaly` | `anomaly` | Generic anomaly — mapped to `anomaly_flags` |
| `error` | `error` | Mapped to `anomaly_flags` |
| `pick_started` | — | Informational only; not mapped to anomaly_flags |
| `pick_completed` | — | Informational only; not mapped to anomaly_flags |

## Per-robot summary

| robot | rows | duration | anomaly events | success |
|---|---|---|---|---|
| robot_01 | 300 | 30 s | none | true |
| robot_02 | 300 | 30 s | gripper_slip @ 12 s, collision @ 18 s; gripper_fault in rows 115–125 | false |
| robot_03 | 150 | 15 s | none (idle) | true |

## Sample queries

**1. Find all anomaly rows in robot_02:**
```python
import json
rows = [json.loads(l) for l in open("robot_02/robot.jsonl")]
faults = [(i, r["status"]["fault_flags"]) for i, r in enumerate(rows)
          if any(r["status"]["fault_flags"].values())]
```

**2. Get camera frame index for robot row 120:**
```python
import json, bisect
robot_ts = rows[120]["timestamp_ns"]
frame_ts = [json.loads(l)["host_timestamp_ns"]
            for l in open("robot_02/cameras/third_person_d405/frames.jsonl")]
idx = bisect.bisect_left(frame_ts, robot_ts)
```

**3. List anomaly events from episode_events.jsonl:**
```python
ANOMALY_TYPES = {"gripper_slip", "collision", "joint_torque_spike", "anomaly", "error"}
events = [json.loads(l) for l in open("robot_02/episode_events.jsonl") if l.strip()]
anomalies = [e for e in events if e["type"] in ANOMALY_TYPES]
```
