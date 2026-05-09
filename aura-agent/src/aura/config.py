"""Environment configuration for the Aura agent."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[".env", "../.env"],
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openai_api_key: str = ""
    anthropic_api_key: str = ""
    elevenlabs_api_key: str = ""
    atlas_voice_id: str = "XB0fDUnXU5powFXDhCwa"  # ElevenLabs "Charlotte" — calm, mature
    aura_reasoning_model: str = "gpt-4o"

    aura_fleet_http: str = "http://localhost:8780"
    aura_fleet_ws: str = "ws://localhost:8780/fleet"
    aura_agent_ws: str = "ws://localhost:8770/aura"

    helius_rpc_url: str = "https://api.devnet.solana.com"
    hw_keypair_dir: Path = Path.home() / ".config" / "aura"

    agent_port: int = 8770


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
