# Contributing To Wings Of World

Thanks for helping improve Wings Of World. This repository is intended to be safe for public collaboration while keeping private local runtime data out of git.

## Start Here

Read these first:

- `README.md` for setup and architecture.
- `AGENTS.md` for agent permissions, rollback, evidence, approval gates, and Definition of Done.
- `SECURITY.md` for secret handling and vulnerability reporting.
- `LINE_SMALL_OPERATOR_AUTOMATION.md` for the honest LINE boundary between draft workflows and real backend channel sending.

## Local Setup

UI:

```powershell
cd "C:\Path\To\Wings Of World\Wings_UI"
corepack enable
pnpm install
pnpm dev
```

Backend:

```powershell
cd "C:\Path\To\Wings Of World\Wings_Backend"
corepack enable
pnpm install --filter .
node wings-of-world-backend.mjs --help
```

Copy `.env.example` to a local untracked env file only when needed. Never commit real values.

## Branches And Pull Requests

- Create a focused branch for each change.
- Keep PRs small enough to review.
- Include what changed, why, how it was tested, and what remains blocked.
- Do not mix unrelated UI polish, backend refactors, dependency changes, and release packaging in one PR unless the dependency is required.
- Never force-push over other people's work without coordination.

## Required Checks

For `Wings_UI` changes, run:

```powershell
pnpm check
pnpm test
pnpm build
pnpm verify:smoke
```

For release-readiness changes, also run:

```powershell
pnpm audit --prod
pnpm verify:auth
pnpm verify:browser
pnpm verify:release
```

For `Wings_Backend` changes, run the smallest relevant targeted tests first, then the broader gates when feasible:

```powershell
node wings-of-world-backend.mjs --help
pnpm check
pnpm build
pnpm test
```

If a check cannot be run, state the reason and the remaining risk in the PR.

## Security And Privacy Rules

Do not commit:

- `.env`, `.env.local`, local config with secrets, API keys, Telegram/LINE tokens, private keys, certs, local databases, logs, `data`, `dist`, `node_modules`, release zips, or screenshots containing secrets.

Do not do live external actions in a PR:

- No real LINE/Telegram/customer messages.
- No production deploys.
- No paid operations.
- No customer data edits.

If a change touches auth, tokens, workspace file access, tool execution, process spawning, network fetches, image generation, channel webhooks, or release packaging, include a security note in the PR.

## Definition Of Done

A change is done when:

- The brief is implemented.
- Critical gaps are fixed or explicitly listed as blockers.
- Relevant checks were run.
- Security/privacy side effects are understood.
- Rollback path is clear.
- Docs/tests are updated when behavior changes.
- No untracked runtime artifact or secret is staged.

## Project Priorities

Prefer this order:

1. Security and data-loss risks.
2. Runtime blockers.
3. Verification/build/test failures.
4. Integration gaps.
5. UX and productivity improvements.
6. Refactors and polish.

## LINE And Small Operator Workflows

The UI may prepare reply drafts, daily plans, and triage decisions. Real LINE send/webhook behavior must go through the backend LINE plugin and requires credentials, HTTPS webhook verification, pairing/allowlists, and audit logging.

Keep small-operator automation practical: reduce repetitive work, protect customer trust, and avoid taking live actions without approval.
