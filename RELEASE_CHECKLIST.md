# Wings Of World Release Checklist

Use this before sharing `Wings_Of_World_release.zip`.

## Verify Source

- No `.env` or `.env.local`
- No `node_modules`
- No `dist` or generated build output
- No runtime `data` folder
- No logs, temp files, macOS metadata, or archived external projects
- No old source checkout paths in user-facing docs or defaults

## Install And Test

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
pnpm install
pnpm test
pnpm check
pnpm build
pnpm verify:smoke
pnpm verify:browser
pnpm verify:release
```

On a fresh machine, run `pnpm exec playwright install chromium` once before browser or release verification.

## Smoke Test

- Open the app and confirm the visible product name is `Wings Of World`
- Run `.\wings-of-world.cmd doctor`
- Confirm `.\wings.cmd doctor` still works as a compatibility alias
- Create and run a workflow with:
  - Trigger
  - Condition
  - Loop
  - Output
- Confirm tool picker loads registered tools

## Package

Create the release zip with the filtered packaging script:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Path\To\Wings Of World\package-release.ps1"
```

The script excludes local dependencies, build output, data folders, secrets, logs, temp files, old archive folders, and macOS metadata. Then inspect the zip before sharing.

`pnpm verify:release` creates a temporary package with the same script and fails if the zip contains blocked runtime or secret-bearing paths such as `.env`, `node_modules`, `dist`, `data`, logs, local databases, or `.git`.

The release zip includes the restored `Wings_Backend` source folders required for rebuild and audit. It intentionally excludes generated `dist` output; rebuild backend artifacts after install with:

```powershell
cd "Wings Of World\Wings_Backend"
pnpm install
pnpm check
pnpm build
node wings-of-world-backend.mjs --help
```
