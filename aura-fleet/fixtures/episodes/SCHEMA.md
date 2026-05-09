# VLA Episode Schema

Placeholder — populated per playbook P0.2 once the dataset is selected.

```
session_root/
├── cameras/
│   ├── third_person_d405/
│   │   ├── rgb.mp4
│   │   ├── frames.jsonl     # one row per frame: {timestamp, frame_index}
│   │   └── metadata.json    # camera intrinsics, fps, resolution
│   └── wrist_d405/
│       └── …
├── episode_events.jsonl     # {timestamp, type: pick_started | pick_completed | gripper_slip | collision | anomaly | …, payload}
├── robot.jsonl              # per-tick: {timestamp, joint_positions[7], joint_velocities[7], joint_torques[7], gripper_state, ee_pose}
└── session_metadata.json    # {task_description, duration_s, success_flag, …}
```

## Anomaly mapping

`VideoSource` adds the event's `type` to the next frame's `anomaly_flags` when
`type ∈ {gripper_slip, collision, joint_torque_spike, anomaly, error}`.

## Sample queries

- joint state at t=2.5s: binary-search `robot.jsonl` on `timestamp`.
- third-person frame at t=2.5s: scan `cameras/third_person_d405/frames.jsonl` for the closest `timestamp`.
- events in window `[t0, t1]`: filter `episode_events.jsonl` on `timestamp`.

## Joint convention

Franka 7-DOF arm. `joint_positions[0..6]` in radians. `joint_velocities` rad/s.
`joint_torques` Nm. `gripper_state` ∈ {0=open, 1=closed}.
