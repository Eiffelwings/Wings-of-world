---
summary: "Run Wings🪽 in a rootless Podman container"
read_when:
  - You want a containerized gateway with Podman instead of Docker
title: "Podman"
---

# Podman

Run the Wings🪽 Gateway in a rootless Podman container, managed by your current non-root user.

The intended model is:

- Podman runs the gateway container.
- Your host `mechanical-wings` CLI is the control plane.
- Persistent state lives on the host under `~/.mechanical-wings` by default.
- Day-to-day management uses `mechanical-wings --container <name> ...` instead of `sudo -u mechanical-wings`, `podman exec`, or a separate service user.

## Prerequisites

- **Podman** in rootless mode
- **Wings🪽 CLI** installed on the host
- **Optional:** `systemd --user` if you want Quadlet-managed auto-start
- **Optional:** `sudo` only if you want `loginctl enable-linger "$(whoami)"` for boot persistence on a headless host

## Quick start

<Steps>
  <Step title="One-time setup">
    From the repo root, run `./scripts/podman/setup.sh`.
  </Step>

  <Step title="Start the Gateway container">
    Start the container with `./scripts/run-mechanical-wings-podman.sh launch`.
  </Step>

  <Step title="Run onboarding inside the container">
    Run `./scripts/run-mechanical-wings-podman.sh launch setup`, then open `http://127.0.0.1:18789/`.
  </Step>

  <Step title="Manage the running container from the host CLI">
    Set `OPENCLAW_CONTAINER=mechanical-wings`, then use normal `mechanical-wings` commands from the host.
  </Step>
</Steps>

Setup details:

- `./scripts/podman/setup.sh` builds `mechanical-wings:local` in your rootless Podman store by default, or uses `OPENCLAW_IMAGE` / `OPENCLAW_PODMAN_IMAGE` if you set one.
- It creates `~/.mechanical-wings/mechanical-wings.json` with `gateway.mode: "local"` if missing.
- It creates `~/.mechanical-wings/.env` with `OPENCLAW_GATEWAY_TOKEN` if missing.
- For manual launches, the helper reads only a small allowlist of Podman-related keys from `~/.mechanical-wings/.env` and passes explicit runtime env vars to the container; it does not hand the full env file to Podman.

Quadlet-managed setup:

```bash
./scripts/podman/setup.sh --quadlet
```

Quadlet is a Linux-only option because it depends on systemd user services.

You can also set `OPENCLAW_PODMAN_QUADLET=1`.

Optional build/setup env vars:

- `OPENCLAW_IMAGE` or `OPENCLAW_PODMAN_IMAGE` -- use an existing/pulled image instead of building `mechanical-wings:local`
- `OPENCLAW_DOCKER_APT_PACKAGES` -- install extra apt packages during image build
- `OPENCLAW_EXTENSIONS` -- pre-install extension dependencies at build time

Container start:

```bash
./scripts/run-mechanical-wings-podman.sh launch
```

The script starts the container as your current uid/gid with `--userns=keep-id` and bind-mounts your Wings🪽 state into the container.

Onboarding:

```bash
./scripts/run-mechanical-wings-podman.sh launch setup
```

Then open `http://127.0.0.1:18789/` and use the token from `~/.mechanical-wings/.env`.

Host CLI default:

```bash
export OPENCLAW_CONTAINER=mechanical-wings
```

Then commands such as these will run inside that container automatically:

```bash
mechanical-wings dashboard --no-open
mechanical-wings gateway status --deep
mechanical-wings doctor
mechanical-wings channels login
```

On macOS, Podman machine may make the browser appear non-local to the gateway.
If the Control UI reports device-auth errors after launch, prefer the SSH
tunnel flow in [macOS Podman SSH tunnel](#macos-podman-ssh-tunnel). For
remote HTTPS access, use the Tailscale guidance in
[Podman + Tailscale](#podman--tailscale).

## macOS Podman SSH tunnel

On macOS, Podman machine can make the browser appear non-local to the gateway even when the published port is only on `127.0.0.1`.

For local browser access, use an SSH tunnel into the Podman VM and open the tunneled localhost port instead.

Recommended local tunnel port:

- `28889` on the Mac host
- forwarded to `127.0.0.1:18789` inside the Podman VM

Start the tunnel in a separate terminal:

```bash
ssh -N \
  -i ~/.local/share/containers/podman/machine/machine \
  -p <podman-vm-ssh-port> \
  -L 28889:127.0.0.1:18789 \
  core@127.0.0.1
```

In that command, `<podman-vm-ssh-port>` is the Podman VM's SSH port on the Mac host. Check your current value with:

```bash
podman system connection list
```

Allow the tunneled browser origin once. This is required the first time you use the tunnel because the launcher can auto-seed the Podman-published port, but it cannot infer your chosen browser tunnel port:

```bash
OPENCLAW_CONTAINER=mechanical-wings mechanical-wings config set gateway.controlUi.allowedOrigins \
  '["http://127.0.0.1:18789","http://localhost:18789","http://127.0.0.1:28889","http://localhost:28889"]' \
  --strict-json
podman restart mechanical-wings
```

That is a one-time step for the default `28889` tunnel.

Then open:

```text
http://127.0.0.1:28889/
```

Notes:

- `18789` is usually already occupied on the Mac host by the Podman-published gateway port, so the tunnel uses `28889` as the local browser port.
- If the UI asks for pairing approval, prefer explicit container-targeted or explicit-URL commands so the host CLI does not fall back to local pairing files:

```bash
mechanical-wings --container mechanical-wings devices list
mechanical-wings --container mechanical-wings devices approve --latest
```

- Equivalent explicit-URL form:

```bash
mechanical-wings devices list \
  --url ws://127.0.0.1:28889 \
  --token "$(sed -n 's/^OPENCLAW_GATEWAY_TOKEN=//p' ~/.mechanical-wings/.env | head -n1)"
```

## Podman + Tailscale

For HTTPS or remote browser access, follow the main Tailscale docs.

Podman-specific note:

- Keep the Podman publish host at `127.0.0.1`.
- Prefer host-managed `tailscale serve` over `mechanical-wings gateway --tailscale serve`.
- For local macOS browser access without HTTPS, prefer the SSH tunnel section above.

See:

- [Tailscale](/gateway/tailscale)
- [Control UI](/web/control-ui)

## Systemd (Quadlet, optional)

If you ran `./scripts/podman/setup.sh --quadlet`, setup installs a Quadlet file at:

```bash
~/.config/containers/systemd/mechanical-wings.container
```

Useful commands:

- **Start:** `systemctl --user start mechanical-wings.service`
- **Stop:** `systemctl --user stop mechanical-wings.service`
- **Status:** `systemctl --user status mechanical-wings.service`
- **Logs:** `journalctl --user -u mechanical-wings.service -f`

After editing the Quadlet file:

```bash
systemctl --user daemon-reload
systemctl --user restart mechanical-wings.service
```

For boot persistence on SSH/headless hosts, enable lingering for your current user:

```bash
sudo loginctl enable-linger "$(whoami)"
```

## Config, env, and storage

- **Config dir:** `~/.mechanical-wings`
- **Workspace dir:** `~/.mechanical-wings/workspace`
- **Token file:** `~/.mechanical-wings/.env`
- **Launch helper:** `./scripts/run-mechanical-wings-podman.sh`

The launch script and Quadlet bind-mount host state into the container:

- `OPENCLAW_CONFIG_DIR` -> `/home/node/.mechanical-wings`
- `OPENCLAW_WORKSPACE_DIR` -> `/home/node/.mechanical-wings/workspace`

By default those are host directories, not anonymous container state, so config and workspace survive container replacement.
The Podman setup also seeds `gateway.controlUi.allowedOrigins` for `127.0.0.1` and `localhost` on the published gateway port so the local dashboard works with the container's non-loopback bind.

Useful env vars for the manual launcher:

- `OPENCLAW_PODMAN_CONTAINER` -- container name (`mechanical-wings` by default)
- `OPENCLAW_PODMAN_IMAGE` / `OPENCLAW_IMAGE` -- image to run
- `OPENCLAW_PODMAN_GATEWAY_HOST_PORT` -- host port mapped to container `18789`
- `OPENCLAW_PODMAN_BRIDGE_HOST_PORT` -- host port mapped to container `18790`
- `OPENCLAW_PODMAN_PUBLISH_HOST` -- host interface for published ports; default is `127.0.0.1`
- `OPENCLAW_GATEWAY_BIND` -- gateway bind mode inside the container; default is `lan`
- `OPENCLAW_PODMAN_USERNS` -- `keep-id` (default), `auto`, or `host`

The manual launcher reads `~/.mechanical-wings/.env` before finalizing container/image defaults, so you can persist these there.

If you use a non-default `OPENCLAW_CONFIG_DIR` or `OPENCLAW_WORKSPACE_DIR`, set the same variables for both `./scripts/podman/setup.sh` and later `./scripts/run-mechanical-wings-podman.sh launch` commands. The repo-local launcher does not persist custom path overrides across shells.

Quadlet note:

- The generated Quadlet service intentionally keeps a fixed, hardened default shape: `127.0.0.1` published ports, `--bind lan` inside the container, and `keep-id` user namespace.
- It still reads `~/.mechanical-wings/.env` for gateway runtime env such as `OPENCLAW_GATEWAY_TOKEN`, but it does not consume the manual launcher's Podman-specific override allowlist.
- If you need custom publish ports, publish host, or other container-run flags, use the manual launcher or edit `~/.config/containers/systemd/mechanical-wings.container` directly, then reload and restart the service.

## Useful commands

- **Container logs:** `podman logs -f mechanical-wings`
- **Stop container:** `podman stop mechanical-wings`
- **Remove container:** `podman rm -f mechanical-wings`
- **Open dashboard URL from host CLI:** `mechanical-wings dashboard --no-open`
- **Health/status via host CLI:** `mechanical-wings gateway status --deep`

## Troubleshooting

- **Permission denied (EACCES) on config or workspace:** The container runs with `--userns=keep-id` and `--user <your uid>:<your gid>` by default. Ensure the host config/workspace paths are owned by your current user.
- **Gateway start blocked (missing `gateway.mode=local`):** Ensure `~/.mechanical-wings/mechanical-wings.json` exists and sets `gateway.mode="local"`. `scripts/podman/setup.sh` creates this if missing.
- **Container CLI commands hit the wrong target:** Use `mechanical-wings --container <name> ...` explicitly, or export `OPENCLAW_CONTAINER=<name>` in your shell.
- **`mechanical-wings update` fails with `--container`:** Expected. Rebuild/pull the image, then restart the container or the Quadlet service.
- **Quadlet service does not start:** Run `systemctl --user daemon-reload`, then `systemctl --user start mechanical-wings.service`. On headless systems you may also need `sudo loginctl enable-linger "$(whoami)"`.
- **SELinux blocks bind mounts:** Leave the default mount behavior alone; the launcher auto-adds `:Z` on Linux when SELinux is enforcing or permissive.

## Related

- [Docker](/install/docker)
- [Gateway background process](/gateway/background-process)
- [Gateway troubleshooting](/gateway/troubleshooting)
