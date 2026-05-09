#!/usr/bin/env bash
# Upload trimmed qwen replay data (robot.jsonl, episode_events.jsonl, session_metadata.json)
# to the R2 bucket so the Railway container can fetch it on startup.
# Run this once, and again whenever the source jsonls change.
set -euo pipefail

BUCKET="${R2_BUCKET:-auravids}"
PREFIX="${R2_REPLAY_PREFIX:-qwen_raw}"
QWEN_DIR="$(cd "$(dirname "$0")/../.." && pwd)/qwen_data"

if [[ ! -d "$QWEN_DIR" ]]; then
  echo "qwen_data not found at $QWEN_DIR" >&2
  exit 1
fi

upload() {
  local key="$1"
  local file="$2"
  local ctype="$3"
  echo ">> $key  ($(du -h "$file" | cut -f1))"
  npx wrangler r2 object put "${BUCKET}/${key}" \
    --file="${file}" \
    --content-type="${ctype}" \
    --remote
}

for robot in robot_01 robot_02 robot_03; do
  src="${QWEN_DIR}/${robot}"
  [[ -d "$src" ]] || { echo "  missing $src — skipping"; continue; }

  for f in robot.jsonl episode_events.jsonl session_metadata.json; do
    file="${src}/${f}"
    [[ -f "$file" ]] || { echo "  $robot/$f not present — skipping"; continue; }
    case "$f" in
      *.jsonl) ctype="application/x-ndjson" ;;
      *.json)  ctype="application/json" ;;
      *)       ctype="application/octet-stream" ;;
    esac
    upload "${PREFIX}/${robot}/${f}" "$file" "$ctype"
  done
done

echo "done. Container should set AURA_REPLAY_BASE_URL to https://<r2-public-host>/${PREFIX}"
