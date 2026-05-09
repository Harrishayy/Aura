"""VideoSource: replays a real Franka VLA episode as live Auxin telemetry.

NOTE: per the playbook, the canonical implementation lives in
`Auxin_Automata/sdk/src/auxin_sdk/sources/video.py` once the Auxin SDK
path-dep is uncommented. This module is a thin local shim so aura-fleet's
imports resolve without Auxin checked out.

Real implementation responsibilities:
- Load `robot.jsonl`, `frames.jsonl`, `episode_events.jsonl` from episode_dir.
- Resample to rate_hz; build TelemetryFrame per tick.
- Map episode_events with type in {gripper_slip, collision, joint_torque_spike,
  anomaly, error} into anomaly_flags.
- Read /tmp/aura_pause_{robot_id} to freeze on the current frame.
- Read /tmp/aura_inject_{robot_id} for runtime anomaly injection.
- Loop on episode end.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class VideoSource:
    episode_dir: Path
    robot_id: str
    rate_hz: int = 10
    loop: bool = True
    speed: float = 1.0

    async def stream(self):  # type: ignore[no-untyped-def]
        raise NotImplementedError(
            "VideoSource — real implementation lives in Auxin_Automata/sdk per playbook P2"
        )
