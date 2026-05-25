---
summary: "Uninstall Wings🪽 completely (CLI, service, state, workspace)"
read_when:
  - You want to remove Wings🪽 from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `mechanical-wings` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
mechanical-wings uninstall
```

Non-interactive (automation / npx):

```bash
mechanical-wings uninstall --all --yes --non-interactive
npx -y mechanical-wings uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
mechanical-wings gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
mechanical-wings gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${OPENCLAW_STATE_DIR:-$HOME/.mechanical-wings}"
```

If you set `OPENCLAW_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.mechanical-wings/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g mechanical-wings
pnpm remove -g mechanical-wings
bun remove -g mechanical-wings
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/Wings🪽.app
```

Notes:

- If you used profiles (`--profile` / `OPENCLAW_PROFILE`), repeat step 3 for each state dir (defaults are `~/.mechanical-wings-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `mechanical-wings` is missing.

### macOS (launchd)

Default label is `ai.mechanical-wings.gateway` (or `ai.mechanical-wings.<profile>`; legacy `com.mechanical-wings.*` may still exist):

```bash
launchctl bootout gui/$UID/ai.mechanical-wings.gateway
rm -f ~/Library/LaunchAgents/ai.mechanical-wings.gateway.plist
```

If you used a profile, replace the label and plist name with `ai.mechanical-wings.<profile>`. Remove any legacy `com.mechanical-wings.*` plists if present.

### Linux (systemd user unit)

Default unit name is `mechanical-wings-gateway.service` (or `mechanical-wings-gateway-<profile>.service`):

```bash
systemctl --user disable --now mechanical-wings-gateway.service
rm -f ~/.config/systemd/user/mechanical-wings-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `Wings🪽 Gateway` (or `Wings🪽 Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "Wings🪽 Gateway"
Remove-Item -Force "$env:USERPROFILE\.mechanical-wings\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.mechanical-wings-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://wings-of-world.ai/install.sh` or `install.ps1`, the CLI was installed with `npm install -g mechanical-wings@latest`.
Remove it with `npm rm -g mechanical-wings` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `mechanical-wings ...` / `bun run mechanical-wings ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
