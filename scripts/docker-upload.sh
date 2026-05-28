#!/usr/bin/env bash
# Upload saved image and compose files to server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="${SERVER:-root@203.150.243.87}"
REMOTE_DIR="${REMOTE_DIR:-/home/root/posfont}"
TAR="${TAR:-$ROOT/dist/posfont-web.tar}"

cd "$ROOT"

if [[ ! -f "$TAR" ]]; then
  echo "Missing $TAR — run scripts/docker-save.sh first." >&2
  exit 1
fi

echo "Creating $REMOTE_DIR on $SERVER ..."
ssh "$SERVER" "mkdir -p $REMOTE_DIR/scripts"

echo "Uploading image and deploy files ..."
scp "$TAR" "$SERVER:$REMOTE_DIR/"
scp "$ROOT/docker-compose.prod.yml" "$ROOT/.env.example" "$SERVER:$REMOTE_DIR/"
scp "$ROOT/scripts/docker-load.sh" "$SERVER:$REMOTE_DIR/scripts/"

echo "Done. On server run:"
echo "  ssh $SERVER"
echo "  cd $REMOTE_DIR && cp .env.example .env && bash scripts/docker-load.sh"
