# Wings Of World Backend

This backend package contains the multi-channel agent runtime used by Wings Of World. It powers gateway orchestration, channel integrations, tools, skills, and local assistant execution.

## Status

- Primary package name: `wings-of-world-backend`
- Primary binary: `wings-of-world-backend`
- Primary npm scripts: `pnpm wings-of-world-backend ...` and `pnpm wings-of-world-backend:rpc`
- Primary state/config env: `WINGS_OF_WORLD_BACKEND_STATE_DIR`, `WINGS_OF_WORLD_BACKEND_CONFIG_PATH`, `WINGS_OF_WORLD_BACKEND_GATEWAY_TOKEN`
- Legacy binary/scripts: `mechanical-wings` is retained only for compatibility with existing scripts and imports.
- Runtime env keys that still begin with `OPENCLAW_` are retained as compatibility aliases and are no longer the primary names for new deployments.
- Internal package imports that still reference `mechanical-wings/*` are compatibility surfaces and should be migrated gradually with focused tests, not renamed blindly.

## Development

```bash
pnpm install
pnpm test
pnpm build
```

Use the root project guides for release and deployment. Do not commit local `.env`, runtime data, generated builds, or logs.
