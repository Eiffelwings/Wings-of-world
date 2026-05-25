# Wings Of World Production Deployment

This directory contains deployment notes and a hardened systemd unit template.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `WINGS_OF_WORLD_DATA_DIR` | platform default | Persistent config, SQLite, workflows, memory, audit |
| `TELEGRAM_BOT_TOKEN` | empty | Optional Telegram bridge |

The older `WINGS_DATA_DIR` name is still accepted as a compatibility fallback.

## Docker

```bash
docker compose up -d --build
docker compose logs -f wings-of-world
```

## Systemd

```bash
sudo useradd --system --home /var/lib/wings-of-world --shell /usr/sbin/nologin wings-of-world
sudo install -d -o wings-of-world -g wings-of-world -m 750 /var/lib/wings-of-world
sudo mkdir -p /opt/wings-of-world
sudo cp deploy/wings-of-world.service /etc/systemd/system/wings-of-world.service
sudo systemctl enable --now wings-of-world
journalctl -u wings-of-world -f
```

## Reverse Proxy

Terminate TLS and add authentication before exposing the service outside a trusted network.

Minimal Nginx shape:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
}
```

Use TLS certificates from your platform or ACME client, and add either reverse-proxy auth or the Wings Of World app password before exposing the host.

Health checks:

- `/health`
- `/healthz`

## Backup

Back up the full `WINGS_OF_WORLD_DATA_DIR` directory, especially `wings-of-world.db`, `config.json`, `memory.json`, and `workflows.json`.

For restore, stop the process, replace the data directory with the backup, keep file permissions restricted to the service user, then start the service again.
