"""Build per-robot timeline JSON files for the dashboard scrub UI.

Reads qwen_data/<robot_id>/robot.jsonl + episode_events.jsonl, downsamples to
~30 Hz, and writes aura-dashboard/public/qwen/<robot_id>/timeline.json with the
frames + events the scrub controls need to display joint state in sync with the
videos.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QWEN_DIR = ROOT / "qwen_data"
OUT_DIR = ROOT / "aura-dashboard" / "public" / "qwen"

ROBOTS = ("robot_01", "robot_02", "robot_03")
TARGET_HZ = 30


def _collect(robot_id: str) -> dict:
    src = QWEN_DIR / robot_id
    robot_path = src / "robot.jsonl"
    events_path = src / "episode_events.jsonl"

    rows: list[dict] = []
    with robot_path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    if not rows:
        raise RuntimeError(f"{robot_id}: empty robot.jsonl")

    base_ns = rows[0]["timestamp_ns"]
    last_ns = rows[-1]["timestamp_ns"]
    duration_s = (last_ns - base_ns) / 1e9

    target_period_ns = int(1e9 / TARGET_HZ)
    next_emit_ns = base_ns
    frames: list[dict] = []
    for row in rows:
        ts_ns = row["timestamp_ns"]
        if ts_ns < next_emit_ns:
            continue
        state = row.get("robot_state", {})
        fault_flags = state and row.get("status", {}).get("fault_flags", {}) or {}
        flags = [k for k, v in fault_flags.items() if v]
        frames.append({
            "t": round((ts_ns - base_ns) / 1e9, 4),
            "joints": [round(x, 6) for x in state.get("q", [])],
            "torques": [round(x, 6) for x in state.get("dq", [])],
            "gripper_open": state.get("gripper_state", "OPEN") != "CLOSED",
            "gripper_force": round(state.get("gripper_width", 0.0), 4),
            "fault_flags": flags,
        })
        next_emit_ns += target_period_ns

    events: list[dict] = []
    if events_path.exists() and events_path.stat().st_size > 0:
        with events_path.open() as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                ev = json.loads(line)
                events.append({
                    "t": float(ev.get("timestamp", 0.0)),
                    "type": ev.get("type", "unknown"),
                    "payload": ev.get("payload", {}),
                })

    return {
        "robot_id": robot_id,
        "duration_s": round(duration_s, 3),
        "rate_hz": TARGET_HZ,
        "frame_count": len(frames),
        "frames": frames,
        "events": events,
    }


def main() -> None:
    for robot_id in ROBOTS:
        try:
            data = _collect(robot_id)
        except FileNotFoundError as e:
            print(f"[{robot_id}] skip: {e}", file=sys.stderr)
            continue
        out_dir = OUT_DIR / robot_id
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "timeline.json"
        out_path.write_text(json.dumps(data, separators=(",", ":")))
        print(
            f"[{robot_id}] {data['frame_count']} frames "
            f"@ {data['rate_hz']} Hz · {data['duration_s']:.1f}s · "
            f"{out_path.stat().st_size / 1024:.1f} KiB · "
            f"{len(data['events'])} events",
        )


if __name__ == "__main__":
    main()
