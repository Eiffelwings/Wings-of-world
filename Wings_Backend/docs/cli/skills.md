---
summary: "CLI reference for `mechanical-wings skills` (search/install/update/list/info/check)"
read_when:
  - You want to see which skills are available and ready to run
  - You want to search, install, or update skills from ClawHub
  - You want to debug missing binaries/env/config for skills
title: "skills"
---

# `mechanical-wings skills`

Inspect local skills and install/update skills from ClawHub.

Related:

- Skills system: [Skills](/tools/skills)
- Skills config: [Skills config](/tools/skills-config)
- ClawHub installs: [ClawHub](/tools/clawhub)

## Commands

```bash
mechanical-wings skills search "calendar"
mechanical-wings skills install <slug>
mechanical-wings skills install <slug> --version <version>
mechanical-wings skills update <slug>
mechanical-wings skills update --all
mechanical-wings skills list
mechanical-wings skills list --eligible
mechanical-wings skills info <name>
mechanical-wings skills check
```

`search`/`install`/`update` use ClawHub directly and install into the active
workspace `skills/` directory. `list`/`info`/`check` still inspect the local
skills visible to the current workspace and config.
