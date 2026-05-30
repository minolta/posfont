#!/usr/bin/env bash
set -euo pipefail

HOST_IP="203.150.243.87"
HOST_USER="${1:-}"
# Default to /root/posfont because Snap Docker often cannot read /opt paths.
HOST_DIR="${2:-/root/posfont}"
WEB_PORT="${3:-4200}"
POS_API_BASE_URL="${POS_API_BASE_URL:-http://${HOST_IP}:8080}"
IMAGE_NAME="posfont:latest"
CONTAINER_NAME="posfont"

if [[ -z "${HOST_USER}" ]]; then
  echo "Usage: $0 <host-user> [host-dir] [web-port]"
  echo ""
  echo "  host-user   SSH user on ${HOST_IP} (required)"
  echo "  host-dir    Remote directory for image tar (default: /root/posfont)"
  echo "  web-port    Host port mapped to container port 80 (default: 4200)"
  echo ""
  echo "Environment:"
  echo "  POS_API_BASE_URL  API origin baked into the build (default: http://${HOST_IP}:8080)"
  echo ""
  echo "Backend API deploy (separate): f:/src/pos/api/pos/deploy-203.150.243.87.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "Building ${IMAGE_NAME} (API: ${POS_API_BASE_URL})..."
docker build \
  --build-arg "POS_API_BASE_URL=${POS_API_BASE_URL}" \
  -t "${IMAGE_NAME}" \
  .

echo "Exporting image archive..."
docker save "${IMAGE_NAME}" -o posfont.tar

echo "Uploading files to ${HOST_USER}@${HOST_IP}:${HOST_DIR} ..."
ssh "${HOST_USER}@${HOST_IP}" "mkdir -p '${HOST_DIR}'"
scp posfont.tar "${HOST_USER}@${HOST_IP}:${HOST_DIR}/"

echo "Loading image and starting container on remote host..."
ssh "${HOST_USER}@${HOST_IP}" "\
docker load -i '${HOST_DIR}/posfont.tar'; \
docker rm -f ${CONTAINER_NAME} >/dev/null 2>&1 || true; \
docker run -d --name ${CONTAINER_NAME} --restart always \
  -p '${WEB_PORT}:80' \
  ${IMAGE_NAME}; \
docker ps --filter name=${CONTAINER_NAME} \
"

echo "Done. UI: http://${HOST_IP}:${WEB_PORT}  API: ${POS_API_BASE_URL}"
