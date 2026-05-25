# Wings Of World Security Notes

Wings Of World is designed for a trusted local operator. Treat the host machine, configured workspace roots, and enabled tools as part of the trusted boundary.

## Release Hygiene

- Never ship `.env`, `.env.local`, tokens, local databases, logs, generated builds, or dependency folders.
- Keep persistent state outside the source tree.
- Use least-privilege API keys and rotate credentials that may have been exposed during development.

## Runtime Guidance

- Prefer loopback-only access for local web and gateway surfaces.
- Restrict write-capable tools with explicit workspace roots.
- Keep Telegram bot tokens and provider keys in environment variables or a local secret manager.
- Preserve legacy compatibility identifiers only where required for existing integrations.
