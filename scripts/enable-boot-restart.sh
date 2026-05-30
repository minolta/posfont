#!/usr/bin/env bash
# Apply boot restart policy to an existing posfont-web container (run on server).
set -euo pipefail

if ! docker ps -a --format '{{.Names}}' | grep -qx 'posfont-web'; then
  echo "Container posfont-web not found. Deploy first." >&2
  exit 1
fi

systemctl enable docker 2>/dev/null || true
docker update --restart always posfont-web
docker start posfont-web 2>/dev/null || true

echo "Restart policy: always"
docker inspect posfont-web --format 'Status={{.State.Status}} Restart={{.HostConfig.RestartPolicy.Name}}'
