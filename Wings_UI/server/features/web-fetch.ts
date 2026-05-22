// Readability-based web content extraction.
//
// Fetches a URL, parses HTML with linkedom, runs Mozilla Readability to
// isolate the main article, and returns clean Markdown-flavoured text.
// Inspired by the OpenClaw `web-readability` extension (MIT licensed —
// see NOTICE) but reimplemented from scratch so we can keep the surface
// area tiny and avoid pulling in the full OpenClaw plugin SDK.

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { parsePublicHttpUrl, readResponseBufferWithLimit } from "../lib/network-safety.js";

export interface WebFetchResult {
  url: string;
  title: string;
  byline?: string;
  excerpt?: string;
  text: string;
  textLength: number;
  publishedTime?: string;
  siteName?: string;
  fetchedAt: string;
  truncated: boolean;
}

export interface WebFetchOptions {
  /** Cap final text length. Defaults to 24k chars — generous but bounded. */
  maxChars?: number;
  /** Total request timeout (ms). Default 15s. */
  timeoutMs?: number;
  /** Override User-Agent. Default mimics a real browser to dodge soft blocks. */
  userAgent?: string;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (WingsOfWorld/1.0; +https://github.com/wings-of-world/wings-of-world) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const DEFAULT_MAX_CHARS = 24_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 2_500_000; // hard ceiling so a hostile server can't OOM us

/** Convert HTML content from Readability into a markdown-ish plain-text form. */
function htmlToReadable(html: string): string {
  // Lightweight conversion. We could pull in turndown for a full markdown
  // renderer but for agent consumption this is enough — preserve paragraph
  // breaks, bullets, and inline emphasis hints.
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<h([1-6])[^>]*>/gi, (_m, n) => `\n${"#".repeat(Number(n))} `)
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<a [^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchWebContent(
  rawUrl: string,
  options: WebFetchOptions = {},
): Promise<WebFetchResult> {
  const url = parsePublicHttpUrl(rawUrl);
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let html: string;
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "accept-language": "en,en-US;q=0.9,th;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Upstream HTTP ${res.status} ${res.statusText}`);
    }
    const contentType = res.headers.get("content-type") || "";
    if (!/(text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) {
      throw new Error(`Unsupported content-type: ${contentType}`);
    }
    html = new TextDecoder("utf-8").decode(
      await readResponseBufferWithLimit(res, MAX_HTML_BYTES),
    );
  } finally {
    clearTimeout(timer);
  }

  const fetchedAt = new Date().toISOString();
  const { document } = parseHTML(html);
  // Help Readability resolve relative links.
  try { (document as { baseURI?: string }).baseURI = url.toString(); } catch { /* best-effort */ }

  const reader = new Readability(document, { charThreshold: 0 });
  const parsed = reader.parse();

  let text: string;
  let title: string;
  let excerpt: string | undefined;
  let byline: string | undefined;
  let siteName: string | undefined;
  let publishedTime: string | undefined;

  if (parsed?.content) {
    text = htmlToReadable(parsed.content);
    title = parsed.title || document.title || url.hostname;
    excerpt = parsed.excerpt || undefined;
    byline = parsed.byline || undefined;
    siteName = parsed.siteName || undefined;
    publishedTime = (parsed as any).publishedTime || undefined;
  } else {
    // Readability bailed — fall back to body text only.
    text = htmlToReadable(document.body?.innerHTML || "");
    title = document.title || url.hostname;
  }

  const truncated = text.length > maxChars;
  if (truncated) text = text.slice(0, maxChars) + "\n…[truncated]";

  return {
    url: url.toString(),
    title: title.trim(),
    byline: byline?.trim(),
    excerpt: excerpt?.trim(),
    text,
    textLength: text.length,
    siteName: siteName?.trim(),
    publishedTime,
    fetchedAt,
    truncated,
  };
}
