"""VideoSource shim — re-exports from auxin_sdk when available.

The canonical implementation lives in
``Auxin_Automata/sdk/src/auxin_sdk/sources/video.py``.
When the auxin-sdk path dependency is active in pyproject.toml, this module
forwards directly to it. Falls back to a stub that raises NotImplementedError
if the SDK is not installed.
"""

from __future__ import annotations

try:
    from auxin_sdk.sources.video import VideoSource  # type: ignore[import-untyped]

    __all__ = ["VideoSource"]
except ModuleNotFoundError:
    from dataclasses import dataclass
    from pathlib import Path

    @dataclass  # type: ignore[no-redef]
    class VideoSource:  # type: ignore[no-redef]
        episode_dir: Path
        robot_id: str
        rate_hz: int = 10
        loop: bool = True
        speed: float = 1.0

        async def stream(self):  # type: ignore[no-untyped-def]
            raise NotImplementedError(
                "VideoSource — install auxin-sdk (uncomment path dep in pyproject.toml)"
            )

    __all__ = ["VideoSource"]
