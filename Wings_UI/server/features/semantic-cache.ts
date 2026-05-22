// Semantic response cache. Each cache entry stores the user prompt
// embedding, the assistant response, the model used, and metadata. On
// lookup we compute the query embedding once, then linearly score against
// stored entries (good enough up to ~10K entries; switch to ANN later).

import type Database from "better-sqlite3";
import { cosineSimilarity } from "./vector-memory.js";

export interface CacheEntry {
  id: string;
  promptHash: string;
  prompt: string;
  response: string;
  model: string | null;
  embedding: number[];
  hits: number;
  createdAt: string;
  lastHitAt: string | null;
  tokensSaved: number;
  costSavedUsd: number;
}

export interface CacheLookup {
  hit: boolean;
  entry?: CacheEntry;
  similarity?: number;
}

export const DEFAULT_SIMILARITY_THRESHOLD = 0.94;
export const DEFAULT_RETENTION_DAYS = 30;

interface CacheRow {
  id: string;
  prompt_hash: string;
  prompt: string;
  response: string;
  model: string | null;
  embedding: string;
  hits: number;
  created_at: string;
  last_hit_at: string | null;
  tokens_saved: number;
  cost_saved_usd: number;
}

function rowToEntry(row: CacheRow): CacheEntry {
  let embedding: number[] = [];
  try { embedding = JSON.parse(row.embedding); } catch { /* ignore */ }
  return {
    id: row.id,
    promptHash: row.prompt_hash,
    prompt: row.prompt,
    response: row.response,
    model: row.model,
    embedding,
    hits: row.hits,
    createdAt: row.created_at,
    lastHitAt: row.last_hit_at,
    tokensSaved: row.tokens_saved,
    costSavedUsd: row.cost_saved_usd,
  };
}

export function ensureCacheSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_cache (
      id              TEXT PRIMARY KEY,
      prompt_hash     TEXT NOT NULL UNIQUE,
      prompt          TEXT NOT NULL,
      response        TEXT NOT NULL,
      model           TEXT,
      embedding       TEXT NOT NULL,
      hits            INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL,
      last_hit_at     TEXT,
      tokens_saved    INTEGER NOT NULL DEFAULT 0,
      cost_saved_usd  REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cache_hash ON semantic_cache (prompt_hash);
    CREATE INDEX IF NOT EXISTS idx_cache_created ON semantic_cache (created_at DESC);
  `);
}

import crypto from "crypto";

function hashPrompt(prompt: string, model?: string): string {
  return crypto.createHash("sha256").update(`${model || ""}::${prompt}`).digest("hex");
}

export function makeCacheId(): string {
  return `cache_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function lookupExact(db: Database.Database, prompt: string, model?: string): CacheEntry | null {
  const row = db
    .prepare(`SELECT * FROM semantic_cache WHERE prompt_hash = ?`)
    .get(hashPrompt(prompt, model)) as CacheRow | undefined;
  return row ? rowToEntry(row) : null;
}

export function lookupSemantic(
  db: Database.Database,
  promptEmbedding: number[],
  options: { threshold?: number; model?: string } = {},
): CacheLookup {
  if (!promptEmbedding || promptEmbedding.length === 0) return { hit: false };
  const threshold = options.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  // Pull all rows — fine for low cardinality. For larger caches, partition by
  // model and add a recency window.
  const where = options.model ? `WHERE model = ?` : "";
  const args = options.model ? [options.model] : [];
  const rows = db.prepare(`SELECT * FROM semantic_cache ${where}`).all(...args) as CacheRow[];
  let best: { entry: CacheEntry; similarity: number } | null = null;
  for (const row of rows) {
    const entry = rowToEntry(row);
    if (entry.embedding.length !== promptEmbedding.length) continue;
    const similarity = cosineSimilarity(promptEmbedding, entry.embedding);
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { entry, similarity };
    }
  }
  if (!best) return { hit: false };
  return { hit: true, entry: best.entry, similarity: best.similarity };
}

export function recordHit(db: Database.Database, entryId: string, savedTokens = 0, savedCostUsd = 0): void {
  db.prepare(
    `UPDATE semantic_cache
     SET hits = hits + 1,
         last_hit_at = ?,
         tokens_saved = tokens_saved + ?,
         cost_saved_usd = cost_saved_usd + ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), savedTokens, savedCostUsd, entryId);
}

export function storeEntry(
  db: Database.Database,
  entry: {
    prompt: string;
    response: string;
    model?: string;
    embedding: number[];
  },
): CacheEntry {
  const promptHash = hashPrompt(entry.prompt, entry.model);
  const id = makeCacheId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO semantic_cache (id, prompt_hash, prompt, response, model, embedding, hits, created_at, last_hit_at, tokens_saved, cost_saved_usd)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, 0, 0)`,
  ).run(
    id,
    promptHash,
    entry.prompt,
    entry.response,
    entry.model ?? null,
    JSON.stringify(entry.embedding),
    now,
  );
  return {
    id,
    promptHash,
    prompt: entry.prompt,
    response: entry.response,
    model: entry.model ?? null,
    embedding: entry.embedding,
    hits: 0,
    createdAt: now,
    lastHitAt: null,
    tokensSaved: 0,
    costSavedUsd: 0,
  };
}

export function listCacheEntries(db: Database.Database, limit = 100): CacheEntry[] {
  const rows = db
    .prepare(`SELECT * FROM semantic_cache ORDER BY hits DESC, created_at DESC LIMIT ?`)
    .all(limit) as CacheRow[];
  return rows.map(rowToEntry);
}

export function getCacheStats(db: Database.Database) {
  const stats = db.prepare(
    `SELECT COUNT(*) AS entries,
            COALESCE(SUM(hits), 0) AS total_hits,
            COALESCE(SUM(tokens_saved), 0) AS tokens_saved,
            COALESCE(SUM(cost_saved_usd), 0) AS cost_saved_usd
     FROM semantic_cache`,
  ).get() as { entries: number; total_hits: number; tokens_saved: number; cost_saved_usd: number };
  return {
    entries: stats.entries,
    totalHits: stats.total_hits,
    tokensSaved: stats.tokens_saved,
    costSavedUsd: Number(stats.cost_saved_usd.toFixed(6)),
  };
}

export function pruneCache(db: Database.Database, retentionDays = DEFAULT_RETENTION_DAYS): number {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  return db
    .prepare(`DELETE FROM semantic_cache WHERE created_at < ? AND (last_hit_at IS NULL OR last_hit_at < ?)`)
    .run(cutoff, cutoff).changes;
}

export function clearCache(db: Database.Database): number {
  return db.prepare(`DELETE FROM semantic_cache`).run().changes;
}
