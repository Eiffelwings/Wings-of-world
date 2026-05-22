# Wings Of World Ready Guide

## Start Development

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
.\wings-of-world.cmd dev
```

Open `http://127.0.0.1:5173`.

Development ports:

- Web UI: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001`

## Start Production

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
.\wings-of-world.cmd prod
```

Open `http://127.0.0.1:3000`.

Stop local Wings listeners:

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-wings-of-world.ps1
```

## CLI

Primary command:

```powershell
.\wings-of-world.cmd help
.\wings-of-world.cmd doctor
.\wings-of-world.cmd check
```

Compatibility alias:

```powershell
.\wings.cmd help
```

Install the CLI into the user PATH:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-wings-of-world-cli.ps1
```

## First Use

1. Open the UI.
2. Go to Settings.
3. Choose Codex Local Login with `gpt-5.5` if the Codex CLI is already logged in.
4. Or choose a direct provider and add an API key.
5. Save settings and test the connection.
6. Create an app password when prompted.

## Telegram

1. Create a Telegram bot with BotFather.
2. Copy `.env.example` to `.env.local`.
3. Set `TELEGRAM_BOT_TOKEN`.
4. Optionally set `TELEGRAM_ALLOWED_CHAT_IDS`.
5. Restart Wings Of World.
6. Open the Telegram page and verify bridge status.

Run only one Telegram polling instance per bot token.

If another bot runtime reports Telegram `409 Conflict`, stop the competing poller or set `WINGS_OF_WORLD_TELEGRAM_POLLING=false` for this app.

## Data Location

Use `WINGS_OF_WORLD_DATA_DIR` to control where config, memory, workflows, audit, history, and artifacts are stored.

Default local CLI runs use:

```text
Wings_UI\data
```

## Verification

```powershell
pnpm test
pnpm check
pnpm build
pnpm verify:smoke
pnpm verify:browser
pnpm verify:release
```

On a fresh machine, run `pnpm exec playwright install chromium` once before `pnpm verify:browser` or `pnpm verify:release`.

`pnpm verify:release` runs the core checks, browser smoke test, production smoke test, and release zip cleanliness inspection.
