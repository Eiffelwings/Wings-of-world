# Wings Of World

Wings Of World is a local-first AI operations workspace for chat, tools, visual workflows, memory, Telegram automation, and guarded agent execution.

Image generation is available in the `Images` page and as the `generate_image` tool. It uses the configured OpenAI Images API compatible endpoint and stores generated files under `WINGS_OF_WORLD_DATA_DIR`.

This repository is a cleaned professional handoff. It intentionally excludes local secrets, runtime data, dependency folders, generated builds, logs, and archived experiments.

## Project Layout

```text
Wings Of World/
|-- Wings_UI/        # React app, Express API, workflow engine, Telegram bridge
|-- Wings_Backend/   # Multi-channel backend and integration runtime
|-- README.md
|-- DEVELOPMENT_ROADMAP.md
|-- TODONEXT.md
`-- RELEASE_CHECKLIST.md
```

`Wings_Backend` is rebranded at the release-facing layer. Some internal imports and the legacy `mechanical-wings` binary are kept only for compatibility so existing backend modules do not break.

## Quick Start

Requirements:

- Node.js 22.14 or newer
- pnpm 10.x via Corepack
- Optional: Docker for containerized deployment

Run the app:

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
corepack enable
pnpm install
pnpm dev
```

Open the web app at `http://127.0.0.1:5173`.

The development stack uses Vite on port `5173` and the Express API on port `3001`.

## Backend Gateway

`Wings_UI` can monitor and start the adjacent `Wings_Backend` gateway from the System page. The gateway is expected at `http://127.0.0.1:18789` by default and exposes `/healthz` plus `/readyz`.

Prepare the backend once:

```powershell
cd "C:\Path\To\Wings Of World\Wings_Backend"
pnpm install --filter .
pnpm build
```

Then open `System -> Backend Gateway` in the UI and select `Start backend`, or run the displayed command manually.

If System reports missing `scripts/` or missing `dist/entry.(m)js`, this checkout does not contain a buildable backend archive. Restore the full `Wings_Backend` source package or set `WINGS_OF_WORLD_BACKEND_CLI` to an already built backend CLI.

Useful backend environment variables:

- `WINGS_OF_WORLD_BACKEND_CLI`: explicit path or command for a built backend CLI
- `WINGS_OF_WORLD_BACKEND_GATEWAY_URL`: gateway HTTP URL, default `http://127.0.0.1:18789`
- `WINGS_OF_WORLD_BACKEND_GATEWAY_PORT`: gateway port used by the UI start command, default `18789`
- `WINGS_OF_WORLD_BACKEND_STATE_DIR`: isolated backend runtime state, default under `WINGS_OF_WORLD_DATA_DIR`

Production build:

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
pnpm build
pnpm start
```

Release verification:

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
pnpm verify:release
```

For browser verification on a fresh machine, install the Playwright browser once:

```powershell
pnpm exec playwright install chromium
```

## CLI

The primary command is:

```powershell
.\wings-of-world.cmd help
.\wings-of-world.cmd dev
.\wings-of-world.cmd doctor
```

The older `wings` command is kept only as a compatibility alias.

## Configuration

Copy `Wings_UI\.env.example` to `Wings_UI\.env.local` for local settings.

Primary environment variables:

- `WINGS_OF_WORLD_DATA_DIR`: config, memory, workflows, audit, history
- `WINGS_OF_WORLD_TELEGRAM_POLLING`: enable or disable Telegram polling
- `WINGS_OF_WORLD_PROJECTS_ROOT`: project root used by project tools
- `WINGS_OF_WORLD_WORKSPACE_ROOTS`: guarded file-tool roots
- `OPENAI_IMAGE_MODEL`: optional default image model, e.g. `gpt-image-1`

Compatibility fallbacks such as `WINGS_DATA_DIR` and `WINGS_TELEGRAM_POLLING` are still accepted, but new setups should use the `WINGS_OF_WORLD_*` names.

## Workflow Builder

The builder supports the backend workflow node set:

- Trigger
- LLM
- Code
- Tool
- Send Telegram
- Condition
- Loop
- Output

Condition edges carry explicit `true` or `false` branch metadata. Loop nodes use bounded iteration and expose `context.item`, `context.index`, and `context.total` to body code.

## Security Notes

- No `.env`, `.env.local`, tokens, logs, local databases, `node_modules`, or `dist` folders are included in this cleaned project.
- Rotate any API key or Telegram token that appeared in older exported archives.
- Keep the app behind local auth or a trusted reverse proxy before exposing it beyond localhost.
- Write-capable tools are guarded by workspace roots and confirmation prompts.
- Runtime config is stored under `WINGS_OF_WORLD_DATA_DIR`; source-controlled config defaults are intentionally avoided.

## Release

Use `RELEASE_CHECKLIST.md` before sharing a package. The expected release artifact is:

```text
Wings_Of_World_release.zip
```
