---
summary: "CLI reference for `mechanical-wings agent` (send one agent turn via the Gateway)"
read_when:
  - You want to run one agent turn from scripts (optionally deliver reply)
title: "agent"
---

# `mechanical-wings agent`

Run an agent turn via the Gateway (use `--local` for embedded).
Use `--agent <id>` to target a configured agent directly.

Related:

- Agent send tool: [Agent send](/tools/agent-send)

## Examples

```bash
mechanical-wings agent --to +15555550123 --message "status update" --deliver
mechanical-wings agent --agent ops --message "Summarize logs"
mechanical-wings agent --session-id 1234 --message "Summarize inbox" --thinking medium
mechanical-wings agent --agent ops --message "Generate report" --deliver --reply-channel slack --reply-to "#reports"
```

## Notes

- When this command triggers `models.json` regeneration, SecretRef-managed provider credentials are persisted as non-secret markers (for example env var names, `secretref-env:ENV_VAR_NAME`, or `secretref-managed`), not resolved secret plaintext.
- Marker writes are source-authoritative: Wings🪽 persists markers from the active source config snapshot, not from resolved runtime secret values.
