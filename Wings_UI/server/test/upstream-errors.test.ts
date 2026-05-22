import { describe, it, expect, vi } from "vitest";
import {
  parseUpstreamErrorBody,
  formatFriendlyError,
  shouldRetry,
  backoffMs,
  withUpstreamRetry,
} from "../lib/upstream-errors.js";

describe("parseUpstreamErrorBody", () => {
  it("parses an OpenRouter-style nested rate-limit envelope", () => {
    const body = JSON.stringify({
      error: {
        message: "Provider returned error",
        code: 429,
        metadata: {
          raw: "deepseek/deepseek-v4-pro is temporarily rate-limited upstream. Please retry shortly, or add your own key.",
          provider_name: "Together",
          retry_after_seconds: 5,
        },
      },
    });
    const parsed = parseUpstreamErrorBody(429, body);
    expect(parsed.errorClass).toBe("rate_limit");
    expect(parsed.upstreamProvider).toBe("Together");
    expect(parsed.retryAfterSeconds).toBe(5);
    expect(parsed.message).toBe("Provider returned error");
    expect(parsed.hint).toContain("rate limit");
    expect(parsed.raw).toContain("rate-limited");
  });

  it("parses an OpenAI-style flat error", () => {
    const body = JSON.stringify({ error: { message: "Invalid API key", type: "invalid_request_error" } });
    const parsed = parseUpstreamErrorBody(401, body);
    expect(parsed.errorClass).toBe("auth");
    expect(parsed.message).toBe("Invalid API key");
    expect(parsed.hint).toContain("API key");
  });

  it("falls back to plain text for unparseable bodies", () => {
    const parsed = parseUpstreamErrorBody(500, "<html>Bad gateway</html>");
    expect(parsed.errorClass).toBe("server");
    expect(parsed.message).toContain("Bad gateway");
  });

  it("honours the Retry-After header when no body retry is given", () => {
    const parsed = parseUpstreamErrorBody(429, "{}", "12");
    expect(parsed.retryAfterSeconds).toBe(12);
  });

  it("clamps insanely large Retry-After header to 60s", () => {
    const parsed = parseUpstreamErrorBody(429, "{}", "9999");
    expect(parsed.retryAfterSeconds).toBe(60);
  });

  it("treats status 0 as a network class error", () => {
    const parsed = parseUpstreamErrorBody(0, "");
    expect(parsed.errorClass).toBe("network");
  });
});

describe("formatFriendlyError", () => {
  it("includes the provider name and retry hint when available", () => {
    const text = formatFriendlyError({
      status: 429,
      message: "Rate limited",
      errorClass: "rate_limit",
      upstreamProvider: "Together",
      retryAfterSeconds: 5,
      hint: "Wait a moment.",
    });
    expect(text).toContain("rate-limited");
    expect(text).toContain("Together");
    expect(text).toContain("Retry after ~5s");
    expect(text).toContain("Wait a moment.");
  });
});

describe("shouldRetry", () => {
  it("retries on 429 within the limit", () => {
    expect(shouldRetry({ status: 429, message: "x", errorClass: "rate_limit" }, 1, 3)).toBe(true);
  });

  it("retries on 5xx", () => {
    expect(shouldRetry({ status: 503, message: "x", errorClass: "server" }, 1, 3)).toBe(true);
  });

  it("does not retry on 400/401", () => {
    expect(shouldRetry({ status: 400, message: "x", errorClass: "client" }, 1, 3)).toBe(false);
    expect(shouldRetry({ status: 401, message: "x", errorClass: "auth" }, 1, 3)).toBe(false);
  });

  it("stops retrying after maxAttempts", () => {
    expect(shouldRetry({ status: 429, message: "x", errorClass: "rate_limit" }, 3, 3)).toBe(false);
  });
});

describe("backoffMs", () => {
  it("honours upstream Retry-After when given", () => {
    expect(backoffMs(1, 4)).toBeGreaterThanOrEqual(4_000);
  });

  it("grows exponentially without a header", () => {
    const a = backoffMs(1);
    const b = backoffMs(3);
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it("caps base backoff at 8s", () => {
    expect(backoffMs(20)).toBeLessThanOrEqual(8_500);
  });
});

describe("withUpstreamRetry", () => {
  it("returns the result on a successful first attempt", async () => {
    const op = vi.fn(async () => ({ ok: true, status: 200, body: "{}", result: "yay" }));
    const out = await withUpstreamRetry<string>(op);
    expect(op).toHaveBeenCalledTimes(1);
    expect("result" in out && out.result).toBe("yay");
  });

  it("retries 429 once then succeeds", async () => {
    let n = 0;
    const op = vi.fn(async () => {
      n++;
      if (n === 1) return { ok: false as const, status: 429, body: "{}", retryAfter: "0" };
      return { ok: true as const, status: 200, body: "{}", result: "ok" };
    });
    const onRetry = vi.fn();
    const out = await withUpstreamRetry<string>(op, { maxAttempts: 3, onRetry });
    expect(n).toBe(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect("result" in out && out.result).toBe("ok");
  });

  it("does not retry 4xx (non-429) errors", async () => {
    const op = vi.fn(async () => ({ ok: false as const, status: 400, body: '{"error":"bad"}' }));
    const out = await withUpstreamRetry<string>(op, { maxAttempts: 3 });
    expect(op).toHaveBeenCalledTimes(1);
    expect("error" in out && out.error.errorClass).toBe("client");
  });

  it("returns the last error after exhausting retries", async () => {
    const op = vi.fn(async () => ({ ok: false as const, status: 503, body: "" }));
    const out = await withUpstreamRetry<string>(op, { maxAttempts: 2 });
    expect(op).toHaveBeenCalledTimes(2);
    expect("error" in out && out.error.errorClass).toBe("server");
  });

  it("treats thrown network errors as retryable", async () => {
    let n = 0;
    const op = vi.fn(async () => {
      n++;
      if (n === 1) throw new Error("ECONNRESET");
      return { ok: true as const, status: 200, body: "{}", result: "fine" };
    });
    const out = await withUpstreamRetry<string>(op, { maxAttempts: 2 });
    expect("result" in out && out.result).toBe("fine");
  });
});
