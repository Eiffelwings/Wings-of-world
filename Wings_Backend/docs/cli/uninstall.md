---
summary: "CLI reference for `mechanical-wings uninstall` (remove gateway service + local data)"
read_when:
  - You want to remove the gateway service and/or local state
  - You want a dry-run first
title: "uninstall"
---

# `mechanical-wings uninstall`

Uninstall the gateway service + local data (CLI remains).

```bash
mechanical-wings backup create
mechanical-wings uninstall
mechanical-wings uninstall --all --yes
mechanical-wings uninstall --dry-run
```

Run `mechanical-wings backup create` first if you want a restorable snapshot before removing state or workspaces.
