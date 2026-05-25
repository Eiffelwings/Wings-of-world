import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWebContent } from "../features/web-fetch.js";

const realFetch = globalThis.fetch;

beforeEach(() => {
  // Provide a default fetch we override per test.
  globalThis.fetch = vi.fn() as any;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function htmlResponse(html: string): Response {
  // Build a tiny ReadableStream so the function's chunked-read path executes.
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(html));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

describe("fetchWebContent · URL guards", () => {
  it("rejects non-http schemes", async () => {
    await expect(fetchWebContent("ftp://example.com")).rejects.toThrow(/Unsupported protocol/);
  });

  it("rejects malformed URLs", async () => {
    await expect(fetchWebContent("not a url")).rejects.toThrow(/Invalid URL/);
  });

  it("refuses loopback hosts", async () => {
    await expect(fetchWebContent("http://127.0.0.1/foo")).rejects.toThrow(/loopback/);
    await expect(fetchWebContent("http://localhost/foo")).rejects.toThrow(/loopback/);
    await expect(fetchWebContent("http://10.0.0.1/foo")).rejects.toThrow(/loopback/);
    await expect(fetchWebContent("http://192.168.1.1/foo")).rejects.toThrow(/loopback/);
    await expect(fetchWebContent("http://172.16.0.1/foo")).rejects.toThrow(/loopback/);
    await expect(fetchWebContent("http://169.254.169.254/foo")).rejects.toThrow(/loopback/);
  });
});

describe("fetchWebContent · happy path", () => {
  it("extracts title and main article text", async () => {
    const html = `<!doctype html><html><head><title>Wings is great</title></head><body>
      <nav>menu links should be stripped</nav>
      <article>
        <h1>Wings is great</h1>
        <p>Wings is an open-source AI agent platform that supports multiple LLM providers.</p>
        <p>The platform handles streaming, tool calling, and agentic loops for complex tasks.</p>
        <p>Recent updates include semantic caching, distributed tracing, and a smart model cascade.</p>
        <p>It integrates with Telegram bots, Hermes memory, and Future AGI guardrails.</p>
      </article>
      <footer>copyright stuff</footer>
    </body></html>`;
    (globalThis.fetch as any).mockResolvedValueOnce(htmlResponse(html));
    const r = await fetchWebContent("https://example.com/wings");
    expect(r.title).toContain("Wings");
    expect(r.text).toContain("LLM providers");
    expect(r.text).not.toContain("menu links should be stripped");
    expect(r.url).toBe("https://example.com/wings");
    expect(r.fetchedAt).toBeTruthy();
  });

  it("respects maxChars truncation", async () => {
    const long = "<p>" + "Lorem ipsum dolor sit amet. ".repeat(2000) + "</p>";
    const html = `<!doctype html><html><head><title>Long</title></head><body><article><h1>Long</h1>${long}</article></body></html>`;
    (globalThis.fetch as any).mockResolvedValueOnce(htmlResponse(html));
    const r = await fetchWebContent("https://example.com/long", { maxChars: 1000 });
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(1100); // budget + ellipsis marker
    expect(r.text).toMatch(/truncated/);
  });

  it("rejects non-HTML content types", async () => {
    const body = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode("binary")); c.close(); },
    });
    const res = new Response(body, { status: 200, headers: { "content-type": "application/octet-stream" } });
    (globalThis.fetch as any).mockResolvedValueOnce(res);
    await expect(fetchWebContent("https://example.com/bin")).rejects.toThrow(/Unsupported content-type/);
  });

  it("propagates upstream errors", async () => {
    const body = new ReadableStream({ start(c) { c.close(); } });
    (globalThis.fetch as any).mockResolvedValueOnce(
      new Response(body, { status: 503, statusText: "Service Unavailable", headers: { "content-type": "text/html" } }),
    );
    await expect(fetchWebContent("https://example.com/down")).rejects.toThrow(/Upstream HTTP 503/);
  });
});
