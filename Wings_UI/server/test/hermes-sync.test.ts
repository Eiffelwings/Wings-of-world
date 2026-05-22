import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import BetterSqlite3 from "better-sqlite3";
import {
  describeHermesPaths,
  ensureHermesDb,
  resolveHermesHome,
  pushToHermes,
  pullFromHermes,
  mergeIntoWings,
  bidirectionalSync,
  wingsToHermes,
  hermesToWings,
  deterministicMemoryId,
  type WingsMemoryEntry,
} from "../features/hermes-sync.js";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-hermes-"));
  dbPath = path.join(tmpDir, "memory_store.db");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function entry(overrides: Partial<WingsMemoryEntry> = {}): WingsMemoryEntry {
  const now = "2026-04-25T10:00:00.000Z";
  return {
    id: "mem_test_" + Math.random().toString(36).slice(2, 8),
    content: "Wings is built on TypeScript + SQLite.",
    memoryType: "fact",
    source: "telegram",
    importanceScore: 0.7,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("hermes-sync · path resolution", () => {
  it("uses HERMES_HOME env var when set", () => {
    expect(resolveHermesHome({ HERMES_HOME: tmpDir })).toBe(path.resolve(tmpDir));
  });

  it("falls back to ~/.hermes when env var is empty", () => {
    const home = resolveHermesHome({ HERMES_HOME: "" });
    expect(home).toBe(path.join(os.homedir(), ".hermes"));
  });

  it("describeHermesPaths reports existence flags accurately", () => {
    const before = describeHermesPaths({ HERMES_HOME: tmpDir });
    expect(before.homeExists).toBe(true);
    expect(before.dbExists).toBe(false);

    fs.writeFileSync(path.join(tmpDir, "memory_store.db"), "");
    const after = describeHermesPaths({ HERMES_HOME: tmpDir });
    expect(after.dbExists).toBe(true);
  });
});

describe("hermes-sync · schema bootstrap", () => {
  it("creates the facts table when missing", () => {
    const db = ensureHermesDb(dbPath);
    try {
      const row = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='facts'`)
        .get() as { name: string } | undefined;
      expect(row?.name).toBe("facts");
    } finally {
      db.close();
    }
  });

  it("is idempotent — safe to call repeatedly", () => {
    let db = ensureHermesDb(dbPath);
    db.close();
    db = ensureHermesDb(dbPath);
    expect(() => db.exec(`SELECT * FROM facts LIMIT 1;`)).not.toThrow();
    db.close();
  });
});

describe("hermes-sync · field mapping", () => {
  it("preserves content and trust score round-trip", () => {
    const w = entry({ importanceScore: 0.85 });
    const h = wingsToHermes(w);
    expect(h.trust_score).toBe(0.85);
    const back = hermesToWings({
      fact_id: 1,
      content: h.content,
      category: h.category,
      tags: h.tags,
      trust_score: h.trust_score,
      retrieval_count: 0,
      helpful_count: 0,
      created_at: h.created_at,
      updated_at: h.updated_at,
    });
    expect(back.content).toBe(w.content);
    expect(back.importanceScore).toBe(w.importanceScore);
  });

  it("clamps out-of-range trust scores", () => {
    expect(wingsToHermes(entry({ importanceScore: -1 })).trust_score).toBe(0);
    expect(wingsToHermes(entry({ importanceScore: 5 })).trust_score).toBe(1);
  });

  it("normalises an unknown category to 'fact'", () => {
    const back = hermesToWings({
      fact_id: 1,
      content: "x",
      category: "weird-thing",
      tags: "",
      trust_score: 0.5,
      retrieval_count: 0,
      helpful_count: 0,
      created_at: "2026-04-25T00:00:00Z",
      updated_at: "2026-04-25T00:00:00Z",
    });
    expect(back.memoryType).toBe("fact");
  });

  it("converts SQLite timestamps to ISO 8601", () => {
    const back = hermesToWings({
      fact_id: 1,
      content: "x",
      category: "fact",
      tags: "",
      trust_score: 0.5,
      retrieval_count: 0,
      helpful_count: 0,
      created_at: "2026-04-25 09:30:00",
      updated_at: "2026-04-25 10:30:00",
    });
    expect(back.createdAt).toBe("2026-04-25T09:30:00.000Z");
    expect(back.updatedAt).toBe("2026-04-25T10:30:00.000Z");
  });

  it("deterministic IDs are stable for the same content", () => {
    expect(deterministicMemoryId("hello")).toBe(deterministicMemoryId("hello"));
    expect(deterministicMemoryId("hello")).not.toBe(deterministicMemoryId("world"));
  });
});

describe("hermes-sync · push", () => {
  it("inserts new entries", () => {
    const db = ensureHermesDb(dbPath);
    try {
      const stats = pushToHermes(db, [entry({ content: "fact one" }), entry({ content: "fact two" })]);
      expect(stats.inserted).toBe(2);
      expect(stats.unchanged).toBe(0);
      const count = (db.prepare(`SELECT COUNT(*) AS n FROM facts`).get() as { n: number }).n;
      expect(count).toBe(2);
    } finally {
      db.close();
    }
  });

  it("only updates rows when the incoming entry is newer", () => {
    const db = ensureHermesDb(dbPath);
    try {
      pushToHermes(db, [entry({ content: "evolving fact", importanceScore: 0.5, updatedAt: "2026-04-25T00:00:00Z" })]);
      const second = pushToHermes(db, [entry({ content: "evolving fact", importanceScore: 0.9, updatedAt: "2026-04-25T01:00:00Z" })]);
      expect(second.updated).toBe(1);
      const row = db.prepare(`SELECT trust_score FROM facts WHERE content = ?`).get("evolving fact") as { trust_score: number };
      expect(row.trust_score).toBe(0.9);

      const stale = pushToHermes(db, [entry({ content: "evolving fact", importanceScore: 0.1, updatedAt: "2025-01-01T00:00:00Z" })]);
      expect(stale.unchanged).toBe(1);
      const after = db.prepare(`SELECT trust_score FROM facts WHERE content = ?`).get("evolving fact") as { trust_score: number };
      expect(after.trust_score).toBe(0.9);
    } finally {
      db.close();
    }
  });
});

describe("hermes-sync · pull", () => {
  it("returns rows ordered by updated_at desc", () => {
    const db = ensureHermesDb(dbPath);
    try {
      pushToHermes(db, [
        entry({ content: "older", updatedAt: "2026-04-20T00:00:00Z" }),
        entry({ content: "newer", updatedAt: "2026-04-25T00:00:00Z" }),
      ]);
      const out = pullFromHermes(db);
      expect(out[0].content).toBe("newer");
      expect(out[1].content).toBe("older");
    } finally {
      db.close();
    }
  });

  it("respects the limit", () => {
    const db = ensureHermesDb(dbPath);
    try {
      for (let i = 0; i < 5; i++) {
        pushToHermes(db, [entry({ content: `fact ${i}`, updatedAt: `2026-04-25T${String(i).padStart(2, "0")}:00:00Z` })]);
      }
      const limited = pullFromHermes(db, 2);
      expect(limited).toHaveLength(2);
    } finally {
      db.close();
    }
  });
});

describe("hermes-sync · merge into Wings", () => {
  it("inserts new content and skips older duplicates", () => {
    const current = [entry({ content: "shared", updatedAt: "2026-04-25T01:00:00Z", importanceScore: 0.4 })];
    const incoming = [
      entry({ content: "shared", updatedAt: "2026-04-25T02:00:00Z", importanceScore: 0.9 }),
      entry({ content: "from hermes", updatedAt: "2026-04-25T03:00:00Z" }),
    ];
    const { merged, stats } = mergeIntoWings(current, incoming);
    expect(stats.inserted).toBe(1);
    expect(stats.updated).toBe(1);
    const shared = merged.find((m) => m.content === "shared")!;
    expect(shared.importanceScore).toBe(0.9);
    expect(merged.find((m) => m.content === "from hermes")).toBeDefined();
  });

  it("leaves Wings entries untouched when Hermes is older", () => {
    const current = [entry({ content: "x", updatedAt: "2026-04-25T05:00:00Z", importanceScore: 0.5 })];
    const incoming = [entry({ content: "x", updatedAt: "2026-04-25T01:00:00Z", importanceScore: 0.9 })];
    const { merged, stats } = mergeIntoWings(current, incoming);
    expect(stats.unchanged).toBe(1);
    expect(merged[0].importanceScore).toBe(0.5);
  });
});

describe("hermes-sync · bidirectional", () => {
  it("pushes Wings and pulls Hermes in one shot, persisting the merged list", async () => {
    const db = ensureHermesDb(dbPath);
    // Pre-populate Hermes with a fact Wings doesn't have yet.
    db.prepare(
      `INSERT INTO facts (content, category, tags, trust_score, created_at, updated_at)
       VALUES (?, 'fact', 'hermes', 0.6, ?, ?)`,
    ).run("from hermes side", "2026-04-25T00:00:00Z", "2026-04-25T00:00:00Z");

    const wingsEntries = [entry({ content: "from wings side", updatedAt: "2026-04-25T01:00:00Z" })];
    let persisted: WingsMemoryEntry[] | null = null;

    const report = await bidirectionalSync({
      hermesDb: db,
      wingsEntries,
      persistWings: (merged) => { persisted = merged; },
    });

    expect(report.push.inserted).toBe(1);
    expect(report.pull.inserted).toBeGreaterThanOrEqual(1);
    expect(persisted).not.toBeNull();
    const persistedNonNull = persisted as unknown as WingsMemoryEntry[];
    const contents = persistedNonNull.map((e) => e.content);
    expect(contents).toContain("from wings side");
    expect(contents).toContain("from hermes side");

    db.close();
  });
});

describe("hermes-sync · interop with raw better-sqlite3", () => {
  it("written rows are visible when the file is reopened independently", () => {
    const db = ensureHermesDb(dbPath);
    pushToHermes(db, [entry({ content: "persistence test" })]);
    db.close();

    // Re-open without going through ensureHermesDb to confirm rows persist.
    const reader = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const row = reader.prepare(`SELECT content FROM facts WHERE content = ?`).get("persistence test");
      expect(row).toBeDefined();
    } finally {
      reader.close();
    }
  });
});
