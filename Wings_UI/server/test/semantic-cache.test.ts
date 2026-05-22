import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb, getDb } from "../lib/db.js";
import {
  ensureCacheSchema,
  storeEntry,
  lookupExact,
  lookupSemantic,
  recordHit,
  getCacheStats,
  clearCache,
  pruneCache,
} from "../features/semantic-cache.js";
import { hashEmbedding } from "../features/vector-memory.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-cache-"));
  initDb(path.join(tmpDir, "cache.db"));
  ensureCacheSchema(getDb());
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("semantic-cache", () => {
  it("stores and retrieves an entry by exact prompt match", () => {
    const db = getDb();
    storeEntry(db, {
      prompt: "What is the capital of France?",
      response: "Paris.",
      model: "gpt-4o",
      embedding: hashEmbedding("What is the capital of France?"),
    });
    const hit = lookupExact(db, "What is the capital of France?", "gpt-4o");
    expect(hit?.response).toBe("Paris.");
  });

  it("returns null for an exact lookup on a different model", () => {
    const db = getDb();
    storeEntry(db, {
      prompt: "hello",
      response: "world",
      model: "gpt-4o",
      embedding: hashEmbedding("hello"),
    });
    expect(lookupExact(db, "hello", "claude-sonnet-4-6")).toBeNull();
  });

  it("finds a semantically similar entry above the threshold", () => {
    const db = getDb();
    const phrase = "the quick brown fox jumps over the lazy dog";
    storeEntry(db, {
      prompt: phrase,
      response: "Pangram noted.",
      model: "gpt-4o",
      embedding: hashEmbedding(phrase),
    });
    // Same prompt → hash embedding is identical → similarity 1.0.
    const result = lookupSemantic(db, hashEmbedding(phrase), { threshold: 0.9 });
    expect(result.hit).toBe(true);
    expect(result.entry?.response).toBe("Pangram noted.");
  });

  it("misses when similarity is below threshold", () => {
    const db = getDb();
    storeEntry(db, {
      prompt: "apple banana cherry",
      response: "fruits",
      model: "gpt-4o",
      embedding: hashEmbedding("apple banana cherry"),
    });
    const result = lookupSemantic(db, hashEmbedding("rocket science engineering"), { threshold: 0.95 });
    expect(result.hit).toBe(false);
  });

  it("recordHit increments counters", () => {
    const db = getDb();
    const entry = storeEntry(db, { prompt: "x", response: "y", model: "m", embedding: hashEmbedding("x") });
    recordHit(db, entry.id, 100, 0.001);
    recordHit(db, entry.id, 50, 0.0005);
    const stats = getCacheStats(db);
    expect(stats.totalHits).toBe(2);
    expect(stats.tokensSaved).toBe(150);
    expect(stats.costSavedUsd).toBeCloseTo(0.0015);
  });

  it("clearCache removes all entries", () => {
    const db = getDb();
    storeEntry(db, { prompt: "a", response: "b", model: "m", embedding: hashEmbedding("a") });
    storeEntry(db, { prompt: "c", response: "d", model: "m", embedding: hashEmbedding("c") });
    expect(clearCache(db)).toBe(2);
    expect(getCacheStats(db).entries).toBe(0);
  });

  it("pruneCache removes only stale entries", () => {
    const db = getDb();
    storeEntry(db, { prompt: "fresh", response: "x", model: "m", embedding: hashEmbedding("fresh") });
    const oldDate = new Date(Date.now() - 60 * 86_400_000).toISOString();
    db.prepare(
      `INSERT INTO semantic_cache (id, prompt_hash, prompt, response, model, embedding, hits, created_at)
       VALUES ('stale', 'h', 'old', 'r', 'm', '[]', 0, ?)`,
    ).run(oldDate);
    expect(pruneCache(db, 30)).toBe(1);
    expect(getCacheStats(db).entries).toBe(1);
  });
});
