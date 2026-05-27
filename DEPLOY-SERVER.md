# Deploy on 203.150.243.87:8888

## 1) Copy project to server

```bash
scp -r ./postfont2 <user>@203.150.243.87:/opt/postfont2
```

## 2) SSH and prepare env

```bash
ssh <user>@203.150.243.87
cd /opt/postfont2
cp .env.example .env
```

Edit `.env` if your API is not on the same host:

```env
APP_PORT=8888
API_BASE_URL=http://host.docker.internal:8080
```

## 3) Start app

```bash
docker compose up -d --build
docker compose ps
```

## 4) Open firewall port 8888

If using `ufw`:

```bash
sudo ufw allow 8888/tcp
sudo ufw status
```

If using `firewalld`:

```bash
sudo firewall-cmd --permanent --add-port=8888/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-ports
```

## 5) Verify

- Browser: `http://203.150.243.87:8888`
- Logs: `docker compose logs -f web`

## Notes

- Container is configured with `restart: unless-stopped` for auto-restart.
- API requests are proxied by Nginx from `/api/*` to `API_BASE_URL`.
