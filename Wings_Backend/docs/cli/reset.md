---
summary: "CLI reference for `mechanical-wings reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `mechanical-wings reset`

Reset local config/state (keeps the CLI installed).

```bash
mechanical-wings backup create
mechanical-wings reset
mechanical-wings reset --dry-run
mechanical-wings reset --scope config+creds+sessions --yes --non-interactive
```

Run `mechanical-wings backup create` first if you want a restorable snapshot before removing local state.
