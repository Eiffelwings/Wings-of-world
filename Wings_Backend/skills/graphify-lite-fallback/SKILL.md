---
name: graphify-lite-fallback
description: Install or apply a lightweight Graphify-style fallback for any repository when graphify is unavailable, not installed, not configured, or no fresh graphify-out/ knowledge graph exists. Use when a user asks Wings to work on a repo "with skills", "like Graphify", "graph-first", "with better codebase navigation", "without grepping randomly", or wants repo-local fallback instructions in WINGS.md / AGENTS.md so future coding tasks automatically start from architecture, entrypoints, and module boundaries instead of blind file scanning.
---

# Graphify-lite Fallback

Apply a Graphify-style fallback when a repo does not have a usable Graphify setup.

## Trigger phrases and intents

Use this skill for requests like:
- "use skills with Wings on this repo"
- "make Wings understand this repo better"
- "set up fallback navigation for this codebase"
- "work graph-first without installing Graphify"
- "stop grepping randomly in this project"
- "create repo instructions so future tasks start from architecture"
- "make this repo easier for Wings/Hermes to work in"
- "apply a reusable codebase-navigation pattern here"

Prefer this skill when the user wants **navigation discipline**, not a full Graphify install.

## Goal

Produce two layers:
1. Reusable Wings behavior: navigate graph-first even without `graphify`.
2. Repo-local fallback files: create/update `WINGS.md`, and patch `AGENTS.md` when appropriate.

## Workflow

1. Inspect the repo lightly.
   - Check for `AGENTS.md`, architecture docs, likely entrypoints, and module boundaries.
   - Do **not** start with broad full-repo grep unless structure is absent.

2. Create or update `WINGS.md`.
   Keep it repo-specific and practical. Include:
   - purpose
   - canonical navigation order
   - repo module/entrypoint map
   - task heuristics
   - expected Wings behavior
   - optional upgrade path to full Graphify

3. Patch `AGENTS.md` if it exists.
   Add a short fallback note pointing to `WINGS.md` when `graphify` is unavailable or `graphify-out/` is missing/stale.
   Do not overwrite existing Graphify guidance.

4. Preserve local style.
   Match the repo's tone and structure. Avoid generic boilerplate.

## Navigation policy to encode

Default order:
1. Read `AGENTS.md` if present.
2. Read architecture docs (`ARCHITECTURE.md`, `README.md`, similar top-level docs).
3. Identify the relevant layer, entrypoint, or module boundary.
4. Trace only the files needed for the task.
5. Expand only when the trace crosses module boundaries.

## Heuristics

Encode guidance like:
- start from architecture, not grep
- map task -> layer -> module -> implementation
- keep edits local before widening scope
- check tests/docs when behavior changes
- mention exact modules touched in progress updates

## Avoid

Do not:
- pretend a real graph exists when it does not
- create fake `graphify-out/` artifacts
- replace full Graphify workflows when Graphify is available
- dump long generic docs into the repo

## Repo mapping

When justified, add a short routing map such as:
- CLI / install -> `pkg/__main__.py`
- parsing / extraction -> `pkg/extract.py`
- graph assembly -> `pkg/build.py`
- serving / API -> `pkg/serve.py`

## Done criteria

Tell the user:
- which files were created/updated
- that the fallback policy is now reusable inside the repo
- that they can now assign direct coding tasks using this policy
