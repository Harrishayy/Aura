"""
Pull Encord labels for all three robots and write fixture JSON files.

Run once before demo:  uv run python scripts/pull_encord_labels.py
Never called at runtime.

Fill in PROJECT_IDS with real Encord project UUIDs when available.
If PROJECT_IDS contain placeholder strings or ENCORD_SSH_KEY is absent,
falls back to synthetic labels so the rest of the stack works immediately.
"""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

PROJECT_IDS: dict[str, str] = {
    "robot_01": "ENCORD_PROJECT_ID_ROBOT_01",
    "robot_02": "ENCORD_PROJECT_ID_ROBOT_02",
    "robot_03": "ENCORD_PROJECT_ID_ROBOT_03",
}
VIDEO_FPS = 30.0
_EPISODES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "episodes"

_ROBOT_IDS = ["robot_01", "robot_02", "robot_03"]


def _is_real_uuid(s: str) -> bool:
    try:
        uuid.UUID(s)
        return True
    except ValueError:
        return False


def _label_hash(labels: list[dict]) -> str:
    canonical = json.dumps(labels, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _synthetic_labels(robot_id: str) -> tuple[list[dict], str]:
    labels: list[dict] = []

    if robot_id == "robot_01":
        # 30s clean episode, 900 video frames at 30fps
        segments = [
            ("gripper_open", 0, 149),
            ("gripper_closing", 150, 269),
            ("gripper_closed_holding", 270, 539),
            ("gripper_opening", 540, 599),
            ("gripper_open", 600, 749),
            ("gripper_closing", 750, 869),
            ("gripper_closed_holding", 870, 899),
        ]
        for category, f0, f1 in segments:
            mid = (f0 + f1) // 2
            labels.append({
                "frame_index": mid,
                "timestamp_s": round(mid / VIDEO_FPS, 3),
                "type": "temporal_segment",
                "category": category,
                "frame_range": [f0, f1],
                "confidence": 1.0,
                "encord_object_hash": f"syn-seg-r01-{f0:04d}",
            })
        # Soup can bboxes at every 10th frame in range 150-539
        for i, fi in enumerate(range(150, 540, 10)):
            labels.append({
                "frame_index": fi,
                "timestamp_s": round(fi / VIDEO_FPS, 3),
                "type": "bbox",
                "category": "soup_can",
                "bbox": {
                    "x": round(0.40 + 0.01 * (i % 5), 3),
                    "y": round(0.28 + 0.01 * (i % 3), 3),
                    "w": 0.17,
                    "h": 0.22,
                },
                "confidence": 1.0,
                "encord_object_hash": f"syn-bbox-r01-{i:04d}",
            })

    elif robot_id == "robot_02":
        # 30s anomaly episode, 900 frames; anomaly at t≈12s = frame 360
        segments = [
            ("approaching", 0, 149),
            ("contact", 150, 299),
            ("inserted", 300, 539),
            ("gripper_slip_event", 540, 599),
            ("retracting", 600, 899),
        ]
        for category, f0, f1 in segments:
            mid = (f0 + f1) // 2
            labels.append({
                "frame_index": mid,
                "timestamp_s": round(mid / VIDEO_FPS, 3),
                "type": "temporal_segment",
                "category": category,
                "frame_range": [f0, f1],
                "confidence": 1.0,
                "encord_object_hash": f"syn-seg-r02-{f0:04d}",
            })
        # Connector_tip keypoints at every 10th frame in range 0-599
        for i, fi in enumerate(range(0, 600, 10)):
            labels.append({
                "frame_index": fi,
                "timestamp_s": round(fi / VIDEO_FPS, 4),
                "type": "keypoint",
                "category": "connector_tip",
                "point": {
                    "x": round(0.50 + 0.005 * (i % 7), 4),
                    "y": round(0.44 + 0.005 * (i % 5), 4),
                },
                "confidence": 1.0,
                "encord_object_hash": f"syn-kp-r02-{i:04d}",
            })

    elif robot_id == "robot_03":
        # 15s idle episode, 450 video frames at 30fps
        objects = [
            ("workpiece_a", {"x": 0.15, "y": 0.20, "w": 0.12, "h": 0.15}),
            ("cable_harness", {"x": 0.65, "y": 0.45, "w": 0.08, "h": 0.18}),
            ("tool_mount", {"x": 0.42, "y": 0.70, "w": 0.10, "h": 0.10}),
        ]
        for i, fi in enumerate(range(0, 441, 10)):
            for obj_name, bbox in objects:
                labels.append({
                    "frame_index": fi,
                    "timestamp_s": round(fi / VIDEO_FPS, 3),
                    "type": "bbox",
                    "category": obj_name,
                    "bbox": bbox,
                    "confidence": 1.0,
                    "encord_object_hash": f"syn-bbox-r03-{obj_name}-{fi:04d}",
                })

    return labels, "SYNTHETIC"


def _parse_encord_label_row(raw: dict, fps: float) -> list[dict]:
    results = []
    for obj in raw.get("objects", []) or []:
        obj_hash = obj.get("uid", f"enc-{uuid.uuid4().hex[:16]}")
        shape = obj.get("shape", "")
        category = obj.get("name", "unknown")
        confidence = float(obj.get("confidence_score", 1.0))
        frames_data = obj.get("frames", {}) or {}
        for frame_str, frame_data in frames_data.items():
            fi = int(frame_str)
            ts = round(fi / fps, 3)
            if shape == "bounding_box":
                bb = frame_data.get("boundingBox", {})
                results.append({
                    "frame_index": fi,
                    "timestamp_s": ts,
                    "type": "bbox",
                    "category": category,
                    "bbox": {"x": bb.get("x", 0.0), "y": bb.get("y", 0.0), "w": bb.get("w", 0.0), "h": bb.get("h", 0.0)},
                    "confidence": confidence,
                    "encord_object_hash": obj_hash,
                })
            elif shape == "point":
                pt = frame_data.get("point", {})
                results.append({
                    "frame_index": fi,
                    "timestamp_s": ts,
                    "type": "keypoint",
                    "category": category,
                    "point": {"x": pt.get("x", 0.0), "y": pt.get("y", 0.0)},
                    "confidence": confidence,
                    "encord_object_hash": obj_hash,
                })
            elif shape in ("timeline", "range"):
                rng_data = frame_data.get("range", [fi, fi])
                results.append({
                    "frame_index": fi,
                    "timestamp_s": ts,
                    "type": "temporal_segment",
                    "category": category,
                    "frame_range": rng_data,
                    "confidence": confidence,
                    "encord_object_hash": obj_hash,
                })
    for cls in raw.get("classifications", []) or []:
        cls_hash = cls.get("uid", f"enc-cls-{uuid.uuid4().hex[:16]}")
        category = cls.get("name", "unknown")
        confidence = float(cls.get("confidence_score", 1.0))
        frames_data = cls.get("frames", {}) or {}
        for frame_str, frame_data in frames_data.items():
            fi = int(frame_str)
            ts = round(fi / fps, 3)
            rng_data = frame_data.get("range", [fi, fi])
            results.append({
                "frame_index": fi,
                "timestamp_s": ts,
                "type": "temporal_segment",
                "category": category,
                "frame_range": rng_data,
                "confidence": confidence,
                "encord_object_hash": cls_hash,
            })
    return results


def _write_robot(robot_id: str, labels: list[dict], project_id_str: str) -> None:
    out_dir = _EPISODES_DIR / robot_id
    out_dir.mkdir(parents=True, exist_ok=True)

    computed_hash = hashlib.sha256(
        json.dumps(labels, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()

    provenance_path = out_dir / "encord_provenance.json"
    if provenance_path.exists():
        try:
            existing = json.loads(provenance_path.read_text())
            if existing.get("encord_label_hash") == computed_hash:
                print(f"[{robot_id}] labels unchanged, skipping")
                return
        except Exception:
            pass

    label_types = sorted(set(lb["type"] for lb in labels))

    labels_data = {
        "robot_id": robot_id,
        "encord_project_id": project_id_str,
        "encord_label_hash": computed_hash,
        "video_fps": VIDEO_FPS,
        "labels": labels,
    }

    provenance_data = {
        "encord_label_hash": computed_hash,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "label_count": len(labels),
        "label_types": label_types,
        "attestation_tx": "",
        "attestation_explorer_url": "",
    }

    (out_dir / "encord_labels.json").write_text(json.dumps(labels_data, indent=2))
    provenance_path.write_text(json.dumps(provenance_data, indent=2))
    print(f"[{robot_id}] wrote {len(labels)} labels ({', '.join(label_types)})")


def main() -> None:
    client = None
    ssh_key_path = os.environ.get("ENCORD_SSH_KEY", "")

    if ssh_key_path:
        try:
            from encord import EncordUserClient  # type: ignore[import]
            ssh_key_text = Path(ssh_key_path).read_text()
            client = EncordUserClient.create_with_ssh_private_key(ssh_private_key=ssh_key_text)
            print("Encord auth OK")
        except ImportError:
            print("encord package not installed, using synthetic labels")
            client = None
        except Exception as exc:
            print(f"Encord auth failed ({exc}), falling back to synthetic labels")
            client = None
    else:
        print("ENCORD_SSH_KEY not set, using synthetic labels")

    for robot_id in _ROBOT_IDS:
        project_id = PROJECT_IDS[robot_id]
        use_real = client is not None and _is_real_uuid(project_id)

        if use_real:
            try:
                project = client.get_project(project_uid=project_id)
                label_rows = list(project.list_label_rows_v2())
                labels = []
                for lr in label_rows:
                    lr.initialise_labels()
                    raw = lr.to_dict()
                    labels.extend(_parse_encord_label_row(raw, VIDEO_FPS))
                project_id_str = project_id
                print(f"[{robot_id}] pulled {len(labels)} labels from Encord")
            except Exception as exc:
                print(f"[{robot_id}] Encord pull failed ({exc}), using synthetic")
                labels, project_id_str = _synthetic_labels(robot_id)
        else:
            labels, project_id_str = _synthetic_labels(robot_id)

        _write_robot(robot_id, labels, project_id_str)


if __name__ == "__main__":
    main()
