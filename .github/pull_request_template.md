## Summary

-

## Scope

- [ ] `Wings_UI`
- [ ] `Wings_Backend`
- [ ] Docs / onboarding
- [ ] CI / release / packaging
- [ ] Security / auth / secrets
- [ ] External channels such as LINE, Telegram, email, webhooks, or social media

## Evidence

Claims should be backed by files, commands, logs, tests, or clearly labeled assumptions.

- Key files:
- Verification commands:
- Runtime/browser evidence:
- Assumptions:

## Security And Privacy Checklist

- [ ] No `.env`, `.env.local`, local config, API keys, channel tokens, private keys, database files, logs, `data`, `dist`, `node_modules`, or release archives are included.
- [ ] Secret scan was run or this PR only changes docs with no secret-like values.
- [ ] Auth, token, tool execution, file access, network fetch, image generation, webhook, or process-spawn changes include a security note.
- [ ] No real customer messages, LINE/Telegram sends, emails, social posts, payments, ads, or production deploys were performed without explicit approval.
- [ ] New external side effects default to draft/simulation mode or require human approval.

## Tests

- [ ] `Wings_UI`: `pnpm check`
- [ ] `Wings_UI`: `pnpm test`
- [ ] `Wings_UI`: `pnpm build`
- [ ] `Wings_UI`: `pnpm verify:smoke`
- [ ] `Wings_UI`: `pnpm audit --prod`
- [ ] `Wings_Backend`: `node wings-of-world-backend.mjs --help`
- [ ] `Wings_Backend`: `pnpm check`
- [ ] `Wings_Backend`: `pnpm build`
- [ ] `Wings_Backend`: `pnpm test`
- [ ] Not run, with reason:

## Rollback Plan

- Files/config touched:
- Safe undo path:
- Data migration or irreversible step:

## Definition Of Done

- [ ] Brief implemented.
- [ ] Critical gaps fixed or listed as blockers.
- [ ] Remaining risks are explicit.
- [ ] Docs/tests updated when behavior changed.
- [ ] Next action is clear.
