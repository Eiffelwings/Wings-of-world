// Hermes ↔ Wings memory sync.
//
// Hermes stores memory in `$HERMES_HOME/memory_store.db` (default
// `~/.hermes/memory_store.db`) using the `facts` table from the holographic
// memory plugin. Wings stores its own memory entries — JSON file plus an
// optional Obsidian mirror — with a slightly different shape.
//
// This module bridges the two: push Wings memories into the Hermes DB so
// the Hermes agent sees them, and pull Hermes facts back into Wings so the
// Wings UI / Telegram bot can surface them. Conflict resolution is
// last-write-wins by `updated_at`.
//
// We deliberately do NOT touch the Hermes `hrr_vector` BLOB column. Hermes
// regenerates the holographic vector when it next reads a row, so writing
// a stale vector would be worse than leaving it empty.

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import type Database from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import { writeJsonSync, readJsonSafe } from "../lib/storage.js";

// ---------------------------------------------------------------------------
// Hermes home / db location
// ---------------------------------------------------------------------------

export interface HermesPaths {
  homeDir: string;
  dbPath: string;
  homeExists: boolean;
  dbExists: boolean;
}

export function resolveHermesHome(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = (env.HERMES_HOME || "").trim();
  if (explicit) return path.resolve(explicit);
  return path.join(os.homedir(), ".hermes");
}

export function describeHermesPaths(env: NodeJS.ProcessEnv = process.env): HermesPaths {
  const homeDir = resolveHermesHome(env);
  const dbPath = path.join(homeDir, "memory_store.db");
  return {
    homeDir,
    dbPath,
    homeExists: fs.existsSync(homeDir),
    dbExists: fs.existsSync(dbPath),
  };
}

// ---------------------------------------------------------------------------
// Schema (must match plugins/memory/holographic/store.py)
// ---------------------------------------------------------------------------

const HERMES_SCHEMA = `
CREATE TABLE IF NOT EXISTS facts (
    fact_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    content         TEXT NOT NULL UNIQUE,
    category        TEXT DEFAULT 'general',
    tags            TEXT DEFAULT '',
    trust_score     REAL DEFAULT 0.5,
    retrieval_count INTEGER DEFAULT 0,
    helpful_count   INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    hrr_vector      BLOB
);
CREATE INDEX IF NOT EXISTS idx_facts_trust    ON facts(trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
`;

/**
 * Ensure the Hermes DB and `facts` table exist. Safe to call repeatedly.
 * If Hermes isn't installed yet, we still create a schema-compatible DB so
 * Hermes can pick it up the moment it boots.
 */
export function ensureHermesDb(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new BetterSqlite3(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(HERMES_SCHEMA);
  return db;
}

// ---------------------------------------------------------------------------
// Wings memory shape (mirror of the relevant fields from index.ts)
// ---------------------------------------------------------------------------

export type WingsMemoryType = "fact" | "preference" | "context" | "summary" | "insight";

export interface WingsMemoryEntry {
  id: string;
  content: string;
  memoryType: WingsMemoryType;
  source: string;
  importanceScore: number; // 0–1
  createdAt: string;
  updatedAt: string;
}

export interface HermesFactRow {
  fact_id: number;
  content: string;
  category: string;
  tags: string;
  trust_score: number;
  retrieval_count: number;
  helpful_count: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/** Stable ID derived from content so Hermes facts pulled in get consistent IDs. */
export function deterministicMemoryId(content: string): string {
  const hash = crypto.createHash("sha1").update(content).digest("hex").slice(0, 12);
  return `mem_hermes_${hash}`;
}

export function wingsToHermes(entry: WingsMemoryEntry): {
  content: string;
  category: string;
  tags: string;
  trust_score: number;
  created_at: string;
  updated_at: string;
} {
  return {
    content: entry.content,
    category: entry.memoryType,
    tags: entry.source ? entry.source : "",
    trust_score: clampScore(entry.importanceScore),
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

export function hermesToWings(row: HermesFactRow): WingsMemoryEntry {
  return {
    id: deterministicMemoryId(row.content),
    content: row.content,
    memoryType: normaliseMemoryType(row.category),
    source: row.tags ? row.tags : "hermes",
    importanceScore: clampScore(row.trust_score),
    createdAt: normaliseTimestamp(row.created_at),
    updatedAt: normaliseTimestamp(row.updated_at),
  };
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

const MEMORY_TYPES: ReadonlySet<WingsMemoryType> = new Set([
  "fact", "preference", "context", "summary", "insight",
]);

function normaliseMemoryType(value: unknown): WingsMemoryType {
  const s = String(value || "").trim().toLowerCase();
  if ((MEMORY_TYPES as Set<string>).has(s)) return s as WingsMemoryType;
  return "fact";
}

function normaliseTimestamp(value: unknown): string {
  if (!value) return new Date().toISOString();
  const s = String(value).trim();
  // SQLite often returns "YYYY-MM-DD HH:MM:SS" — convert to ISO 8601.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return new Date(`${s.replace(" ", "T")}Z`).toISOString();
  }
  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Push / pull / sync
// ---------------------------------------------------------------------------

export interface SyncStats {
  inserted: number;
  updated: number;
  unchanged: number;
  conflicts: number;
}

const EMPTY_STATS = (): SyncStats => ({ inserted: 0, updated: 0, unchanged: 0, conflicts: 0 });

/** Push Wings memory entries into the Hermes facts table. */
export function pushToHermes(
  hermesDb: Database.Database,
  entries: WingsMemoryEntry[],
): SyncStats {
  const stats = EMPTY_STATS();
  const get = hermesDb.prepare(`SELECT updated_at FROM facts WHERE content = ?`);
  const insert = hermesDb.prepare(
    `INSERT INTO facts (content, category, tags, trust_score, created_at, updated_at)
     VALUES (@content, @category, @tags, @trust_score, @created_at, @updated_at)`,
  );
  const update = hermesDb.prepare(
    `UPDATE facts
     SET category = @category,
         tags = @tags,
         trust_score = @trust_score,
         updated_at = @updated_at
     WHERE content = @content`,
  );
  const tx = hermesDb.transaction((rows: WingsMemoryEntry[]) => {
    for (const row of rows) {
      const mapped = wingsToHermes(row);
      const existing = get.get(mapped.content) as { updated_at: string } | undefined;
      if (!existing) {
        insert.run(mapped);
        stats.inserted++;
      } else if (
        new Date(normaliseTimestamp(existing.updated_at)).getTime() <
        new Date(mapped.updated_at).getTime()
      ) {
        update.run(mapped);
        stats.updated++;
      } else {
        stats.unchanged++;
      }
    }
  });
  tx(entries);
  return stats;
}

/** Pull facts from the Hermes DB. Caller decides what to do with them. */
export function pullFromHermes(hermesDb: Database.Database, limit?: number): WingsMemoryEntry[] {
  const sql = `SELECT fact_id, content, category, tags, trust_score, retrieval_count, helpful_count,
                      created_at, updated_at
               FROM facts
               ORDER BY updated_at DESC
               ${typeof limit === "number" ? `LIMIT ${Math.max(1, Math.min(10_000, limit))}` : ""}`;
  const rows = hermesDb.prepare(sql).all() as HermesFactRow[];
  return rows.map(hermesToWings);
}

/**
 * Merge the incoming Hermes-facing entries into a Wings memory list. Existing
 * entries with the same content are updated only when the incoming row is
 * newer. Returns the merged list along with stats. Pure function — easy to
 * test and easy to chain into Wings' existing memory.json writer.
 */
export function mergeIntoWings(
  current: WingsMemoryEntry[],
  incoming: WingsMemoryEntry[],
): { merged: WingsMemoryEntry[]; stats: SyncStats } {
  const stats = EMPTY_STATS();
  const byContent = new Map<string, WingsMemoryEntry>();
  for (const entry of current) byContent.set(entry.content, entry);
  for (const entry of incoming) {
    const existing = byContent.get(entry.content);
    if (!existing) {
      byContent.set(entry.content, entry);
      stats.inserted++;
    } else if (new Date(existing.updatedAt).getTime() < new Date(entry.updatedAt).getTime()) {
      byContent.set(entry.content, { ...existing, ...entry });
      stats.updated++;
    } else {
      stats.unchanged++;
    }
  }
  return { merged: [...byContent.values()], stats };
}

export interface BidirectionalReport {
  push: SyncStats;
  pull: SyncStats;
  durationMs: number;
}

/**
 * Run a full reconciliation. Pushes Wings → Hermes, then pulls Hermes →
 * Wings using the merged result. The caller persists the merged Wings list.
 */
export async function bidirectionalSync(args: {
  hermesDb: Database.Database;
  wingsEntries: WingsMemoryEntry[];
  persistWings: (merged: WingsMemoryEntry[]) => void | Promise<void>;
}): Promise<BidirectionalReport> {
  const start = Date.now();
  const push = pushToHermes(args.hermesDb, args.wingsEntries);
  const incoming = pullFromHermes(args.hermesDb);
  const { merged, stats: pull } = mergeIntoWings(args.wingsEntries, incoming);
  await args.persistWings(merged);
  return { push, pull, durationMs: Date.now() - start };
}

// ---------------------------------------------------------------------------
// Convenience JSON-file helpers (used when Wings is configured to mirror its
// memory to a flat file rather than a SQLite table).
// ---------------------------------------------------------------------------

export function loadWingsMemoryFile(filePath: string): WingsMemoryEntry[] {
  const raw = readJsonSafe<unknown>(filePath, []);
  return Array.isArray(raw) ? (raw as WingsMemoryEntry[]) : [];
}

export function saveWingsMemoryFile(filePath: string, entries: WingsMemoryEntry[]): void {
  writeJsonSync(filePath, entries, { mode: 0o600 });
}
