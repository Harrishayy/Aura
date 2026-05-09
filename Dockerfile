FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && mv /root/.local/bin/uv /usr/local/bin/uv

WORKDIR /app

# Resolve deps first so Docker caches the layer when only source changes.
COPY aura-fleet/pyproject.toml aura-fleet/uv.lock /app/aura-fleet/
RUN cd /app/aura-fleet && uv sync --frozen --no-dev --no-install-project

# App code + fleet config
COPY aura-fleet/src       /app/aura-fleet/src
COPY aura-fleet/scripts   /app/aura-fleet/scripts
COPY aura-fleet/fleet.yaml /app/aura-fleet/fleet.yaml

# Encord labels + episode metadata (cameras excluded by .dockerignore — videos served from R2)
COPY aura-fleet/fixtures  /app/aura-fleet/fixtures

# Wallet metadata so /fleet/status can include pubkeys
COPY aura-dashboard/public/robot_metadata /app/aura-dashboard/public/robot_metadata

# Replay data (robot.jsonl + events) is fetched at runtime from R2 by fetch_replay_data.sh.
# AURA_REPLAY_BASE_URL must be set on Railway. /data is writable per-container scratch.
ENV AURA_QWEN_DATA_DIR=/data/qwen_data
RUN mkdir -p /data/qwen_data && chmod +x /app/aura-fleet/scripts/fetch_replay_data.sh

# Install the project itself now that source is present
RUN cd /app/aura-fleet && uv sync --frozen --no-dev

EXPOSE 8780
ENTRYPOINT ["/app/aura-fleet/scripts/fetch_replay_data.sh"]
CMD ["uv", "run", "--directory", "/app/aura-fleet", "python", "scripts/run_qwen_panda.py"]
