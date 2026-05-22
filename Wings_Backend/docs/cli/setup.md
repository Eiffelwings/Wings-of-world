---
summary: "CLI reference for `mechanical-wings setup` (initialize config + workspace)"
read_when:
  - You’re doing first-run setup without full CLI onboarding
  - You want to set the default workspace path
title: "setup"
---

# `mechanical-wings setup`

Initialize `~/.mechanical-wings/mechanical-wings.json` and the agent workspace.

Related:

- Getting started: [Getting started](/start/getting-started)
- CLI onboarding: [Onboarding (CLI)](/start/wizard)

## Examples

```bash
mechanical-wings setup
mechanical-wings setup --workspace ~/.mechanical-wings/workspace
```

To run onboarding via setup:

```bash
mechanical-wings setup --wizard
```
