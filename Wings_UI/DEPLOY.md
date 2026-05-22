# Wings Of World Deploy Guide

Wings Of World runs as one Node.js process serving the React app and the Express API.

## Local Production

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
pnpm install
pnpm verify:release
pnpm build
pnpm start
```

Set `WINGS_OF_WORLD_DATA_DIR` to keep persistent data outside the source tree.

For the local operator machine, the maintained launcher is:

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
powershell -ExecutionPolicy Bypass -File .\start-wings-of-world-prod.ps1 -Port 3000
```

Stop local listeners owned by this checkout:

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
powershell -ExecutionPolicy Bypass -File .\stop-wings-of-world.ps1
```

The stop script only stops listeners whose command line points at this `Wings_UI` folder. Use `-Force` only after manually verifying a listener belongs to Wings Of World.

## Autostart

Install the Windows Startup launcher:

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
powershell -ExecutionPolicy Bypass -File .\install-wings-of-world-autostart.ps1
```

Remove it:

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
powershell -ExecutionPolicy Bypass -File .\uninstall-wings-of-world-autostart.ps1
```

Autostart uses `start-wings-of-world-autostart.ps1`, writes logs under `Wings_UI\logs`, and binds to loopback by default.

## Docker

```bash
docker build -t wings-of-world-ui .
docker run -d --name wings-of-world -p 3000:3000 -v wings_of_world_data:/data -e WINGS_OF_WORLD_DATA_DIR=/data wings-of-world-ui
```

## Fly.io

```bash
fly launch --no-deploy --copy-config --name wings-of-world
fly volumes create wings_of_world_data --size 1
fly deploy
```

## Render Or VPS

- Use the Dockerfile, or run `pnpm build` and `node dist/index.js`.
- Mount persistent storage and set `WINGS_OF_WORLD_DATA_DIR`.
- Put the service behind TLS and an authentication layer before exposing it publicly.

## Reverse Proxy

Terminate TLS at the proxy and forward only trusted traffic to the app:

```nginx
server {
  listen 443 ssl;
  server_name wings.example.com;

  ssl_certificate /etc/letsencrypt/live/wings.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/wings.example.com/privkey.pem;

  auth_basic "Wings Of World";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

Keep `HOST=127.0.0.1` unless the reverse proxy runs on another machine.

## Backup And Restore

Back up the whole `WINGS_OF_WORLD_DATA_DIR` directory while the service is stopped or after taking a filesystem snapshot. The important files are `wings-of-world.db`, `config.json`, `memory.json`, `workflows.json`, `chat-sessions.json`, `audit-log.json`, and `execution-history.json`.

Restore by placing the backup directory on the host, setting `WINGS_OF_WORLD_DATA_DIR` to that path, and restarting the service.

Example:

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Compress-Archive -Path ".\data\*" -DestinationPath "..\wings-data-backup-$stamp.zip"
```

To restore, stop the service, extract the backup into the chosen data directory, set `WINGS_OF_WORLD_DATA_DIR`, then start the service again.

## Security

- Do not bake `.env.local` into images.
- Prefer secrets managed by the hosting platform.
- Rotate any token that appeared in an older exported archive.
- Keep write-capable tools scoped with `WINGS_OF_WORLD_WORKSPACE_ROOTS`.
- Enable the in-app local password before shared use.
- Rotate provider and Telegram tokens after any failed release package inspection.
- Keep `HOST=127.0.0.1` for local production. If `HOST=0.0.0.0` is required, enable app authentication first and put TLS plus proxy auth in front of the service.

## Secret Rotation

Rotate secrets in the upstream service first, then update local config:

1. Stop Wings Of World.
2. Rotate the provider key or Telegram bot token at the provider.
3. Update `Wings_UI\.env.local` or the Settings page.
4. Start Wings Of World.
5. Run `pnpm verify:telegram` for Telegram surfaces and the Settings connection test for providers.

Never paste secrets into logs, docs, release notes, screenshots, or zip archives.

## Backend Gateway

Build and verify the adjacent backend before exposing gateway controls:

```powershell
cd "C:\Path\To\Wings Of World\Wings_Backend"
pnpm install
pnpm check
pnpm build
node wings-of-world-backend.mjs --help
```

The UI expects the backend gateway on `http://127.0.0.1:18789` unless `WINGS_OF_WORLD_BACKEND_GATEWAY_URL` is set. Keep the backend state under `WINGS_OF_WORLD_BACKEND_STATE_DIR` or the UI data directory.

## Release Process

Run the release gate from `Wings_UI`:

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
pnpm check
pnpm test
pnpm build
pnpm verify:auth
pnpm verify:telegram
pnpm verify:smoke
pnpm verify:browser
pnpm verify:release
```

Create the shareable archive only after the gate passes:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Path\To\Wings Of World\package-release.ps1"
```

The package script excludes `.env`, `.env.local`, `node_modules`, generated `dist`, runtime `data`, logs, local databases, and git metadata. It includes the restored backend source folders needed to rebuild and inspect the backend.

## Health

- `GET /health`
- `GET /api/system/health`

API routes remain under `/api/*` for compatibility.
