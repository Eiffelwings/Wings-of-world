// Lightweight OTel-flavoured tracing. Spans are persisted to SQLite so the
// platform has end-to-end visibility into chat → tool → LLM call hierarchies
// without pulling in a full OpenTelemetry SDK or external collector.

import { randomUUID } from "crypto";
import type Database from "better-sqlite3";

export type SpanStatus = "ok" | "error" | "running";
export type SpanKind = "request" | "chat" | "agent" | "llm" | "tool" | "guardrail" | "embed" | "memory" | "custom";

export interface SpanRow {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  attributes: string | null;
  error: string | null;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: SpanKind;
  status: SpanStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  attributes: Record<string, unknown>;
  error?: string;
}

export function ensureTracingSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trace_spans (
      trace_id        TEXT NOT NULL,
      span_id         TEXT PRIMARY KEY,
      parent_span_id  TEXT,
      name            TEXT NOT NULL,
      kind            TEXT NOT NULL,
      status          TEXT NOT NULL,
      started_at      TEXT NOT NULL,
      ended_at        TEXT,
      duration_ms     INTEGER,
      attributes      TEXT,
      error           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_spans_trace ON trace_spans (trace_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_spans_started ON trace_spans (started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_spans_kind ON trace_spans (kind);
  `);
}

export class Tracer {
  constructor(private db: Database.Database) {}

  startSpan(opts: {
    name: string;
    kind?: SpanKind;
    traceId?: string;
    parentSpanId?: string | null;
    attributes?: Record<string, unknown>;
  }): SpanHandle {
    const traceId = opts.traceId || randomUUID();
    const spanId = randomUUID();
    const startedAt = new Date().toISOString();
    const span: Span = {
      traceId,
      spanId,
      parentSpanId: opts.parentSpanId ?? null,
      name: opts.name,
      kind: opts.kind || "custom",
      status: "running",
      startedAt,
      attributes: opts.attributes || {},
    };
    this.persistStart(span);
    return new SpanHandle(this, span);
  }

  async withSpan<T>(
    opts: { name: string; kind?: SpanKind; traceId?: string; parentSpanId?: string | null; attributes?: Record<string, unknown> },
    fn: (handle: SpanHandle) => Promise<T>,
  ): Promise<T> {
    const span = this.startSpan(opts);
    try {
      const result = await fn(span);
      span.end({ status: "ok" });
      return result;
    } catch (err: any) {
      span.end({ status: "error", error: err?.message || String(err) });
      throw err;
    }
  }

  persistStart(span: Span): void {
    this.db.prepare(
      `INSERT INTO trace_spans (trace_id, span_id, parent_span_id, name, kind, status, started_at, attributes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      span.traceId,
      span.spanId,
      span.parentSpanId,
      span.name,
      span.kind,
      span.status,
      span.startedAt,
      JSON.stringify(span.attributes),
    );
  }

  persistEnd(span: Span): void {
    this.db.prepare(
      `UPDATE trace_spans SET status = ?, ended_at = ?, duration_ms = ?, attributes = ?, error = ?
       WHERE span_id = ?`,
    ).run(
      span.status,
      span.endedAt ?? null,
      span.durationMs ?? null,
      JSON.stringify(span.attributes),
      span.error ?? null,
      span.spanId,
    );
  }

  getTrace(traceId: string): Span[] {
    const rows = this.db
      .prepare(`SELECT * FROM trace_spans WHERE trace_id = ? ORDER BY started_at ASC, rowid ASC`)
      .all(traceId) as SpanRow[];
    return rows.map(rowToSpan);
  }

  listRecentTraces(limit = 50): Array<{ traceId: string; startedAt: string; name: string; durationMs: number; status: string; spanCount: number }> {
    const rows = this.db
      .prepare(
        `SELECT trace_id,
                MIN(started_at)              AS started_at,
                MIN(name)                    AS name,
                COALESCE(MAX(duration_ms), 0) AS duration_ms,
                COUNT(*)                     AS span_count,
                MAX(CASE WHEN status='error' THEN 1 ELSE 0 END) AS has_error
         FROM trace_spans
         GROUP BY trace_id
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{
        trace_id: string;
        started_at: string;
        name: string;
        duration_ms: number;
        span_count: number;
        has_error: number;
      }>;
    return rows.map((r) => ({
      traceId: r.trace_id,
      startedAt: r.started_at,
      name: r.name,
      durationMs: r.duration_ms,
      status: r.has_error ? "error" : "ok",
      spanCount: r.span_count,
    }));
  }

  pruneTraces(retentionDays = 14): number {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    return this.db.prepare(`DELETE FROM trace_spans WHERE started_at < ?`).run(cutoff).changes;
  }
}

export class SpanHandle {
  private ended = false;
  private start = Date.now();
  constructor(private tracer: Tracer, public span: Span) {}

  setAttribute(key: string, value: unknown): void {
    this.span.attributes[key] = value;
  }

  setAttributes(attrs: Record<string, unknown>): void {
    Object.assign(this.span.attributes, attrs);
  }

  child(opts: { name: string; kind?: SpanKind; attributes?: Record<string, unknown> }): SpanHandle {
    return this.tracer.startSpan({
      name: opts.name,
      kind: opts.kind,
      traceId: this.span.traceId,
      parentSpanId: this.span.spanId,
      attributes: opts.attributes,
    });
  }

  end(opts: { status?: SpanStatus; error?: string; attributes?: Record<string, unknown> } = {}): void {
    if (this.ended) return;
    this.ended = true;
    this.span.endedAt = new Date().toISOString();
    this.span.durationMs = Date.now() - this.start;
    this.span.status = opts.status || "ok";
    if (opts.error) this.span.error = opts.error;
    if (opts.attributes) Object.assign(this.span.attributes, opts.attributes);
    this.tracer.persistEnd(this.span);
  }
}

function rowToSpan(row: SpanRow): Span {
  let attrs: Record<string, unknown> = {};
  if (row.attributes) {
    try { attrs = JSON.parse(row.attributes); } catch { /* ignore */ }
  }
  return {
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    name: row.name,
    kind: row.kind as SpanKind,
    status: row.status as SpanStatus,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    attributes: attrs,
    error: row.error ?? undefined,
  };
}
