#!/usr/bin/env bash
# Load saved image and start container (run on server).
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
TAR="${TAR:-$DIR/posfont-web.tar}"
COMPOSE_FILE="${COMPOSE_FILE:-$DIR/docker-compose.prod.yml}"

cd "$DIR"

if [[ ! -f "$TAR" ]]; then
  echo "Missing $TAR" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing $COMPOSE_FILE" >&2
  exit 1
fi

if [[ ! -f "$DIR/.env" ]]; then
  cp "$DIR/.env.example" "$DIR/.env"
  echo "Created .env from .env.example — edit API_BASE_URL if needed."
fi

echo "Loading image from $TAR ..."
docker load -i "$TAR"

echo "Starting container ..."
docker compose -f "$COMPOSE_FILE" up -d

docker compose -f "$COMPOSE_FILE" ps
echo "App should be available on port ${APP_PORT:-888}"
