"""Boots the fleet aggregator and (eventually) three Auxin bridge subprocesses.

For the scaffold, this just runs the aggregator on :8780. Spawning real Auxin
bridges requires the Auxin SDK path-dep uncommented in pyproject.toml.
"""

from __future__ import annotations

import uvicorn

from aura_fleet.config import load_fleet_config


def main() -> None:
    cfg = load_fleet_config()
    uvicorn.run(
        "aura_fleet.aggregator:app",
        host="0.0.0.0",
        port=cfg.aggregator.port,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    main()
