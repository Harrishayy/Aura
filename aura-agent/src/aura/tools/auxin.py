"""Auxin bridge — turns FleetClient.trigger_* calls into real on-chain transactions.

Loads each robot's hardware wallet on first use, holds a long-lived
AuxinProgramClient, and exposes:

  - log_compliance(robot_id, payload)        -> tx_signature | None
  - stream_payment(robot_id, lamports, ...)  -> tx_signature | None

Any failure (missing keypair, RPC error, provider unconfigured) is logged and
returns None — the voice agent stays alive and narrates a missing receipt.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import structlog
from auxin_sdk.program.client import AuxinProgramClient
from auxin_sdk.wallet import HardwareWallet
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed
from solders.pubkey import Pubkey

from ..config import get_settings

log = structlog.get_logger()

DEFAULT_SEVERITY = 1
DEFAULT_REASON_CODE = 0


def _hash_payload(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class AuxinBridge:
    """Lazy-init wrapper around AuxinProgramClient + per-robot hardware wallets."""

    def __init__(self) -> None:
        self._rpc: AsyncClient | None = None
        self._client: AuxinProgramClient | None = None
        self._wallets: dict[str, HardwareWallet] = {}
        self._owner_pubkey: Pubkey | None = None
        self._provider_pubkey: Pubkey | None = None
        self._init_failed: bool = False

    async def _ensure(self) -> bool:
        """Lazy-init RPC client, program client, owner + provider pubkeys.

        Returns True on success; False if anything is missing/broken (and caches
        the failure so we don't re-attempt every call).
        """
        if self._client is not None:
            return True
        if self._init_failed:
            return False

        settings = get_settings()
        try:
            self._rpc = AsyncClient(settings.helius_rpc_url, commitment=Confirmed)
            program_id = AuxinProgramClient._resolve_program_id(None, None)
            self._client = AuxinProgramClient(self._rpc, program_id)

            owner_path = Path(settings.aura_owner_keypair_path).expanduser()
            if not owner_path.exists():
                raise FileNotFoundError(f"owner keypair missing at {owner_path}")
            self._owner_pubkey = HardwareWallet.load_or_create(owner_path).pubkey

            if settings.aura_provider_pubkey:
                self._provider_pubkey = Pubkey.from_string(settings.aura_provider_pubkey)

            log.info(
                "auxin.bridge.ready",
                program_id=str(program_id),
                owner=str(self._owner_pubkey),
                provider=str(self._provider_pubkey) if self._provider_pubkey else None,
            )
            return True
        except Exception as exc:  # noqa: BLE001 — degrade gracefully if Auxin isn't usable here
            log.warning("auxin.bridge.init_failed", error=str(exc))
            self._init_failed = True
            return False

    def _wallet_for(self, robot_id: str) -> HardwareWallet | None:
        if robot_id in self._wallets:
            return self._wallets[robot_id]
        path = (Path(get_settings().hw_keypair_dir).expanduser() / f"{robot_id}.json")
        if not path.exists():
            log.warning("auxin.wallet_missing", robot_id=robot_id, path=str(path))
            return None
        wallet = HardwareWallet.load_or_create(path)
        self._wallets[robot_id] = wallet
        return wallet

    async def log_compliance(self, robot_id: str, payload: dict) -> str | None:
        if not await self._ensure() or robot_id == "fleet":
            return None
        wallet = self._wallet_for(robot_id)
        if wallet is None:
            return None
        try:
            return await self._client.log_compliance(  # type: ignore[union-attr]
                hw_wallet=wallet,
                owner_pubkey=self._owner_pubkey,  # type: ignore[arg-type]
                telemetry_hash=_hash_payload(payload),
                severity=DEFAULT_SEVERITY,
                reason_code=DEFAULT_REASON_CODE,
            )
        except Exception as exc:  # noqa: BLE001 — RPC errors must not kill the agent
            log.warning("auxin.compliance.failed", robot_id=robot_id, error=str(exc))
            return None

    async def stream_payment(
        self, robot_id: str, lamports: int, reason: str
    ) -> str | None:
        if not await self._ensure():
            return None
        if self._provider_pubkey is None:
            log.warning(
                "auxin.payment.skipped",
                reason="aura_provider_pubkey unset in env",
                robot_id=robot_id,
                lamports=lamports,
                note=reason,
            )
            return None
        wallet = self._wallet_for(robot_id)
        if wallet is None:
            return None
        try:
            return await self._client.stream_payment(  # type: ignore[union-attr]
                hw_wallet=wallet,
                owner_pubkey=self._owner_pubkey,  # type: ignore[arg-type]
                provider_pubkey=self._provider_pubkey,
                amount_lamports=lamports,
            )
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "auxin.payment.failed", robot_id=robot_id, lamports=lamports, error=str(exc)
            )
            return None

    async def aclose(self) -> None:
        if self._rpc is not None:
            await self._rpc.close()
            self._rpc = None
            self._client = None
