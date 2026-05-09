"""
Attest Encord label hashes on-chain via Auxin's log_compliance_event.

Run once after pull_encord_labels.py, before the demo.
Requires Auxin SDK + Solana credentials (same env as run_bridge.py).

Falls back gracefully if Solana is unreachable — writes "PENDING" so the
demo can proceed without blocking.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "Auxin_Automata" / "sdk" / "src"))

_ROBOT_IDS = ["robot_01", "robot_02", "robot_03"]
_EPISODES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "episodes"
_EXPLORER_BASE = "https://explorer.solana.com"


def _file_hash(labels_data: dict) -> str:
    canonical = json.dumps(labels_data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


async def _attest_robot(robot_id: str) -> None:
    labels_path = _EPISODES_DIR / robot_id / "encord_labels.json"
    provenance_path = _EPISODES_DIR / robot_id / "encord_provenance.json"

    if not labels_path.exists():
        print(f"[{robot_id}] encord_labels.json not found, skipping")
        return
    if not provenance_path.exists():
        print(f"[{robot_id}] encord_provenance.json not found, skipping")
        return

    labels_data = json.loads(labels_path.read_text())
    provenance = json.loads(provenance_path.read_text())

    existing_tx = provenance.get("attestation_tx", "")
    if existing_tx and existing_tx != "PENDING":
        print(f"[{robot_id}] already attested ({existing_tx[:16]}…), skipping")
        return

    file_hash = _file_hash(labels_data)

    try:
        from auxin_sdk.config import get_cluster_config  # type: ignore[import]
        from auxin_sdk.wallet import HardwareWallet  # type: ignore[import]
        from auxin_sdk.program.client import AuxinProgramClient  # type: ignore[import]

        cfg = get_cluster_config()
        hw_wallet = HardwareWallet.load_or_create(
            os.path.expanduser(f"~/.config/aura/{robot_id}.json")
        )
        owner_wallet = HardwareWallet.load_or_create(
            os.path.expanduser("~/.config/auxin/owner.json")
        )

        async with AuxinProgramClient.connect(
            rpc_url=cfg.rpc_url, program_id=cfg.program_id
        ) as client:
            sig = await client.log_compliance(
                agent_pda=str(hw_wallet.pubkey),
                severity=1,
                reason_code=7777,
                telemetry_hash=file_hash,
                robot_wallet=hw_wallet,
            )

        explorer_url = f"{_EXPLORER_BASE}/tx/{sig}?cluster=devnet"
        provenance["attestation_tx"] = sig
        provenance["attestation_explorer_url"] = explorer_url
        provenance_path.write_text(json.dumps(provenance, indent=2))
        print(f"[{robot_id}] attested: {sig}")

    except Exception as exc:
        print(f"[{robot_id}] WARNING: Solana attestation failed ({exc}), writing PENDING")
        provenance["attestation_tx"] = "PENDING"
        provenance["attestation_explorer_url"] = ""
        provenance_path.write_text(json.dumps(provenance, indent=2))


async def main() -> None:
    for robot_id in _ROBOT_IDS:
        await _attest_robot(robot_id)


if __name__ == "__main__":
    asyncio.run(main())
