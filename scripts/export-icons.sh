#!/bin/sh
# Asset-authoring helper on macOS; normal builds use committed PNGs.
set -eu
cd "$(dirname "$0")/.."
command -v sips >/dev/null 2>&1 || { echo 'Icon export requires macOS sips.' >&2; exit 1; }
mkdir -p public/icons
for size in 16 32 48 128; do
  sips -z "$size" "$size" assets/icon-masters/hourleaf-c-app.png --out "public/icons/icon-$size.png" >/dev/null
done
for size in 16 19 24 32 38 48; do
  sips -z "$size" "$size" assets/icon-masters/hourleaf-c-toolbar.png --out "public/icons/toolbar-$size.png" >/dev/null
  sips -z "$size" "$size" assets/icon-masters/hourleaf-c-toolbar-white.png --out "public/icons/toolbar-white-$size.png" >/dev/null
  sips -g hasAlpha "public/icons/toolbar-white-$size.png" | grep -q "hasAlpha: yes" || {
    echo "toolbar-white-$size.png lost its transparent rounded corners." >&2
    exit 1
  }
done
