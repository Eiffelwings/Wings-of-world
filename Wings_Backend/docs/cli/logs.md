---
summary: "CLI reference for `mechanical-wings logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `mechanical-wings logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
mechanical-wings logs
mechanical-wings logs --follow
mechanical-wings logs --json
mechanical-wings logs --limit 500
mechanical-wings logs --local-time
mechanical-wings logs --follow --local-time
```

Use `--local-time` to render timestamps in your local timezone.
