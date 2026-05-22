// Helpers for handling upstream LLM provider errors. Two concerns:
//
//   1. Parse error bodies into a friendly, structured shape (OpenAI-style
//      `{error: {...}}`, OpenRouter-style nested `{error: {message, code,
//      metadata: {raw, provider_name}}}`, plain text fallbacks).
//   2. Retry transient failures (429 + 5xx) with exponential backoff and
//      Retry-After awareness, so users don't see a one-shot 429 from the
//      upstream provider as a hard failure.

export type ErrorClass = "rate_limit" | "auth" | "server" | "client" | "network" | "unknown";

export interface ParsedUpstreamError {
  /** HTTP status if known. 0 means no response (network failure). */
  status: number;
  /** Plain-language message safe to surface in UI. */
  message: string;
  /** Coarse classification used to drive retry / UX behaviour. */
  errorClass: ErrorClass;
  /** Concrete provider when a meta-router (OpenRouter) reports it. */
  upstreamProvider?: string;
  /** Suggested wait in seconds before retrying, derived from headers/body. */
  retryAfterSeconds?: number;
  /** User-actionable hint, e.g. "add your own DeepSeek key". */
  hint?: string;
  /** Raw text/body, useful for diagnostics. Bounded length. */
  raw?: string;
}

const TRUNC = 500;
const trunc = (s: string) => (s.length > TRUNC ? `${s.slice(0, TRUNC)}…` : s);

function classifyByStatus(status: number): ErrorClass {
  if (status === 429) return "rate_limit";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "server";
  if (status >= 400) return "client";
  if (status === 0) return "network";
  return "unknown";
}

function pickRetryAfter(retryAfterHeader: string | null, bodyRetry?: number): number | undefined {
  if (typeof bodyRetry === "number" && bodyRetry > 0) return bodyRetry;
  if (!retryAfterHeader) return undefined;
  // RFC: integer seconds, or HTTP-date.
  const asInt = Number(retryAfterHeader);
  if (Number.isFinite(asInt) && asInt >= 0) return Math.min(asInt, 60);
  const asDate = Date.parse(retryAfterHeader);
  if (Number.isFinite(asDate)) {
    const diff = Math.max(0, Math.round((asDate - Date.now()) / 1000));
    return Math.min(diff, 60);
  }
  return undefined;
}

/** Try to make sense of an upstream error body. */
export function parseUpstreamErrorBody(status: number, body: string, retryAfterHeader: string | null = null): ParsedUpstreamError {
  const errorClass = classifyByStatus(status);
  const trimmed = body?.trim() || "";
  const fallback: ParsedUpstreamError = {
    status,
    message: trimmed ? trunc(trimmed) : `Upstream HTTP ${status}`,
    errorClass,
    raw: trimmed ? trunc(trimmed) : undefined,
    retryAfterSeconds: pickRetryAfter(retryAfterHeader),
  };
  if (!trimmed) return fallback;

  // Common pattern: JSON envelope with an `error` field.
  let parsed: any;
  try { parsed = JSON.parse(trimmed); } catch { return fallback; }
  const errorBlock = parsed?.error ?? parsed;
  const message = String(errorBlock?.message || errorBlock?.error || parsed?.message || trimmed);
  const meta = errorBlock?.metadata || {};
  const upstreamProvider = typeof meta?.provider_name === "string" ? meta.provider_name : undefined;
  const rawNested = typeof meta?.raw === "string" ? meta.raw : undefined;
  const headerRetry = pickRetryAfter(retryAfterHeader);
  const bodyRetry =
    typeof parsed?.retry_after === "number" ? parsed.retry_after :
    typeof parsed?.retry_after_seconds === "number" ? parsed.retry_after_seconds :
    typeof errorBlock?.retry_after === "number" ? errorBlock.retry_after :
    typeof errorBlock?.retry_after_seconds === "number" ? errorBlock.retry_after_seconds :
    typeof meta?.retry_after === "number" ? meta.retry_after :
    typeof meta?.retry_after_seconds === "number" ? meta.retry_after_seconds :
    undefined;

  // OpenRouter rate-limit hint mentions "add your own key"; surface a clean version.
  const hint =
    status === 429
      ? "Provider hit a temporary rate limit. Wait a moment and try again, or add your own provider key in Settings to use your personal quota."
      : status === 401 || status === 403
      ? "Provider rejected the API key. Double-check it in Settings."
      : status >= 500
      ? "Provider had a transient server error. Wings Of World will retry; if the problem persists, switch to another model."
      : undefined;

  return {
    status,
    message: trunc(message),
    errorClass,
    upstreamProvider,
    retryAfterSeconds: bodyRetry ?? headerRetry,
    hint,
    raw: rawNested ? trunc(rawNested) : trunc(trimmed),
  };
}

export function formatFriendlyError(err: ParsedUpstreamError): string {
  const lines: string[] = [];
  lines.push(`Upstream ${err.status || ""}`.trim() + (err.errorClass === "rate_limit" ? " (rate-limited)" : "") + `: ${err.message}`);
  if (err.upstreamProvider) lines.push(`Provider: ${err.upstreamProvider}`);
  if (err.retryAfterSeconds) lines.push(`Retry after ~${err.retryAfterSeconds}s`);
  if (err.hint) lines.push(err.hint);
  return lines.join("\n");
}

export function shouldRetry(err: ParsedUpstreamError, attempt: number, maxAttempts: number): boolean {
  if (attempt >= maxAttempts) return false;
  return err.errorClass === "rate_limit" || err.errorClass === "server" || err.errorClass === "network";
}

export function backoffMs(attempt: number, retryAfterSeconds?: number): number {
  // Honour upstream Retry-After when present.
  if (retryAfterSeconds && retryAfterSeconds > 0) return Math.min(retryAfterSeconds * 1000, 30_000);
  // Otherwise exponential backoff with jitter: 500ms, 1s, 2s, 4s capped at 8s.
  const base = Math.min(8_000, 500 * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  maxAttempts?: number;
  /** Optional callback fired before each retry sleep (e.g. for logging). */
  onRetry?: (info: { attempt: number; delayMs: number; error: ParsedUpstreamError }) => void;
}

/** Run a fetch-shaped operation with retry on 429/5xx. */
export async function withUpstreamRetry<T>(
  operation: () => Promise<{ ok: boolean; status: number; body: string; retryAfter?: string | null; result?: T }>,
  options: RetryOptions = {},
): Promise<{ result: T; attempts: number } | { error: ParsedUpstreamError; attempts: number }> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  let lastError: ParsedUpstreamError | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await operation();
      if (res.ok && res.result !== undefined) {
        return { result: res.result, attempts: attempt };
      }
      const parsed = parseUpstreamErrorBody(res.status, res.body || "", res.retryAfter ?? null);
      lastError = parsed;
      if (!shouldRetry(parsed, attempt, maxAttempts)) {
        return { error: parsed, attempts: attempt };
      }
      const delay = backoffMs(attempt, parsed.retryAfterSeconds);
      options.onRetry?.({ attempt, delayMs: delay, error: parsed });
      await sleep(delay);
    } catch (err: any) {
      // Network / DNS / timeout — treat as retryable up to maxAttempts.
      const parsed: ParsedUpstreamError = {
        status: 0,
        message: err?.message || String(err),
        errorClass: "network",
      };
      lastError = parsed;
      if (attempt >= maxAttempts) return { error: parsed, attempts: attempt };
      const delay = backoffMs(attempt);
      options.onRetry?.({ attempt, delayMs: delay, error: parsed });
      await sleep(delay);
    }
  }
  return { error: lastError ?? { status: 0, message: "exhausted retries", errorClass: "unknown" }, attempts: maxAttempts };
}
