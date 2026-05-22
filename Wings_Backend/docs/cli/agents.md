---
summary: "CLI reference for `mechanical-wings agents` (list/add/delete/bindings/bind/unbind/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `mechanical-wings agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
mechanical-wings agents list
mechanical-wings agents add work --workspace ~/.mechanical-wings/workspace-work
mechanical-wings agents bindings
mechanical-wings agents bind --agent work --bind telegram:ops
mechanical-wings agents unbind --agent work --bind telegram:ops
mechanical-wings agents set-identity --workspace ~/.mechanical-wings/workspace --from-identity
mechanical-wings agents set-identity --agent main --avatar avatars/mechanical-wings.png
mechanical-wings agents delete work
```

## Routing bindings

Use routing bindings to pin inbound channel traffic to a specific agent.

List bindings:

```bash
mechanical-wings agents bindings
mechanical-wings agents bindings --agent work
mechanical-wings agents bindings --json
```

Add bindings:

```bash
mechanical-wings agents bind --agent work --bind telegram:ops --bind discord:guild-a
```

If you omit `accountId` (`--bind <channel>`), Wings🪽 resolves it from channel defaults and plugin setup hooks when available.

### Binding scope behavior

- A binding without `accountId` matches the channel default account only.
- `accountId: "*"` is the channel-wide fallback (all accounts) and is less specific than an explicit account binding.
- If the same agent already has a matching channel binding without `accountId`, and you later bind with an explicit or resolved `accountId`, Wings🪽 upgrades that existing binding in place instead of adding a duplicate.

Example:

```bash
# initial channel-only binding
mechanical-wings agents bind --agent work --bind telegram

# later upgrade to account-scoped binding
mechanical-wings agents bind --agent work --bind telegram:ops
```

After the upgrade, routing for that binding is scoped to `telegram:ops`. If you also want default-account routing, add it explicitly (for example `--bind telegram:default`).

Remove bindings:

```bash
mechanical-wings agents unbind --agent work --bind telegram:ops
mechanical-wings agents unbind --agent work --all
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.mechanical-wings/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
mechanical-wings agents set-identity --workspace ~/.mechanical-wings/workspace --from-identity
```

Override fields explicitly:

```bash
mechanical-wings agents set-identity --agent main --name "Wings🪽" --emoji "🪽" --avatar avatars/mechanical-wings.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "Wings🪽",
          theme: "space lobster",
          emoji: "🪽",
          avatar: "avatars/mechanical-wings.png",
        },
      },
    ],
  },
}
```
