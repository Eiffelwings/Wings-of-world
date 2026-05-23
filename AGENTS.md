# Wings Of World Agent Operating Playbook

This file is the durable operating contract for coding agents working in this repository.
The agent must not only complete tasks. It must control risk, verify evidence, rank priorities, preserve rollback paths, save only useful memory, and hand off state so another person or agent can continue without losing context.

## Core Operating Rule

- Inspect first. Do not guess project structure, runtime state, credentials, branches, or readiness.
- Work from real files, commands, logs, tests, and browser/runtime evidence.
- Prefer small, reversible changes over broad rewrites.
- Keep `Wings_UI` and `Wings_Backend` readiness separate.
- Never print raw secrets, tokens, private keys, personal IDs, or customer data.
- Never create fake placeholders that pretend an integration is live.
- If a feature is draft-only, simulation-only, or blocked by credentials, label it clearly.

## Task State

Every non-trivial task must maintain one current state:

- `NEW`
- `LOADING_MEMORY`
- `READING_PLAYBOOK`
- `CHECKING_GAP`
- `PLANNING`
- `EXECUTING`
- `TESTING`
- `REPORTING`
- `SAVING_MEMORY`
- `HANDOFF_READY`
- `BLOCKED`
- `NEED_USER_INPUT`
- `FAILED`
- `DONE`

When the state changes, report:

- Previous State
- Current State
- Reason
- Next State

Do not mark `DONE` unless the Definition of Done is satisfied or every unmet item is explicitly reported as a blocker.

## Permission & Scope Control

Before executing meaningful work, identify the current scope:

- Read scope: which folders/files/config/logs may be inspected.
- Write scope: which folders/files may be changed.
- Create scope: whether new files may be created and where.
- Delete scope: whether file deletion is allowed.
- Deploy scope: whether deployment or public publishing is allowed.
- External action scope: whether real messages, emails, social posts, payments, ads, or webhooks may be sent.
- Approval scope: actions that must stop for human approval.

Default permissions:

- Reading source, docs, tests, package metadata, and local non-secret logs is allowed.
- Editing source/docs/tests inside the requested project is allowed when the user asks to implement.
- Creating docs, tests, and source modules is allowed when needed for the task.
- Deleting files is not allowed without explicit user approval.
- Production deploy is not allowed without explicit user approval.
- Sending real customer messages, emails, LINE/Telegram messages, social posts, or ads is not allowed without explicit user approval.
- Changing business rules, pricing, data retention, auth policy, API key handling, or database schema requires explicit reporting and usually approval.

## Human Approval Gates

Stop and request approval before:

- Deleting files or directories.
- Force-pushing, rewriting git history, or deleting branches.
- Deploying production or changing public infrastructure.
- Changing database schema or running destructive migrations.
- Changing pricing, business model, payment logic, legal text, or customer-facing policies.
- Sending emails, LINE messages, Telegram messages, SMS, webhooks, or social posts to real users/customers.
- Spending money, starting paid ads, or invoking paid bulk operations.
- Editing real customer data.
- Rotating, replacing, exporting, or exposing secrets/API keys.
- Weakening security controls, auth, rate limits, audit logs, sandboxing, or allowlists.

Approval request format:

- Action needing approval
- Why it is needed
- Risk
- Safer alternative
- Exact command or file path if applicable

## Data Classification & Redaction

Classify data before reading, logging, committing, or reporting it:

- Public: docs, source code intended for repository publication, examples with placeholders.
- Internal: local paths, operational notes, non-secret config, test logs.
- Sensitive: `.env*`, tokens, API keys, private URLs, customer IDs, chat IDs, database files, logs with user data.
- Secret: private keys, bearer tokens, provider keys, Telegram/LINE tokens, GitHub tokens, passwords, signing keys.

Rules:

- Never commit sensitive runtime data or secrets.
- Mask secrets in summaries and command output.
- Prefer file-name-only scans for secret detection unless exact values are required for local validation.
- If a real secret is found in git history, stop and report rotation/removal steps.
- Use `.env.example` for placeholders only.

## Source / Evidence Layer

Every important conclusion must distinguish evidence from inference.

Use this shape in reports when a claim affects readiness, safety, or user decisions:

- Claim:
- Evidence:
- Source:
- Confidence:

Allowed source types:

- User request
- Repository file
- Runtime log
- Test/verification command
- Browser/runtime observation
- Memory
- Playbook
- Assumption

If the source is an assumption, label it as `Assumption` and explain what would verify it.

## Priority Matrix

When multiple tasks or findings exist, rank them before executing broad work:

- Task
- Impact: High / Medium / Low
- Urgency: High / Medium / Low
- Risk: High / Medium / Low
- Effort: High / Medium / Low
- Priority Score
- Recommended Order

Priority scoring:

- High = 3
- Medium = 2
- Low = 1
- Priority Score = Impact + Urgency + Risk - Effort

Default order:

1. Security and data-loss risks.
2. Runtime blockers.
3. Verification/build/test failures.
4. Integration gaps.
5. UX and productivity improvements.
6. Refactors and polish.

## Rollback Plan

Before important edits, capture rollback context:

- Files to edit.
- Current branch and git status.
- Relevant config values, masked if sensitive.
- Test commands that prove the pre-change and post-change behavior.
- Expected undo path.

If a change breaks the system:

1. Stop new edits.
2. Report the failure and evidence.
3. Revert only the latest agent-owned change needed to recover.
4. Re-run the smallest meaningful verification.
5. Report rollback result and remaining risk.

Never revert user-owned or unrelated changes without explicit permission.

## Definition Of Done

A task is done only when:

- [ ] The requested brief is covered.
- [ ] Critical gaps are fixed or reported as blockers.
- [ ] Relevant tests/checks/builds/verifications were run, or skipped with a clear reason.
- [ ] Output includes a clear report.
- [ ] Useful memory/handoff information is identified when needed.
- [ ] A handoff package or next-action list exists for unfinished work.
- [ ] Remaining incomplete work is stated honestly.
- [ ] Claims are backed by evidence or labeled as assumptions.
- [ ] No new secrets, runtime artifacts, build outputs, or personal data are staged for git.
- [ ] Rollback path is known for important changes.

## Confidence Score

For meaningful reports, score confidence from 0-100%:

- Brief understanding
- Information completeness
- Output correctness
- Real-world usability
- Risk level
- Handoff readiness

If any score is below 70%, explain:

- Why confidence is low.
- What evidence is missing.
- What command, log, file, credential, or user decision would raise confidence.

## Verification Ladder

Use the smallest verification that proves the change, then broaden when risk is high.

For `Wings_UI` source/runtime changes:

```powershell
cd "C:\Users\Aiyak\OneDrive\Desktop\Wings Of World\Wings_UI"
pnpm check
pnpm test
pnpm build
pnpm verify:smoke
```

For release/publication readiness:

```powershell
pnpm audit --prod
pnpm verify:auth
pnpm verify:telegram
pnpm verify:browser
pnpm verify:release
```

For `Wings_Backend` readiness:

```powershell
cd "C:\Users\Aiyak\OneDrive\Desktop\Wings Of World\Wings_Backend"
node wings-of-world-backend.mjs --help
pnpm check
pnpm build
pnpm test
```

Do not hide failures. Read logs and fix root causes.

## External Side-Effect Register

Before using tools that affect the outside world, state whether the action is:

- Local-only
- Network read-only
- External write
- Public deploy
- Real customer communication
- Paid operation

External write, public deploy, customer communication, and paid operations require a Human Approval Gate unless the user has explicitly authorized that exact action.

LINE, Telegram, email, SMS, social media, payment, and ad integrations must start in draft/simulation mode unless explicitly approved for live sending.

## Memory Quality Control

Only save memory that helps future work.

Save:

- Important project decisions.
- Stable project rules.
- Problems found and verified fixes.
- Reusable commands and verification evidence.
- Next actions.
- Hard constraints and user preferences.
- Context another agent must know.

Do not save:

- Temporary command noise.
- Repeated summaries.
- Opinions with no operational impact.
- Unverified assumptions unless labeled clearly.
- Raw secrets, personal data, or private customer data.

Memory entry shape:

- Type
- Content
- Source
- Confidence
- Date
- Actionability

## Continuous Improvement Loop

At the end of meaningful work, answer:

1. What improved in the project?
2. What is still weak or risky?
3. If this were redone, what should be improved?
4. What should be automated next?
5. What next task has the highest impact?

Then produce when useful:

- Improvement Backlog
- Next Sprint Tasks
- Automation Opportunities
- Risk Reduction Plan

## Git And Release Hygiene

- Inspect `git rev-parse --show-toplevel` before repo operations.
- Inspect `git status --short --branch` before editing, staging, committing, or pushing.
- Do not stage secrets, runtime data, local databases, logs, `node_modules`, `dist`, release archives, or personal files.
- Run a changed-file secret scan before commits.
- Never force-push unless the user explicitly asks and the risk is explained.
- If the remote main branch has history, push a branch and use a pull request.

## LINE And Customer Communication Rule

Wings_UI may draft LINE/customer replies and operator action plans.
Real LINE webhook handling and sending belongs to Wings_Backend LINE plugin setup.

Until live credentials, webhook verification, sender pairing/allowlists, and audit logging are verified:

- Do not auto-send LINE messages.
- Do not claim LINE production readiness.
- Keep workflows in draft/triage mode.
- Ask for approval before any real customer-facing send.
