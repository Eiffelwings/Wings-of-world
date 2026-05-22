import { formatTerminalLink } from "./terminal-link.js";

const WINGS_OF_WORLD_DOCS_ROOT = "https://docs.wings-of-world.ai";
const LEGACY_DOCS_HOST = "docs.wings-of-world.ai";
const WINGS_OF_WORLD_DOCS_HOST = "docs.wings-of-world.ai";
const LEGACY_SITE_HOST = "wings-of-world.ai";
const WINGS_OF_WORLD_SITE_HOST = "wings-of-world.ai";

function normalizeWingsOfWorldLinkText(value: string): string {
  return value
    .replaceAll(LEGACY_DOCS_HOST, WINGS_OF_WORLD_DOCS_HOST)
    .replaceAll(LEGACY_SITE_HOST, WINGS_OF_WORLD_SITE_HOST);
}

export function resolveDocsRoot(): string {
  return WINGS_OF_WORLD_DOCS_ROOT;
}

export const DOCS_ROOT = resolveDocsRoot();

export function formatDocsLink(
  path: string,
  label?: string,
  opts?: { fallback?: string; force?: boolean },
): string {
  const trimmed = normalizeWingsOfWorldLinkText(path.trim());
  const docsRoot = resolveDocsRoot();
  const url = trimmed.startsWith("http")
    ? trimmed
    : `${docsRoot}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
  const displayLabel = label ? normalizeWingsOfWorldLinkText(label) : url;
  return formatTerminalLink(displayLabel, url, {
    fallback: opts?.fallback ? normalizeWingsOfWorldLinkText(opts.fallback) : url,
    force: opts?.force,
  });
}

export function formatDocsRootLink(label?: string): string {
  const docsRoot = resolveDocsRoot();
  return formatTerminalLink(label ?? docsRoot, docsRoot, {
    fallback: docsRoot,
  });
}
