import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb, getDb } from "../lib/db.js";
import { ensureTracingSchema, Tracer } from "../lib/tracing.js";

let tmpDir: string;
let tracer: Tracer;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-trace-"));
  initDb(path.join(tmpDir, "trace.db"));
  ensureTracingSchema(getDb());
  tracer = new Tracer(getDb());
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("tracing", () => {
  it("starts and ends a span and records duration", async () => {
    const span = tracer.startSpan({ name: "root", kind: "request" });
    await new Promise((r) => setTimeout(r, 5));
    span.end({ status: "ok" });
    const spans = tracer.getTrace(span.span.traceId);
    expect(spans).toHaveLength(1);
    expect(spans[0].status).toBe("ok");
    expect(spans[0].durationMs).toBeGreaterThanOrEqual(5);
  });

  it("nests child spans under a parent within the same trace", async () => {
    const parent = tracer.startSpan({ name: "root", kind: "request" });
    const child = parent.child({ name: "tool", kind: "tool" });
    child.end({ status: "ok" });
    parent.end({ status: "ok" });
    const spans = tracer.getTrace(parent.span.traceId);
    expect(spans).toHaveLength(2);
    expect(spans[1].parentSpanId).toBe(parent.span.spanId);
    expect(spans[1].name).toBe("tool");
  });

  it("withSpan marks failure and re-throws", async () => {
    let traceId: string | undefined;
    await expect(
      tracer.withSpan({ name: "fail", kind: "request" }, async (handle) => {
        traceId = handle.span.traceId;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const spans = tracer.getTrace(traceId!);
    expect(spans[0].status).toBe("error");
    expect(spans[0].error).toContain("boom");
  });

  it("listRecentTraces aggregates spans by trace", async () => {
    const a = tracer.startSpan({ name: "a", kind: "request" });
    a.end({ status: "ok" });
    const b = tracer.startSpan({ name: "b", kind: "request" });
    b.child({ name: "b.child", kind: "tool" }).end({ status: "ok" });
    b.end({ status: "ok" });
    const list = tracer.listRecentTraces();
    const ids = list.map((t) => t.traceId);
    expect(ids).toContain(a.span.traceId);
    expect(ids).toContain(b.span.traceId);
    const bSummary = list.find((t) => t.traceId === b.span.traceId)!;
    expect(bSummary.spanCount).toBe(2);
  });

  it("attribute setters merge into the persisted attributes", () => {
    const span = tracer.startSpan({ name: "x", kind: "llm", attributes: { model: "gpt-4o" } });
    span.setAttribute("tokens", 123);
    span.setAttributes({ costUsd: 0.001, provider: "openai" });
    span.end({ status: "ok" });
    const persisted = tracer.getTrace(span.span.traceId)[0];
    expect(persisted.attributes).toMatchObject({ model: "gpt-4o", tokens: 123, costUsd: 0.001, provider: "openai" });
  });

  it("prune removes traces older than the retention window", () => {
    const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
    getDb().prepare(
      `INSERT INTO trace_spans (trace_id, span_id, name, kind, status, started_at) VALUES (?, ?, 'old', 'request', 'ok', ?)`,
    ).run("old-trace", "old-span", old);
    expect(tracer.pruneTraces(14)).toBeGreaterThan(0);
  });
});
