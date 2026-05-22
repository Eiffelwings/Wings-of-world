import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb, getDb } from "../lib/db.js";
import {
  ensureToolCacheSchema,
  canonicalArgs,
  makeCacheKey,
  computeInvalidator,
  lookupCache,
  saveToCache,
  recordHit,
  getToolCacheStats,
  listToolCacheEntries,
  pruneToolCache,
  clearToolCache,
  executeToolCached,
  DEFAULT_TOOL_CACHE_POLICIES,
  type ToolCachePolicy,
} from "../features/tool-cache.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-toolcache-"));
  initDb(path.join(tmpDir, "tc.db"));
  ensureToolCacheSchema(getDb());
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("canonicalArgs / makeCacheKey", () => {
  it("hashes shuffled keys to the same fingerprint", () => {
    const a = makeCacheKey("web_search", { q: "wings", n: 5 });
    const b = makeCacheKey("web_search", { n: 5, q: "wings" });
    expect(a).toBe(b);
  });

  it("differentiates by tool name", () => {
    const a = makeCacheKey("web_search", { q: "x" });
    const b = makeCacheKey("brave_search", { q: "x" });
    expect(a).not.toBe(b);
  });

  it("differentiates nested values", () => {
    const a = makeCacheKey("t", { o: { a: 1, b: 2 } });
    const b = makeCacheKey("t", { o: { b: 2, a: 1 } });
    expect(a).toBe(b);
    const c = makeCacheKey("t", { o: { a: 1, b: 3 } });
    expect(a).not.toBe(c);
  });

  it("strips undefined values when canonicalising", () => {
    expect(canonicalArgs({ a: 1, b: undefined })).toBe(canonicalArgs({ a: 1 }));
  });

  it("returns deterministic JSON", () => {
    expect(canonicalArgs({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });
});

describe("DEFAULT_TOOL_CACHE_POLICIES", () => {
  it("never caches write_file", () => {
    expect(DEFAULT_TOOL_CACHE_POLICIES.write_file.cacheable).toBe(false);
  });

  it("caches calculator forever", () => {
    const p = DEFAULT_TOOL_CACHE_POLICIES.calculator;
    expect(p.cacheable).toBe(true);
    expect(p.invalidator).toBe("none");
    expect(p.ttlMs).toBeUndefined();
  });

  it("uses TTL for web_search", () => {
    const p = DEFAULT_TOOL_CACHE_POLICIES.web_search;
    expect(p.cacheable).toBe(true);
    expect(p.invalidator).toBe("time");
    expect(p.ttlMs).toBeGreaterThan(0);
  });

  it("uses file-mtime for read_file", () => {
    expect(DEFAULT_TOOL_CACHE_POLICIES.read_file.invalidator).toBe("file-mtime");
    expect(DEFAULT_TOOL_CACHE_POLICIES.read_file.pathArgKey).toBe("path");
  });
});

describe("computeInvalidator", () => {
  it("returns null for time-only or none policies", () => {
    expect(computeInvalidator({ cacheable: true, invalidator: "none" }, {})).toBeNull();
    expect(computeInvalidator({ cacheable: true, invalidator: "time", ttlMs: 1000 }, {})).toBeNull();
  });

  it("returns mtime token for an existing file", () => {
    const f = path.join(tmpDir, "data.txt");
    fs.writeFileSync(f, "hello");
    const inv = computeInvalidator(
      { cacheable: true, invalidator: "file-mtime", pathArgKey: "path" },
      { path: f },
    );
    expect(inv).toMatch(/^file-mtime:\d+/);
  });

  it("returns missing sentinel when the file isn't there", () => {
    const inv = computeInvalidator(
      { cacheable: true, invalidator: "file-mtime", pathArgKey: "path" },
      { path: path.join(tmpDir, "ghost.txt") },
    );
    expect(inv).toMatch(/^file-mtime:missing-/);
  });
});

describe("save / lookup / recordHit", () => {
  const policy: ToolCachePolicy = { cacheable: true, invalidator: "none" };

  it("misses on a fresh cache", () => {
    const r = lookupCache(getDb(), "calculator", { expression: "1+1" }, policy);
    expect(r.hit).toBe(false);
    expect(r.reason).toBe("miss");
  });

  it("hits after save", () => {
    saveToCache(getDb(), "calculator", { expression: "1+1" }, "2", policy);
    const r = lookupCache(getDb(), "calculator", { expression: "1+1" }, policy);
    expect(r.hit).toBe(true);
    expect(r.result).toBe("2");
  });

  it("hits regardless of arg order", () => {
    saveToCache(getDb(), "web_search", { q: "x", count: 5 }, ["a", "b"], { cacheable: true, invalidator: "none" });
    const r = lookupCache(getDb(), "web_search", { count: 5, q: "x" }, { cacheable: true, invalidator: "none" });
    expect(r.hit).toBe(true);
  });

  it("expires entries past TTL", () => {
    const p: ToolCachePolicy = { cacheable: true, invalidator: "time", ttlMs: 50 };
    saveToCache(getDb(), "web_search", { q: "x" }, ["r"], p);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const r = lookupCache(getDb(), "web_search", { q: "x" }, p);
        expect(r.hit).toBe(false);
        expect(r.reason).toBe("expired-ttl");
        resolve();
      }, 80);
    });
  });

  it("invalidates when file mtime changes", () => {
    const file = path.join(tmpDir, "doc.txt");
    fs.writeFileSync(file, "v1");
    const p: ToolCachePolicy = { cacheable: true, invalidator: "file-mtime", pathArgKey: "path" };
    saveToCache(getDb(), "read_file", { path: file }, "v1", p);
    const hit1 = lookupCache(getDb(), "read_file", { path: file }, p);
    expect(hit1.hit).toBe(true);

    // Bump mtime artificially since fs caches at sub-ms granularity.
    const future = new Date(Date.now() + 5_000);
    fs.utimesSync(file, future, future);

    const miss = lookupCache(getDb(), "read_file", { path: file }, p);
    expect(miss.hit).toBe(false);
    expect(miss.reason).toBe("invalidator-mismatch");
  });

  it("never caches non-cacheable tools", () => {
    saveToCache(getDb(), "write_file", { path: "x" }, "ok", { cacheable: false });
    const r = lookupCache(getDb(), "write_file", { path: "x" }, { cacheable: false });
    expect(r.hit).toBe(false);
  });

  it("never caches error envelopes", () => {
    saveToCache(getDb(), "calculator", { expression: "x/0" }, { error: "boom" }, { cacheable: true, invalidator: "none" });
    const r = lookupCache(getDb(), "calculator", { expression: "x/0" }, { cacheable: true, invalidator: "none" });
    expect(r.hit).toBe(false);
  });

  it("recordHit increments counters", () => {
    const policy: ToolCachePolicy = { cacheable: true, invalidator: "none" };
    saveToCache(getDb(), "calculator", { expression: "2+2" }, "4", policy);
    const lookup = lookupCache(getDb(), "calculator", { expression: "2+2" }, policy);
    expect(lookup.hit).toBe(true);
    if (lookup.rowKey) recordHit(getDb(), lookup.rowKey, lookup.bytes ?? 0);
    if (lookup.rowKey) recordHit(getDb(), lookup.rowKey, lookup.bytes ?? 0);
    const stats = getToolCacheStats(getDb());
    expect(stats.totalHits).toBe(2);
  });
});

describe("getToolCacheStats", () => {
  it("aggregates entries and hits per tool", () => {
    const p: ToolCachePolicy = { cacheable: true, invalidator: "none" };
    saveToCache(getDb(), "calculator", { e: "1+1" }, 2, p);
    saveToCache(getDb(), "calculator", { e: "2+2" }, 4, p);
    saveToCache(getDb(), "web_search", { q: "x" }, ["r"], { cacheable: true, invalidator: "none" });
    const stats = getToolCacheStats(getDb());
    expect(stats.totalEntries).toBe(3);
    const calc = stats.byTool.find((t) => t.tool === "calculator")!;
    expect(calc.entries).toBe(2);
  });
});

describe("listToolCacheEntries", () => {
  it("returns args parsed back into objects", () => {
    saveToCache(getDb(), "web_search", { q: "wings" }, ["r"], { cacheable: true, invalidator: "none" });
    const list = listToolCacheEntries(getDb(), 10);
    expect(list).toHaveLength(1);
    expect(list[0].args).toEqual({ q: "wings" });
  });
});

describe("pruneToolCache", () => {
  it("removes expired entries", async () => {
    saveToCache(getDb(), "web_search", { q: "old" }, ["r"], {
      cacheable: true,
      invalidator: "time",
      ttlMs: 50,
    });
    await new Promise((r) => setTimeout(r, 80));
    const removed = pruneToolCache(getDb());
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it("LRU-evicts when over the maxEntries cap", () => {
    const p: ToolCachePolicy = { cacheable: true, invalidator: "none" };
    for (let i = 0; i < 60; i++) {
      saveToCache(getDb(), "calculator", { e: `expr-${i}` }, i, p);
    }
    const removed = pruneToolCache(getDb(), { maxEntries: 50 });
    expect(removed).toBe(10);
    const stats = getToolCacheStats(getDb());
    expect(stats.totalEntries).toBe(50);
  });
});

describe("clearToolCache", () => {
  it("clears everything when no tool is given", () => {
    const p: ToolCachePolicy = { cacheable: true, invalidator: "none" };
    saveToCache(getDb(), "a", { x: 1 }, "r", p);
    saveToCache(getDb(), "b", { x: 2 }, "r", p);
    expect(clearToolCache(getDb())).toBe(2);
    expect(getToolCacheStats(getDb()).totalEntries).toBe(0);
  });

  it("clears only the named tool", () => {
    const p: ToolCachePolicy = { cacheable: true, invalidator: "none" };
    saveToCache(getDb(), "calculator", { e: "1" }, 1, p);
    saveToCache(getDb(), "web_search", { q: "x" }, "r", p);
    expect(clearToolCache(getDb(), "calculator")).toBe(1);
    expect(getToolCacheStats(getDb()).totalEntries).toBe(1);
  });
});

describe("executeToolCached integration", () => {
  it("only runs the tool once for repeated cacheable calls", async () => {
    let calls = 0;
    const exec = async (_n: string, _a: any) => { calls++; return { value: 42 }; };
    const policies = { fake_tool: { cacheable: true, invalidator: "none" as const } };
    const a = await executeToolCached(getDb(), exec, "fake_tool", { x: 1 }, { policies });
    const b = await executeToolCached(getDb(), exec, "fake_tool", { x: 1 }, { policies });
    expect(calls).toBe(1);
    expect(a.cacheHit).toBe(false);
    expect(b.cacheHit).toBe(true);
    expect((b.result as any).value).toBe(42);
  });

  it("bypasses the cache when bypassCache is true", async () => {
    let calls = 0;
    const exec = async () => { calls++; return "fresh"; };
    const policies = { fake_tool: { cacheable: true, invalidator: "none" as const } };
    await executeToolCached(getDb(), exec, "fake_tool", { x: 1 }, { policies });
    await executeToolCached(getDb(), exec, "fake_tool", { x: 1 }, { policies, bypassCache: true });
    expect(calls).toBe(2);
  });

  it("passes through tools with no policy entry", async () => {
    let calls = 0;
    const exec = async () => { calls++; return "x"; };
    await executeToolCached(getDb(), exec, "unknown_tool", { x: 1 });
    await executeToolCached(getDb(), exec, "unknown_tool", { x: 1 });
    expect(calls).toBe(2);
  });

  it("does not poison the cache with thrown errors", async () => {
    let calls = 0;
    const policies = { fake_tool: { cacheable: true, invalidator: "none" as const } };
    const exec = async () => {
      calls++;
      if (calls === 1) throw new Error("upstream down");
      return "now-ok";
    };
    await expect(executeToolCached(getDb(), exec, "fake_tool", { x: 1 }, { policies })).rejects.toThrow();
    const second = await executeToolCached(getDb(), exec, "fake_tool", { x: 1 }, { policies });
    expect(second.cacheHit).toBe(false);
    expect(second.result).toBe("now-ok");
  });
});
