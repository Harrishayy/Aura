"""EncordLabelStore — in-memory index of Encord-labelled visual ground truth."""

from __future__ import annotations

import json
from pathlib import Path

_ROBOT_IDS = {"robot_01", "robot_02", "robot_03"}

_label_store: "EncordLabelStore | None" = None


class EncordLabelStore:
    def __init__(self, episodes_dir: Path) -> None:
        self._fps: dict[str, float] = {}
        self._labels: dict[str, list[dict]] = {}
        self._episodes_dir = episodes_dir

        for robot_id in _ROBOT_IDS:
            path = episodes_dir / robot_id / "encord_labels.json"
            if path.exists():
                try:
                    data = json.loads(path.read_text())
                    self._labels[robot_id] = data.get("labels", [])
                    self._fps[robot_id] = float(data.get("video_fps", 30.0))
                except Exception:
                    self._labels[robot_id] = []
                    self._fps[robot_id] = 30.0
            else:
                self._labels[robot_id] = []
                self._fps[robot_id] = 30.0

    def get_labels_in_window(self, robot_id: str, t0_s: float, t1_s: float) -> list[dict]:
        fps = self._fps.get(robot_id, 30.0)
        result = []
        for label in self._labels.get(robot_id, []):
            if label["type"] == "temporal_segment":
                fr = label.get("frame_range", [label["frame_index"], label["frame_index"]])
                seg_t0 = fr[0] / fps
                seg_t1 = fr[1] / fps
                if seg_t0 <= t1_s and seg_t1 >= t0_s:
                    result.append(label)
            else:
                ts = label.get("timestamp_s", label["frame_index"] / fps)
                if t0_s <= ts <= t1_s:
                    result.append(label)
        return result

    def get_labels_at_frame(self, robot_id: str, frame_index: int, tolerance: int = 2) -> list[dict]:
        result = []
        for label in self._labels.get(robot_id, []):
            if label["type"] == "temporal_segment":
                fr = label.get("frame_range", [label["frame_index"], label["frame_index"]])
                if fr[0] <= frame_index <= fr[1]:
                    result.append(label)
            else:
                if abs(label["frame_index"] - frame_index) <= tolerance:
                    result.append(label)
        return result

    def get_provenance(self, robot_id: str) -> dict:
        path = self._episodes_dir / robot_id / "encord_provenance.json"
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text())
        except Exception:
            return {}

    def summary(self, robot_id: str) -> dict:
        labels = self._labels.get(robot_id, [])
        label_types = sorted(set(lb["type"] for lb in labels))
        prov = self.get_provenance(robot_id)
        labels_path = self._episodes_dir / robot_id / "encord_labels.json"
        project_id = ""
        label_hash = ""
        if labels_path.exists():
            try:
                data = json.loads(labels_path.read_text())
                project_id = data.get("encord_project_id", "")
                label_hash = data.get("encord_label_hash", "")
            except Exception:
                pass
        return {
            "robot_id": robot_id,
            "label_count": len(labels),
            "label_types": label_types,
            "fps": self._fps.get(robot_id, 30.0),
            "encord_project_id": project_id,
            "encord_label_hash": label_hash,
        }


def get_label_store() -> EncordLabelStore:
    global _label_store
    if _label_store is None:
        _label_store = EncordLabelStore(
            Path(__file__).resolve().parents[2] / "fixtures" / "episodes"
        )
    return _label_store
