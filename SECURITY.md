# Security Policy

Wings Of World is a local-first AI operations workspace. Treat it as a privileged local automation system: it can hold provider keys, chat-channel tokens, workflow history, local memory, file-tool access, and backend gateway credentials.

## Supported Scope

Security reports should cover:

- `Wings_UI`: Express API, React UI, workflow execution, tools, image generation, Telegram bridge, API tokens, auth, memory, audit logs, release packaging.
- `Wings_Backend`: gateway, channels, plugins, pairing, approvals, sandboxing, secrets, memory, cron, device/session handling.
- Root scripts and GitHub workflows that affect release, packaging, publication, and repository safety.

## Report A Vulnerability

Do not open a public GitHub issue that includes secrets, tokens, private URLs, customer data, exploit payloads against a live deployment, or private logs.

Preferred report content:

- Affected component and version/commit.
- Exact file/function/route when known.
- Impact and attack path.
- Minimal reproduction steps using placeholders.
- Whether the issue requires local access, authenticated access, network exposure, or a real channel token.
- Suggested fix, if available.

If a private reporting channel is unavailable, open a minimal public issue that says a private security report is available, without exploit details or secrets.

## Secrets And Private Data

Never commit:

- `.env`, `.env.local`, provider keys, Telegram/LINE tokens, GitHub tokens, private keys, certs, local databases, runtime `data`, logs, generated `dist`, `node_modules`, or release archives.
- Real chat IDs, customer IDs, user records, payment records, screenshots containing tokens, or local machine-specific config.

Allowed:

- `.env.example` files with placeholders only.
- Tests that use clearly fake fixtures and cannot authenticate to a real service.

Before pushing, run a secret scan and check:

```powershell
git status --short
git ls-files | Select-String -Pattern '(^|/)\.env($|\.)|(^|/)data/|(^|/)logs?/|node_modules|dist/|\.zip$|\.db$|\.sqlite'
```

The only acceptable `.env` matches are `.env.example` files.

## Local Production Hardening

Before exposing beyond loopback:

- Enable App Auth in `Wings_UI`.
- Bind to loopback unless a trusted reverse proxy is enforcing auth and TLS.
- Keep remote `/api/*` access fail-closed when App Auth is disabled.
- Configure provider keys through local settings or environment only.
- Keep `WINGS_OF_WORLD_DATA_DIR` outside source control and included in backup/restore plans.
- Rotate any key that was pasted into chat, screenshots, logs, or old archives.

## Channel Safety

Telegram, LINE, email, SMS, social media, payment, webhook, and ad integrations are external side effects.

Default rule:

- Draft and simulate first.
- Require human approval before any real customer-facing send.
- Use pairing or allowlists before enabling inbound automation.
- Keep audit logs for live actions.

LINE production sending belongs to the `Wings_Backend` LINE plugin. `Wings_UI` LINE templates are draft and triage workflows until the backend plugin, webhook signature verification, pairing/allowlists, and audit trail are verified.

## Dependency And CI Gates

The public repository should keep these checks green:

- Repository safety scan in GitHub Actions.
- `Wings_UI`: `pnpm audit --prod`, `pnpm check`, `pnpm test`, `pnpm build`, `pnpm verify:smoke`.
- Backend checks when backend code changes: `node wings-of-world-backend.mjs --help`, `pnpm check`, `pnpm build`, `pnpm test`.

Use Dependabot alerts, secret scanning, and push protection on GitHub.

## Coordinated Fixes

For confirmed vulnerabilities:

1. Reproduce with placeholders or a local isolated fixture.
2. Patch the smallest root cause.
3. Add or update tests.
4. Run the relevant verification ladder.
5. Document impact, mitigation, and any required secret rotation.
6. Avoid publishing exploit detail until users have a fix path.
