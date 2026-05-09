"""On-chain registration: initialize_agent for each of robot_01..03.

Stub — uncomment the auxin-sdk path-dep and the solana / solders deps in
pyproject.toml, then implement per playbook P4.
"""

from __future__ import annotations

from aura_fleet.config import load_fleet_config


def main() -> None:
    cfg = load_fleet_config()
    for robot in cfg.robots:
        print(f"would register {robot.id} with keypair {robot.keypair}")
        # TODO: load keypair, call Auxin's initialize_agent instruction,
        # whitelist provider PDA, write tx_signature + agent_pda back to
        # ../aura-dashboard/public/robot_metadata/{robot.id}.json
    raise NotImplementedError("Implement register_robots per playbook P4")


if __name__ == "__main__":
    main()
