# LINE And Small Operator Automation

This note defines the honest first production path for adding LINE-centered work to Wings Of World without pretending that the UI can send LINE messages by itself.

## Current Boundary

- `Wings_UI` can prepare reply drafts, daily briefs, triage decisions, and scheduled agent plans.
- Real LINE sending and inbound webhook handling belong to `Wings_Backend` through the LINE channel plugin documented at `Wings_Backend/docs/channels/line.md`.
- Until the backend LINE plugin is installed and configured with real credentials, UI workflows must produce drafts and operator actions only.
- No LINE token, channel secret, user ID, or group ID should be committed to git. Use env vars, secret files, or local config outside the repository.

## What Was Added In UI

Workflow templates:

- `LINE Reply Draft`: turns a customer, partner, or community message into a safe LINE-ready reply draft.
- `Small Operator Daily Brief`: turns scattered orders, messages, and tasks into a short owner action plan.
- `Family Time Auto Triage`: separates same-day work from safe-to-delay work before family time.

Scheduled agent templates:

- `LINE inbox digest`: prepares a daily queue of urgent replies, missing facts, and safe-to-delay messages.
- `Small operator daily plan`: creates a morning plan around cash flow, customer trust, delivery readiness, and family time.
- `Family time handoff`: prepares an evening shutdown note so work can resume tomorrow without staying online all night.

## Backend LINE Setup Checklist

1. Install the LINE backend plugin:

```bash
mechanical-wings plugins install @mechanical-wings/line
```

For a local backend checkout:

```bash
mechanical-wings plugins install ./extensions/line
```

2. Configure the LINE Messaging API channel in the LINE Developers Console.

3. Set the webhook URL to the backend gateway HTTPS endpoint:

```text
https://gateway-host/line/webhook
```

4. Store credentials locally, not in git:

```text
LINE_CHANNEL_ACCESS_TOKEN=<local secret>
LINE_CHANNEL_SECRET=<local secret>
```

5. Keep direct messages in pairing mode first:

```text
channels.line.dmPolicy=pairing
```

6. Approve trusted senders only after pairing:

```bash
mechanical-wings pairing list line
mechanical-wings pairing approve line <CODE>
```

## Production Rules

- Draft before send: agent workflows should create drafts and evidence first.
- Human approval first: do not auto-send customer messages until sender allowlists, audit logging, and rollback behavior are verified.
- Keep family-time boundaries explicit: daily plans should mark what is urgent today and what can wait.
- Limit external reach: webhook endpoints require HTTPS, signature verification, body limits, and pairing or allowlists.
- Rotate secrets if they were ever pasted into chat, logs, screenshots, or committed files.

## Verification

Run the UI verification set after changing templates:

```bash
cd Wings_UI
pnpm check
pnpm test
pnpm build
pnpm verify:smoke
```

For real LINE readiness, verify the backend separately with the LINE plugin installed and real credentials provided by the operator.
