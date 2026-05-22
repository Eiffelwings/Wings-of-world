---
summary: "CLI reference for `mechanical-wings browser` (profiles, tabs, actions, Chrome MCP, and CDP)"
read_when:
  - You use `mechanical-wings browser` and want examples for common tasks
  - You want to control a browser running on another machine via a node host
  - You want to attach to your local signed-in Chrome via Chrome MCP
title: "browser"
---

# `mechanical-wings browser`

Manage Wings🪽’s browser control server and run browser actions (tabs, snapshots, screenshots, navigation, clicks, typing).

Related:

- Browser tool + API: [Browser tool](/tools/browser)

## Common flags

- `--url <gatewayWsUrl>`: Gateway WebSocket URL (defaults to config).
- `--token <token>`: Gateway token (if required).
- `--timeout <ms>`: request timeout (ms).
- `--browser-profile <name>`: choose a browser profile (default from config).
- `--json`: machine-readable output (where supported).

## Quick start (local)

```bash
mechanical-wings browser profiles
mechanical-wings browser --browser-profile mechanical-wings start
mechanical-wings browser --browser-profile mechanical-wings open https://example.com
mechanical-wings browser --browser-profile mechanical-wings snapshot
```

## Profiles

Profiles are named browser routing configs. In practice:

- `mechanical-wings`: launches or attaches to a dedicated Wings🪽-managed Chrome instance (isolated user data dir).
- `user`: controls your existing signed-in Chrome session via Chrome DevTools MCP.
- custom CDP profiles: point at a local or remote CDP endpoint.

```bash
mechanical-wings browser profiles
mechanical-wings browser create-profile --name work --color "#FF5A36"
mechanical-wings browser create-profile --name chrome-live --driver existing-session
mechanical-wings browser delete-profile --name work
```

Use a specific profile:

```bash
mechanical-wings browser --browser-profile work tabs
```

## Tabs

```bash
mechanical-wings browser tabs
mechanical-wings browser open https://docs.wings-of-world.ai
mechanical-wings browser focus <targetId>
mechanical-wings browser close <targetId>
```

## Snapshot / screenshot / actions

Snapshot:

```bash
mechanical-wings browser snapshot
```

Screenshot:

```bash
mechanical-wings browser screenshot
```

Navigate/click/type (ref-based UI automation):

```bash
mechanical-wings browser navigate https://example.com
mechanical-wings browser click <ref>
mechanical-wings browser type <ref> "hello"
```

## Existing Chrome via MCP

Use the built-in `user` profile, or create your own `existing-session` profile:

```bash
mechanical-wings browser --browser-profile user tabs
mechanical-wings browser create-profile --name chrome-live --driver existing-session
mechanical-wings browser create-profile --name brave-live --driver existing-session --user-data-dir "~/Library/Application Support/BraveSoftware/Brave-Browser"
mechanical-wings browser --browser-profile chrome-live tabs
```

This path is host-only. For Docker, headless servers, Browserless, or other remote setups, use a CDP profile instead.

## Remote browser control (node host proxy)

If the Gateway runs on a different machine than the browser, run a **node host** on the machine that has Chrome/Brave/Edge/Chromium. The Gateway will proxy browser actions to that node (no separate browser control server required).

Use `gateway.nodes.browser.mode` to control auto-routing and `gateway.nodes.browser.node` to pin a specific node if multiple are connected.

Security + remote setup: [Browser tool](/tools/browser), [Remote access](/gateway/remote), [Tailscale](/gateway/tailscale), [Security](/gateway/security)
