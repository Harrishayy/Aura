"""Fleet configuration loader."""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel


class RobotConfig(BaseModel):
    id: str
    name: str
    keypair: str
    episode: str
    bridge_http_port: int
    bridge_ws_port: int


class AggregatorConfig(BaseModel):
    port: int = 8780


class FleetConfig(BaseModel):
    robots: list[RobotConfig]
    aggregator: AggregatorConfig = AggregatorConfig()


def load_fleet_config(path: str | Path = "fleet.yaml") -> FleetConfig:
    p = Path(path)
    if not p.exists():
        # Allow running from repo root
        p = Path(__file__).resolve().parents[2] / "fleet.yaml"
    with p.open() as f:
        data = yaml.safe_load(f)
    return FleetConfig.model_validate(data)
