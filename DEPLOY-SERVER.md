# Deploy Posfont Web

## LAN — 192.168.88.5

```bash
bash deploy-192.168.88.5.sh ky
```

Defaults:

| Setting | Value |
|---------|-------|
| host | `192.168.88.5` |
| dir | `/home/ky/opt/posfont` |
| port | `888` |
| api | `http://192.168.88.5:8080` |

Open: `http://192.168.88.5:888`

---

## Public — 203.150.243.87

## Quick deploy (same style as POS API)

```bash
bash deploy-203.150.243.87.sh root
```

Or one SSH step for load + run:

```bash
bash deploy-posfont-203.150.243.87.sh root
```

### Arguments

```bash
bash deploy-203.150.243.87.sh <host-user> [host-dir] [app-port] [api-base-url]
```

| Arg | Default | Example |
|-----|---------|---------|
| host-user | *(required)* | `root` |
| host-dir | `/home/root/posfont` | `/home/root/posfont` |
| app-port | `888` | `888` |
| api-base-url | `http://203.150.243.87:8080` | `http://203.150.243.87:8080` |

Example with custom path and port:

```bash
bash deploy-203.150.243.87.sh root /home/root/posfont 888
```

Verify:

- Browser: `http://203.150.243.87:888`
- Remote logs: `ssh root@203.150.243.87 "docker logs -f posfont-web"`

---

## Save / Load scripts (alternative)

```bash
bash scripts/docker-save.sh
export SERVER=root@203.150.243.87
export REMOTE_DIR=/home/root/posfont
bash scripts/docker-upload.sh
```

On server:

```bash
cd /home/root/posfont
cp .env.example .env
bash scripts/docker-load.sh
```

---

## Build on server (docker compose)

```bash
scp -r ./postfont2 root@203.150.243.87:/home/root/posfont-src
ssh root@203.150.243.87
cd /home/root/posfont-src
cp .env.example .env
docker compose up -d --build
```

---

## Run on boot

Deploy scripts use `--restart always` and run `systemctl enable docker` on the server so `posfont-web` starts after reboot.

For an already-running container without redeploying:

```bash
ssh ky@192.168.88.5 'bash -s' < scripts/enable-boot-restart.sh
```

Or on the server:

```bash
sudo systemctl enable docker
docker update --restart always posfont-web
```

---

- Container name: `posfont-web`
- Image: `posfont-web:latest`
- API requests proxied from `/api/*` to `API_BASE_URL` (Nginx inside container)
- POS API on same host should run on port `8080` (see `../api/pos/deploy-203.150.243.87.sh`)
