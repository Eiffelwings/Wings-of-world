// Tool result cache.
//
// Wraps `executeTool(name, args)` with a SQLite-backed memo so deterministic
// tools don't pay their cost on every agentic loop iteration. Each tool
// declares a cache policy (TTL, file-mtime, none) so we never cache things
// that legitimately change — write_file is never cached, web_search expires
// after an hour, and read_file invalidates the moment the file changes.
//
// The cache key is `(toolName, canonical_args_json)` hashed to a stable
// fingerprint. Args are sorted before hashing so `{q:"x", n:5}` hits the
// same row as `{n:5, q:"x"}`. Errors are never cached.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export type CacheInvalidator = "none" | "time" | "file-mtime" | "dir-mtime";

export interface ToolCachePolicy {
  cacheable: boolean;
  /** TTL in ms when invalidator is "time". */
  ttlMs?: number;
  invalidator?: CacheInvalidator;
  /** When invalidator is file-mtime / dir-mtime, which arg holds the path. */
  pathArgKey?: string;
}

const ONE_HOUR = 60 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;

/**
 * Default per-tool policies. Tools without an entry default to non-cacheable
 * so adding a new tool never silently caches dangerous results.
 */
export const DEFAULT_TOOL_CACHE_POLICIES: Record<string, ToolCachePolicy> = {
  // Read-only, deterministic.
  calculator: { cacheable: true, invalidator: "none" },
  web_search: { cacheable: true, invalidator: "time", ttlMs: ONE_HOUR },
  brave_search: { cacheable: true, invalidator: "time", ttlMs: ONE_HOUR },
  // File-system reads — invalidate when the underlying inode changes.
  read_file: { cacheable: true, invalidator: "file-mtime", pathArgKey: "path" },
  list_directory: { cacheable: true, invalidator: "dir-mtime", pathArgKey: "path" },
  // Pattern searches over a directory — short TTL because content shifts.
  search_files: { cacheable: true, invalidator: "time", ttlMs: ONE_MINUTE * 5 },
  // Side-effecting tools must NEVER be cached.
  write_file: { cacheable: false },
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function ensureToolCacheSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_cache (
      cache_key    TEXT PRIMARY KEY,
      tool_name    TEXT NOT NULL,
      args_json    TEXT NOT NULL,
      result_json  TEXT NOT NULL,
      result_bytes INTEGER NOT NULL DEFAULT 0,
      hits         INTEGER NOT NULL DEFAULT 0,
      bytes_saved  INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      expires_at   TEXT,
      last_hit_at  TEXT,
      invalidator  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tool_cache_tool ON tool_cache (tool_name);
    CREATE INDEX IF NOT EXISTS idx_tool_cache_expires ON tool_cache (expires_at);
    CREATE INDEX IF NOT EXISTS idx_tool_cache_last_hit ON tool_cache (last_hit_at DESC);
  `);
}

// ---------------------------------------------------------------------------
// Args canonicalisation + cache key
// ---------------------------------------------------------------------------

/**
 * Sort object keys recursively so `{q:"x", n:5}` and `{n:5, q:"x"}` hash to
 * the same fingerprint. Skips functions and undefineds (JSON.stringify drops
 * these naturally; explicit handling keeps the canonical form predictable).
 */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v === undefined) continue;
    out[key] = canonicalize(v);
  }
  return out;
}

export function canonicalArgs(args: Record<string, unknown>): string {
  return JSON.stringify(canonicalize(args ?? {}));
}

export function makeCacheKey(toolName: string, args: Record<string, unknown>): string {
  const canonical = canonicalArgs(args);
  return crypto.createHash("sha256").update(`${toolName}::${canonical}`).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// Invalidator computation
// ---------------------------------------------------------------------------

/**
 * Compute the invalidator string stored alongside a cache row. Reads file
 * mtimes synchronously — fine because tool calls are already paying disk
 * I/O. Returns null when no invalidator applies (TTL-only or none).
 */
export function computeInvalidator(
  policy: ToolCachePolicy,
  args: Record<string, unknown>,
): string | null {
  if (!policy.invalidator || policy.invalidator === "none" || policy.invalidator === "time") {
    return null;
  }
  const pathKey = policy.pathArgKey || "path";
  const target = args?.[pathKey];
  if (typeof target !== "string" || !target) return null;
  try {
    const stat = fs.statSync(path.resolve(target));
    return `${policy.invalidator}:${stat.mtimeMs}`;
  } catch {
    // File missing — treat as a non-hit so we don't serve stale rows once
    // the file is created. Returning a unique sentinel forces fresh fetch.
    return `${policy.invalidator}:missing-${Date.now()}`;
  }
}

// ---------------------------------------------------------------------------
// Lookup / save / record hit
// ---------------------------------------------------------------------------

interface CacheRow {
  cache_key: string;
  tool_name: string;
  args_json: string;
  result_json: string;
  result_bytes: number;
  hits: number;
  bytes_saved: number;
  created_at: string;
  expires_at: string | null;
  last_hit_at: string | null;
  invalidator: string | null;
}

export interface ToolCacheLookup {
  hit: boolean;
  result?: unknown;
  reason?: string;
  rowKey?: string;
  bytes?: number;
}

export function lookupCache(
  db: Database.Database,
  toolName: string,
  args: Record<string, unknown>,
  policy: ToolCachePolicy,
): ToolCacheLookup {
  if (!policy.cacheable) return { hit: false, reason: "tool-not-cacheable" };
  const cacheKey = makeCacheKey(toolName, args);
  const row = db
    .prepare(`SELECT * FROM tool_cache WHERE cache_key = ?`)
    .get(cacheKey) as CacheRow | undefined;
  if (!row) return { hit: false, reason: "miss", rowKey: cacheKey };

  // TTL check
  if (row.expires_at) {
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { hit: false, reason: "expired-ttl", rowKey: cacheKey };
    }
  }

  // Invalidator check (e.g., file mtime)
  const currentInvalidator = computeInvalidator(policy, args);
  if (currentInvalidator && row.invalidator && currentInvalidator !== row.invalidator) {
    return { hit: false, reason: "invalidator-mismatch", rowKey: cacheKey };
  }

  let result: unknown;
  try { result = JSON.parse(row.result_json); } catch {
    return { hit: false, reason: "corrupt-row", rowKey: cacheKey };
  }
  return { hit: true, result, rowKey: cacheKey, bytes: row.result_bytes };
}

export function recordHit(db: Database.Database, cacheKey: string, bytes: number): void {
  db.prepare(
    `UPDATE tool_cache
     SET hits = hits + 1,
         bytes_saved = bytes_saved + ?,
         last_hit_at = ?
     WHERE cache_key = ?`,
  ).run(bytes, new Date().toISOString(), cacheKey);
}

export function saveToCache(
  db: Database.Database,
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  policy: ToolCachePolicy,
): void {
  if (!policy.cacheable) return;
  if (result == null) return;
  // Never cache error envelopes — they're typically transient.
  if (typeof result === "object" && result !== null && "error" in (result as any) && (result as any).error) {
    return;
  }
  const cacheKey = makeCacheKey(toolName, args);
  const argsJson = canonicalArgs(args);
  const resultJson = JSON.stringify(result);
  if (resultJson === undefined) return; // unserialisable
  const expiresAt = policy.invalidator === "time" && policy.ttlMs
    ? new Date(Date.now() + policy.ttlMs).toISOString()
    : null;
  const invalidator = computeInvalidator(policy, args);
  db.prepare(
    `INSERT OR REPLACE INTO tool_cache
       (cache_key, tool_name, args_json, result_json, result_bytes, hits, bytes_saved,
        created_at, expires_at, last_hit_at, invalidator)
     VALUES (@cache_key, @tool_name, @args_json, @result_json, @result_bytes, 0, 0,
             @created_at, @expires_at, NULL, @invalidator)`,
  ).run({
    cache_key: cacheKey,
    tool_name: toolName,
    args_json: argsJson,
    result_json: resultJson,
    result_bytes: Buffer.byteLength(resultJson, "utf-8"),
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
    invalidator,
  });
}

// ---------------------------------------------------------------------------
// Stats / list / prune / clear
// ---------------------------------------------------------------------------

export interface ToolCacheStats {
  totalEntries: number;
  totalHits: number;
  totalBytesSaved: number;
  byTool: Array<{ tool: string; entries: number; hits: number; bytesSaved: number; avgResultBytes: number }>;
}

export function getToolCacheStats(db: Database.Database): ToolCacheStats {
  const totals = db.prepare(
    `SELECT COUNT(*) AS entries,
            COALESCE(SUM(hits), 0) AS hits,
            COALESCE(SUM(bytes_saved), 0) AS bytes_saved
     FROM tool_cache`,
  ).get() as { entries: number; hits: number; bytes_saved: number };
  const rows = db.prepare(
    `SELECT tool_name AS tool,
            COUNT(*) AS entries,
            COALESCE(SUM(hits), 0) AS hits,
            COALESCE(SUM(bytes_saved), 0) AS bytes_saved,
            COALESCE(AVG(result_bytes), 0) AS avg_bytes
     FROM tool_cache
     GROUP BY tool_name
     ORDER BY hits DESC, entries DESC`,
  ).all() as Array<{ tool: string; entries: number; hits: number; bytes_saved: number; avg_bytes: number }>;
  return {
    totalEntries: totals.entries,
    totalHits: totals.hits,
    totalBytesSaved: totals.bytes_saved,
    byTool: rows.map((r) => ({
      tool: r.tool,
      entries: r.entries,
      hits: r.hits,
      bytesSaved: r.bytes_saved,
      avgResultBytes: Math.round(r.avg_bytes),
    })),
  };
}

export interface ToolCacheEntrySummary {
  cacheKey: string;
  toolName: string;
  args: unknown;
  hits: number;
  bytes: number;
  createdAt: string;
  lastHitAt: string | null;
  expiresAt: string | null;
}

export function listToolCacheEntries(db: Database.Database, limit = 50): ToolCacheEntrySummary[] {
  const rows = db.prepare(
    `SELECT cache_key, tool_name, args_json, hits, result_bytes, created_at, last_hit_at, expires_at
     FROM tool_cache
     ORDER BY hits DESC, created_at DESC
     LIMIT ?`,
  ).all(limit) as Array<{
    cache_key: string;
    tool_name: string;
    args_json: string;
    hits: number;
    result_bytes: number;
    created_at: string;
    last_hit_at: string | null;
    expires_at: string | null;
  }>;
  return rows.map((r) => {
    let args: unknown;
    try { args = JSON.parse(r.args_json); } catch { args = r.args_json; }
    return {
      cacheKey: r.cache_key,
      toolName: r.tool_name,
      args,
      hits: r.hits,
      bytes: r.result_bytes,
      createdAt: r.created_at,
      lastHitAt: r.last_hit_at,
      expiresAt: r.expires_at,
    };
  });
}

/**
 * Drop expired rows + LRU-evict everything beyond `maxEntries`. Returns the
 * number of rows removed across both passes.
 */
export function pruneToolCache(
  db: Database.Database,
  options: { maxEntries?: number } = {},
): number {
  const max = Math.max(50, options.maxEntries ?? 5_000);
  const now = new Date().toISOString();
  const expiredResult = db.prepare(
    `DELETE FROM tool_cache WHERE expires_at IS NOT NULL AND expires_at < ?`,
  ).run(now);

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM tool_cache`).get() as { n: number }).n;
  let lruRemoved = 0;
  if (total > max) {
    const overflow = total - max;
    const lruResult = db.prepare(
      `DELETE FROM tool_cache WHERE cache_key IN (
         SELECT cache_key FROM tool_cache
         ORDER BY COALESCE(last_hit_at, created_at) ASC
         LIMIT ?
       )`,
    ).run(overflow);
    lruRemoved = lruResult.changes;
  }
  return expiredResult.changes + lruRemoved;
}

export function clearToolCache(db: Database.Database, toolName?: string): number {
  if (toolName) {
    return db.prepare(`DELETE FROM tool_cache WHERE tool_name = ?`).run(toolName).changes;
  }
  return db.prepare(`DELETE FROM tool_cache`).run().changes;
}

// ---------------------------------------------------------------------------
// High-level wrapper
// ---------------------------------------------------------------------------

export interface CacheableExecuteOptions {
  bypassCache?: boolean;
  policies?: Record<string, ToolCachePolicy>;
}

/**
 * Wrap a raw `executeTool` callback with the cache layer. Tools without a
 * policy entry pass through untouched (no cache, no overhead).
 */
export async function executeToolCached(
  db: Database.Database,
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  toolName: string,
  args: Record<string, unknown>,
  options: CacheableExecuteOptions = {},
): Promise<{ result: unknown; cacheHit: boolean; reason?: string }> {
  const policy = (options.policies || DEFAULT_TOOL_CACHE_POLICIES)[toolName] || { cacheable: false };
  if (options.bypassCache || !policy.cacheable) {
    const result = await executeTool(toolName, args);
    return { result, cacheHit: false, reason: options.bypassCache ? "bypass" : "tool-not-cacheable" };
  }
  const lookup = lookupCache(db, toolName, args, policy);
  if (lookup.hit) {
    if (lookup.rowKey) recordHit(db, lookup.rowKey, lookup.bytes ?? 0);
    return { result: lookup.result, cacheHit: true };
  }
  const result = await executeTool(toolName, args);
  saveToCache(db, toolName, args, result, policy);
  return { result, cacheHit: false, reason: lookup.reason };
}
