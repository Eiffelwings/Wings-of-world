---
summary: "Community-maintained Wings🪽 plugins: browse, install, and submit your own"
read_when:
  - You want to find third-party Wings🪽 plugins
  - You want to publish or list your own plugin
title: "Community Plugins"
---

# Community Plugins

Community plugins are third-party packages that extend Wings🪽 with new
channels, tools, providers, or other capabilities. They are built and maintained
by the community, published on [ClawHub](/tools/clawhub) or npm, and
installable with a single command.

```bash
mechanical-wings plugins install <package-name>
```

Wings🪽 checks ClawHub first and falls back to npm automatically.

## Listed plugins

### Codex App Server Bridge

Independent Wings🪽 bridge for Codex App Server conversations. Bind a chat to
a Codex thread, talk to it with plain text, and control it with chat-native
commands for resume, planning, review, model selection, compaction, and more.

- **npm:** `mechanical-wings-codex-app-server`
- **repo:** [github.com/pwrdrvr/mechanical-wings-codex-app-server](https://github.com/pwrdrvr/mechanical-wings-codex-app-server)

```bash
mechanical-wings plugins install mechanical-wings-codex-app-server
```

### DingTalk

Enterprise robot integration using Stream mode. Supports text, images, and
file messages via any DingTalk client.

- **npm:** `@largezhou/ddingtalk`
- **repo:** [github.com/largezhou/mechanical-wings-dingtalk](https://github.com/largezhou/mechanical-wings-dingtalk)

```bash
mechanical-wings plugins install @largezhou/ddingtalk
```

### Lossless Claw (LCM)

Lossless Context Management plugin for Wings🪽. DAG-based conversation
summarization with incremental compaction — preserves full context fidelity
while reducing token usage.

- **npm:** `@martian-engineering/lossless-claw`
- **repo:** [github.com/Martian-Engineering/lossless-claw](https://github.com/Martian-Engineering/lossless-claw)

```bash
mechanical-wings plugins install @martian-engineering/lossless-claw
```

### Opik

Official plugin that exports agent traces to Opik. Monitor agent behavior,
cost, tokens, errors, and more.

- **npm:** `@opik/opik-mechanical-wings`
- **repo:** [github.com/comet-ml/opik-mechanical-wings](https://github.com/comet-ml/opik-mechanical-wings)

```bash
mechanical-wings plugins install @opik/opik-mechanical-wings
```

### QQbot

Connect Wings🪽 to QQ via the QQ Bot API. Supports private chats, group
mentions, channel messages, and rich media including voice, images, videos,
and files.

- **npm:** `@sliverp/qqbot`
- **repo:** [github.com/sliverp/qqbot](https://github.com/sliverp/qqbot)

```bash
mechanical-wings plugins install @sliverp/qqbot
```

### wecom

Wings🪽 Enterprise WeCom Channel Plugin.
A bot plugin powered by WeCom AI Bot WebSocket persistent connections,
supports direct messages & group chats, streaming replies, and proactive messaging.

- **npm:** `@wecom/wecom-mechanical-wings-plugin`
- **repo:** [github.com/WecomTeam/wecom-mechanical-wings-plugin](https://github.com/WecomTeam/wecom-mechanical-wings-plugin)

```bash
mechanical-wings plugins install @wecom/wecom-mechanical-wings-plugin
```

## Submit your plugin

We welcome community plugins that are useful, documented, and safe to operate.

<Steps>
  <Step title="Publish to ClawHub or npm">
    Your plugin must be installable via `mechanical-wings plugins install \<package-name\>`.
    Publish to [ClawHub](/tools/clawhub) (preferred) or npm.
    See [Building Plugins](/plugins/building-plugins) for the full guide.

  </Step>

  <Step title="Host on GitHub">
    Source code must be in a public repository with setup docs and an issue
    tracker.

  </Step>

  <Step title="Open a PR">
    Add your plugin to this page with:

    - Plugin name
    - npm package name
    - GitHub repository URL
    - One-line description
    - Install command

  </Step>
</Steps>

## Quality bar

| Requirement                 | Why                                           |
| --------------------------- | --------------------------------------------- |
| Published on ClawHub or npm | Users need `mechanical-wings plugins install` to work |
| Public GitHub repo          | Source review, issue tracking, transparency   |
| Setup and usage docs        | Users need to know how to configure it        |
| Active maintenance          | Recent updates or responsive issue handling   |

Low-effort wrappers, unclear ownership, or unmaintained packages may be declined.

## Related

- [Install and Configure Plugins](/tools/plugin) — how to install any plugin
- [Building Plugins](/plugins/building-plugins) — create your own
- [Plugin Manifest](/plugins/manifest) — manifest schema
