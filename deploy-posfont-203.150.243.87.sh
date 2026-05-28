#!/usr/bin/env bash
set -euo pipefail

HOST_IP="203.150.243.87"
HOST_USER="${1:-}"
HOST_DIR="/home/root/posfont"
APP_PORT="888"
API_BASE_URL="http://203.150.243.87:8080"
IMAGE="posfont-web:latest"
TAR="posfont-web.tar"

if [[ -z "${HOST_USER}" ]]; then
  echo "Usage: $0 <host-user> [host-dir|port] [port|api-url] [api-url]"
  echo "Examples:"
  echo "  $0 root"
  echo "  $0 root 888"
  echo "  $0 root 888 http://203.150.243.87:8080"
  echo "  $0 root /home/root/posfont 888 http://203.150.243.87:8080"
  exit 1
fi

shift || true
for arg in "$@"; do
  if [[ "$arg" =~ ^[0-9]+$ ]]; then
    APP_PORT="$arg"
  elif [[ "$arg" == http://* || "$arg" == https://* ]]; then
    API_BASE_URL="$arg"
  elif [[ "$arg" == /* ]]; then
    HOST_DIR="$arg"
  else
    echo "Unknown argument: $arg" >&2
    exit 1
  fi
done

echo "Building posfont-web image..."
docker build -t "${IMAGE}" .

echo "Exporting posfont-web image archive..."
docker save "${IMAGE}" -o "${TAR}"

echo "Uploading ${TAR} to ${HOST_USER}@${HOST_IP}:${HOST_DIR} ..."
ssh "${HOST_USER}@${HOST_IP}" "mkdir -p '${HOST_DIR}'"
scp "${TAR}" "${HOST_USER}@${HOST_IP}:${HOST_DIR}/"

echo "Loading image and starting container on remote host..."
echo "  port=${APP_PORT}  api=${API_BASE_URL}"
ssh "${HOST_USER}@${HOST_IP}" "systemctl enable docker 2>/dev/null || true"
ssh "${HOST_USER}@${HOST_IP}" "\
docker load -i '${HOST_DIR}/${TAR}' && \
docker rm -f posfont-web >/dev/null 2>&1 || true; \
docker run -d --name posfont-web --restart always \
  -p '${APP_PORT}:80' \
  -e API_BASE_URL='${API_BASE_URL}' \
  --add-host=host.docker.internal:host-gateway \
  ${IMAGE}; \
docker ps --filter name=posfont-web \
"

echo "Done. Open http://${HOST_IP}:${APP_PORT}"
