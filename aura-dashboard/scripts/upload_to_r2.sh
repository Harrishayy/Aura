#!/usr/bin/env bash
# Upload dashboard public assets to the auravids R2 bucket and set CORS.
# Requires `wrangler login` to have been run first.
set -euo pipefail

BUCKET="${R2_BUCKET:-auravids}"
PUBLIC_DIR="$(cd "$(dirname "$0")/.." && pwd)/public"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ------------------------------------------------------------------
# 1. Set CORS on the bucket so the browser can load assets cross-origin
# ------------------------------------------------------------------
echo "==> Setting CORS on bucket ${BUCKET}..."
npx wrangler r2 bucket cors set "${BUCKET}" --file="${SCRIPT_DIR}/r2_cors.json" --remote
echo "    CORS set."

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

# ------------------------------------------------------------------
# 2. Videos
# ------------------------------------------------------------------
echo "==> Uploading videos..."
for r in robot_01 robot_02 robot_03; do
  for f in "${PUBLIC_DIR}/videos/${r}"/*.mp4; do
    [[ -f "$f" ]] || continue
    upload "videos/${r}/$(basename "$f")" "$f" "video/mp4"
  done
done

# ------------------------------------------------------------------
# 3. Timelines (generate with: cd aura-fleet && uv run python scripts/build_timelines.py)
# ------------------------------------------------------------------
echo "==> Uploading timelines..."
for r in robot_01 robot_02 robot_03; do
  f="${PUBLIC_DIR}/qwen/${r}/timeline.json"
  [[ -f "$f" ]] || { echo "  skipping $r — no timeline.json (run build_timelines.py first)"; continue; }
  upload "qwen/${r}/timeline.json" "$f" "application/json"
done

echo "done."
