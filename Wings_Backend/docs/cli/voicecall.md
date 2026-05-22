---
summary: "CLI reference for `mechanical-wings voicecall` (voice-call plugin command surface)"
read_when:
  - You use the voice-call plugin and want the CLI entry points
  - You want quick examples for `voicecall call|continue|status|tail|expose`
title: "voicecall"
---

# `mechanical-wings voicecall`

`voicecall` is a plugin-provided command. It only appears if the voice-call plugin is installed and enabled.

Primary doc:

- Voice-call plugin: [Voice Call](/plugins/voice-call)

## Common commands

```bash
mechanical-wings voicecall status --call-id <id>
mechanical-wings voicecall call --to "+15555550123" --message "Hello" --mode notify
mechanical-wings voicecall continue --call-id <id> --message "Any questions?"
mechanical-wings voicecall end --call-id <id>
```

## Exposing webhooks (Tailscale)

```bash
mechanical-wings voicecall expose --mode serve
mechanical-wings voicecall expose --mode funnel
mechanical-wings voicecall expose --mode off
```

Security note: only expose the webhook endpoint to networks you trust. Prefer Tailscale Serve over Funnel when possible.
