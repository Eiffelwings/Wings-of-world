---
summary: "CLI reference for `mechanical-wings health` (gateway health endpoint via RPC)"
read_when:
  - You want to quickly check the running Gateway’s health
title: "health"
---

# `mechanical-wings health`

Fetch health from the running Gateway.

```bash
mechanical-wings health
mechanical-wings health --json
mechanical-wings health --verbose
```

Notes:

- `--verbose` runs live probes and prints per-account timings when multiple accounts are configured.
- Output includes per-agent session stores when multiple agents are configured.
