"""Smoke test the aggregator's mock endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from aura_fleet.aggregator import app


def test_healthz() -> None:
    with TestClient(app) as client:
        r = client.get("/healthz")
        assert r.status_code == 200
        assert r.json() == {"status": "ok", "service": "aura-fleet"}


def test_fleet_status_returns_three_robots() -> None:
    with TestClient(app) as client:
        r = client.get("/fleet/status")
        assert r.status_code == 200
        body = r.json()
        ids = [robot["id"] for robot in body["robots"]]
        assert ids == ["robot_01", "robot_02", "robot_03"]


def test_unknown_robot_returns_404() -> None:
    with TestClient(app) as client:
        r = client.get("/robot/robot_99/status")
        assert r.status_code == 404
