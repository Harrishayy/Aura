"""Smoke test: instantiate VideoSource on robot_01 and stream 30 frames."""

from __future__ import annotations

import asyncio
from pathlib import Path

from aura_fleet.video_source import VideoSource


async def main() -> None:
    source = VideoSource(
        episode_dir=Path("fixtures/episodes/robot_01"),
        robot_id="robot_01",
    )
    try:
        count = 0
        async for frame in source.stream():
            print(frame)
            count += 1
            if count >= 30:
                break
    except NotImplementedError as exc:
        print(f"SKIP: {exc}")


if __name__ == "__main__":
    asyncio.run(main())
