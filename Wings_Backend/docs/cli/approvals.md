---
summary: "CLI reference for `mechanical-wings approvals` (exec approvals for gateway or node hosts)"
read_when:
  - You want to edit exec approvals from the CLI
  - You need to manage allowlists on gateway or node hosts
title: "approvals"
---

# `mechanical-wings approvals`

Manage exec approvals for the **local host**, **gateway host**, or a **node host**.
By default, commands target the local approvals file on disk. Use `--gateway` to target the gateway, or `--node` to target a specific node.

Related:

- Exec approvals: [Exec approvals](/tools/exec-approvals)
- Nodes: [Nodes](/nodes)

## Common commands

```bash
mechanical-wings approvals get
mechanical-wings approvals get --node <id|name|ip>
mechanical-wings approvals get --gateway
```

## Replace approvals from a file

```bash
mechanical-wings approvals set --file ./exec-approvals.json
mechanical-wings approvals set --node <id|name|ip> --file ./exec-approvals.json
mechanical-wings approvals set --gateway --file ./exec-approvals.json
```

## Allowlist helpers

```bash
mechanical-wings approvals allowlist add "~/Projects/**/bin/rg"
mechanical-wings approvals allowlist add --agent main --node <id|name|ip> "/usr/bin/uptime"
mechanical-wings approvals allowlist add --agent "*" "/usr/bin/uname"

mechanical-wings approvals allowlist remove "~/Projects/**/bin/rg"
```

## Notes

- `--node` uses the same resolver as `mechanical-wings nodes` (id, name, ip, or id prefix).
- `--agent` defaults to `"*"`, which applies to all agents.
- The node host must advertise `system.execApprovals.get/set` (macOS app or headless node host).
- Approvals files are stored per host at `~/.mechanical-wings/exec-approvals.json`.
