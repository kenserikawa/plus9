#!/usr/bin/env bash
# Records promo/thumbnail-animated.html into promo/thumbnail-animated.mp4: one headless-Chrome
# screenshot per frame (628×628 at device scale 2 = 1256×1256), then ffmpeg encodes the loop.
# Headless Chrome's viewport is shorter than its window, so the window is taller and ffmpeg
# crops the top 1256×1256.
#   FFMPEG=/path/to/ffmpeg tools/record-thumbnail.sh [fps]
# Needs google-chrome and ffmpeg (any build; `pip install imageio-ffmpeg` ships one).
set -euo pipefail

FPS=${1:-30}
LOOP=3.2 # seconds, keep in step with LOOP in the page
FFMPEG=${FFMPEG:-ffmpeg}
CHROME=${CHROME:-google-chrome}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PAGE="file://$ROOT/promo/thumbnail-animated.html"
FRAMES=$(mktemp -d)
trap 'rm -rf "$FRAMES"' EXIT

COUNT=$(awk "BEGIN { print int($LOOP * $FPS + 0.5) }")
for ((i = 0; i < COUNT; i++)); do
    t=$(awk "BEGIN { printf \"%.5f\", $i / $FPS }")
    "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
        --window-size=628,760 --virtual-time-budget=3000 \
        --screenshot="$FRAMES/$(printf '%04d' "$i").png" "$PAGE?capture&t=$t" >/dev/null 2>&1
    printf '\rframe %d/%d' "$((i + 1))" "$COUNT"
done
echo

"$FFMPEG" -y -loglevel error -framerate "$FPS" -i "$FRAMES/%04d.png" \
    -vf crop=1256:1256:0:0 -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -movflags +faststart \
    "$ROOT/promo/thumbnail-animated.mp4"
echo "wrote promo/thumbnail-animated.mp4 ($COUNT frames at $FPS fps)"
