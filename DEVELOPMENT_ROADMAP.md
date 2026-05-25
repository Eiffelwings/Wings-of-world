# Wings Of World Development Roadmap

## Current Status

Wings Of World is in a professional local-release state:

- Clean source tree with release-only content
- React + Express operations UI
- Chat, memory, tools, audit, history, analytics, Telegram bridge
- Visual workflow builder with trigger, LLM, code, tool, Telegram, condition, loop, and output nodes
- New `WINGS_OF_WORLD_*` environment names with compatibility fallbacks
- Primary CLI command `wings-of-world`

## Ready

- Local development and production build from `Wings_UI`
- Single-machine deployment using Node, Docker, Fly, Render, or a reverse proxy
- Workflow save/execute/history loop
- Tool registry and guarded tool execution
- Telegram chat bridge when `TELEGRAM_BOT_TOKEN` is configured
- SQLite-backed audit, cost, cache, and execution history features

## Experimental

- Advanced model cascade tuning
- Hermes memory synchronization
- Long-running macro automation
- Multi-provider cost forecasting
- External channel expansion beyond Telegram

## Next Priorities

1. Add browser-level E2E coverage for workflow authoring, condition branches, loop nodes, and Telegram delivery.
2. Add importable workflow templates for common automations.
3. Add richer MCP discovery UI for external servers beyond the built-in tool registry.
4. Harden deployment profiles with documented reverse-proxy auth and backup examples.
5. Add release automation that runs checks, verifies package cleanliness, and creates `Wings_Of_World_release.zip`.

