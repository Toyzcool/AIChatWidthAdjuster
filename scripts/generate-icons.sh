#!/usr/bin/env bash
# Generate icon16/48/128.png from a source image using macOS `sips`.
# Usage: scripts/generate-icons.sh <source-image>
# Example: scripts/generate-icons.sh ~/Downloads/icon-source.png

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <source-image>" >&2
  exit 1
fi

SRC="$1"
if [ ! -f "$SRC" ]; then
  echo "Source image not found: $SRC" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for size in 16 48 128; do
  out="$ROOT/icon${size}.png"
  sips -s format png -Z "$size" "$SRC" --out "$out" >/dev/null
  echo "✓ $out (${size}x${size})"
done

# Keep legacy icon.png pointing at the 128 version for back-compat.
cp "$ROOT/icon128.png" "$ROOT/icon.png"
echo "✓ $ROOT/icon.png (copy of 128)"
