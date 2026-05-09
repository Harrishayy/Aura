#!/bin/sh
# Pull trimmed qwen_data jsonls from R2 into AURA_QWEN_DATA_DIR before the app starts.
# Idempotent: skips files that are already present and non-empty.
set -eu

DATA_DIR="${AURA_QWEN_DATA_DIR:-/data/qwen_data}"
BASE="${AURA_REPLAY_BASE_URL:-}"

if [ -z "$BASE" ]; then
  echo "ERROR: AURA_REPLAY_BASE_URL is not set." >&2
  echo "Set it on Railway to e.g. https://pub-XXXX.r2.dev/replay" >&2
  exit 1
fi

# Strip any trailing slash
BASE="${BASE%/}"

mkdir -p "$DATA_DIR"

fetch_one() {
  robot="$1"
  fname="$2"
  out="$DATA_DIR/$robot/$fname"
  if [ -s "$out" ]; then
    echo "skip  $robot/$fname"
    return 0
  fi
  if curl -fsSL --max-time 120 "$BASE/$robot/$fname" -o "$out"; then
    echo "fetch $robot/$fname ($(wc -c <"$out") bytes)"
  else
    echo "miss  $robot/$fname (placeholder)"
    : > "$out"
  fi
}

for robot in robot_01 robot_02 robot_03; do
  mkdir -p "$DATA_DIR/$robot"
  for fname in robot.jsonl episode_events.jsonl session_metadata.json; do
    fetch_one "$robot" "$fname" &
  done
done
wait

echo "replay data ready at $DATA_DIR"
exec "$@"
