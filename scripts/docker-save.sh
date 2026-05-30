#!/usr/bin/env bash
# Build image and save to tar for offline transfer to server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${IMAGE:-posfont-web:latest}"
OUT="${OUT:-$ROOT/dist/posfont-web.tar}"

cd "$ROOT"
mkdir -p "$(dirname "$OUT")"

echo "Building $IMAGE ..."
docker build -t "$IMAGE" .

echo "Saving to $OUT ..."
docker save "$IMAGE" -o "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "Done: $OUT ($SIZE)"
