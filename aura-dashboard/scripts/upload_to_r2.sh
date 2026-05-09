#!/usr/bin/env bash
# Upload dashboard public assets to the auravids R2 bucket.
# Requires `wrangler login` to have been run first.
set -euo pipefail

BUCKET="${R2_BUCKET:-auravids}"
PUBLIC_DIR="$(cd "$(dirname "$0")/.." && pwd)/public"

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

# videos
for r in robot_01 robot_02 robot_03; do
  for f in "${PUBLIC_DIR}/videos/${r}"/*.mp4; do
    [[ -f "$f" ]] || continue
    upload "videos/${r}/$(basename "$f")" "$f" "video/mp4"
  done
done

# timelines
for r in robot_01 robot_02 robot_03; do
  f="${PUBLIC_DIR}/qwen/${r}/timeline.json"
  [[ -f "$f" ]] || continue
  upload "qwen/${r}/timeline.json" "$f" "application/json"
done

echo "done."
