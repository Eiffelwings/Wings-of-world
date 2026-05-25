# Wings Of World Next Work

## Highest-Value Follow-Ups

1. Run a full local verification pass after installing dependencies:
   - `pnpm test`
   - `pnpm check`
   - `pnpm build`
2. Add Playwright or browser-use smoke tests for:
   - Login/bootstrap
   - Workflow builder
   - Condition true/false branches
   - Loop node execution
   - Tool picker execution
3. Add a small workflow template library:
   - Summarize text
   - Search files and summarize matches
   - Telegram delivery
   - Conditional routing
   - Loop over line items
4. Document a production deployment with:
   - Reverse-proxy authentication
   - TLS
   - Backup and restore of `WINGS_OF_WORLD_DATA_DIR`
   - Secret rotation steps

## Operational Notes

- `Wings_UI/server/index.ts` remains the primary API/runtime entrypoint.
- Built-in tools are registered in the tool catalog and surfaced in the workflow tool picker.
- The primary env namespace is `WINGS_OF_WORLD_*`; older `WINGS_*` names remain compatibility fallbacks.
- Telegram should run in only one polling process at a time.

