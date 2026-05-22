// Tavily search — LLM-tuned web search API.
//
// Tavily returns ranked results plus an optional synthesised "answer"
// string, which lets agents skip the usual fetch-and-summarise round
// trip. We expose two operations: `tavilySearch` (full search) and
// `tavilyExtract` (read clean content from one or more URLs).
//
// Inspired by the OpenClaw `tavily` extension (MIT — see NOTICE) but
// reimplemented as a thin REST client. The Tavily API contract is
// documented at https://docs.tavily.com/.

const TAVILY_API_BASE = "https://api.tavily.com";
const DEFAULT_TIMEOUT_MS = 20_000;

export interface TavilySearchOptions {
  apiKey: string;
  query: string;
  /** "basic" or "advanced" search depth. */
  searchDepth?: "basic" | "advanced";
  /** Cap returned results. Default 5. */
  maxResults?: number;
  /** "general" or "news". */
  topic?: "general" | "news";
  /** Date filter: "day" | "week" | "month" | "year". */
  timeRange?: "day" | "week" | "month" | "year";
  /** Domains to require (allowlist). */
  includeDomains?: string[];
  /** Domains to exclude. */
  excludeDomains?: string[];
  /** When true, ask Tavily for a synthesised answer string. Default true. */
  includeAnswer?: boolean;
  /** When true, ask Tavily to return raw content. Default false (heavy). */
  includeRawContent?: boolean;
  timeoutMs?: number;
}

export interface TavilySearchHit {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
  rawContent?: string;
}

export interface TavilySearchResult {
  query: string;
  answer?: string;
  results: TavilySearchHit[];
  responseTimeMs: number;
}

export interface TavilyExtractOptions {
  apiKey: string;
  urls: string[];
  /** "markdown" or "text". */
  format?: "markdown" | "text";
  /** Tavily extraction depth. */
  extractDepth?: "basic" | "advanced";
  timeoutMs?: number;
}

export interface TavilyExtractedPage {
  url: string;
  rawContent: string;
}

export interface TavilyExtractResult {
  results: TavilyExtractedPage[];
  failedResults: Array<{ url: string; error: string }>;
}

function makeAbortController(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(t),
  };
}

export async function tavilySearch(options: TavilySearchOptions): Promise<TavilySearchResult> {
  if (!options.apiKey) throw new Error("Tavily API key is required");
  if (!options.query.trim()) throw new Error("Tavily query cannot be empty");

  const start = Date.now();
  const { signal, cancel } = makeAbortController(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const body: Record<string, unknown> = {
    api_key: options.apiKey,
    query: options.query.trim(),
    search_depth: options.searchDepth ?? "basic",
    max_results: Math.min(20, Math.max(1, options.maxResults ?? 5)),
    include_answer: options.includeAnswer ?? true,
    include_raw_content: options.includeRawContent ?? false,
  };
  if (options.topic) body.topic = options.topic;
  if (options.timeRange) body.time_range = options.timeRange;
  if (options.includeDomains?.length) body.include_domains = options.includeDomains;
  if (options.excludeDomains?.length) body.exclude_domains = options.excludeDomains;

  let res: Response;
  try {
    res = await fetch(`${TAVILY_API_BASE}/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } finally {
    cancel();
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Tavily ${res.status}: ${text.slice(0, 400)}`);
  }
  let data: any;
  try { data = JSON.parse(text); } catch {
    throw new Error(`Tavily returned non-JSON: ${text.slice(0, 200)}`);
  }
  const results: TavilySearchHit[] = Array.isArray(data?.results)
    ? data.results.map((r: any) => ({
        title: String(r?.title ?? ""),
        url: String(r?.url ?? ""),
        content: String(r?.content ?? ""),
        score: typeof r?.score === "number" ? r.score : 0,
        publishedDate: r?.published_date ? String(r.published_date) : undefined,
        rawContent: typeof r?.raw_content === "string" ? r.raw_content : undefined,
      }))
    : [];
  return {
    query: options.query,
    answer: typeof data?.answer === "string" ? data.answer : undefined,
    results,
    responseTimeMs: Date.now() - start,
  };
}

export async function tavilyExtract(options: TavilyExtractOptions): Promise<TavilyExtractResult> {
  if (!options.apiKey) throw new Error("Tavily API key is required");
  if (!options.urls?.length) throw new Error("At least one URL is required");

  const { signal, cancel } = makeAbortController(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const body: Record<string, unknown> = {
    api_key: options.apiKey,
    urls: options.urls.slice(0, 20),
    format: options.format ?? "markdown",
    extract_depth: options.extractDepth ?? "basic",
  };
  let res: Response;
  try {
    res = await fetch(`${TAVILY_API_BASE}/extract`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } finally {
    cancel();
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Tavily extract ${res.status}: ${text.slice(0, 400)}`);
  }
  let data: any;
  try { data = JSON.parse(text); } catch {
    throw new Error(`Tavily extract returned non-JSON: ${text.slice(0, 200)}`);
  }
  return {
    results: Array.isArray(data?.results)
      ? data.results.map((r: any) => ({
          url: String(r?.url ?? ""),
          rawContent: String(r?.raw_content ?? ""),
        }))
      : [],
    failedResults: Array.isArray(data?.failed_results)
      ? data.failed_results.map((r: any) => ({
          url: String(r?.url ?? ""),
          error: String(r?.error ?? "unknown"),
        }))
      : [],
  };
}
