import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb, getDb } from "../lib/db.js";
import {
  ensureConsolidationSchema,
  clusterByEmbedding,
  pickDrops,
  buildPlan,
  buildMergePrompt,
  consolidateMemories,
  persistConsolidationRun,
  listConsolidationRuns,
  getConsolidationRun,
  type ConsolidatableEntry,
} from "../features/memory-consolidation.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-consol-"));
  initDb(path.join(tmpDir, "consol.db"));
  ensureConsolidationSchema(getDb());
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Build embeddings the dumb way for unit tests: tiny 4-dim vectors that we
// craft so similarity math is predictable.
function vec(...nums: number[]): number[] {
  return nums;
}
function entry(id: string, content: string, embedding: number[], extras: Partial<ConsolidatableEntry> = {}): ConsolidatableEntry {
  return {
    id,
    content,
    embedding,
    importanceScore: 0.5,
    retrievalCount: 0,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...extras,
  };
}

describe("clusterByEmbedding", () => {
  it("groups vectors above the similarity threshold", () => {
    const entries = [
      entry("a", "alpha", vec(1, 0, 0, 0)),
      entry("b", "alpha-near", vec(0.99, 0.1, 0, 0)),
      entry("c", "alpha-near-2", vec(0.97, 0.2, 0, 0)),
      entry("z", "different", vec(0, 0, 1, 0)),
    ];
    const clusters = clusterByEmbedding(entries, 0.95, 3);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("does not form clusters below minClusterSize", () => {
    const entries = [
      entry("a", "x", vec(1, 0, 0, 0)),
      entry("b", "y", vec(0.99, 0.1, 0, 0)),
    ];
    const clusters = clusterByEmbedding(entries, 0.9, 3);
    expect(clusters).toEqual([]);
  });

  it("skips entries without an embedding", () => {
    const entries = [
      entry("a", "x", vec(1, 0, 0, 0)),
      { id: "b", content: "no-embed" },
      entry("c", "y", vec(0.95, 0.1, 0, 0)),
    ];
    const clusters = clusterByEmbedding(entries, 0.9, 2);
    for (const c of clusters) expect(c.memberIds).not.toContain("b");
  });

  it("picks the member with the highest mean similarity to its peers", () => {
    // Two tightly grouped pairs near the unit X-axis plus an outlier at the
    // edge — the picked rep should always belong to the inner triplet, not
    // the outlier.
    const entries = [
      entry("hub", "core", vec(1, 0, 0, 0)),
      entry("inner1", "near", vec(0.99, 0.05, 0, 0)),
      entry("inner2", "near", vec(0.99, -0.05, 0, 0)),
      entry("outlier", "outer", vec(0.85, 0.3, 0, 0)),
    ];
    const clusters = clusterByEmbedding(entries, 0.9, 3);
    expect(["hub", "inner1", "inner2"]).toContain(clusters[0].representativeId);
    expect(clusters[0].representativeId).not.toBe("outlier");
  });
});

describe("pickDrops", () => {
  const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const fresh = new Date().toISOString();

  it("drops unused, low-importance, old entries", () => {
    const drops = pickDrops(
      [
        entry("a", "x", vec(0), { retrievalCount: 0, importanceScore: 0.1, updatedAt: old }),
        entry("b", "y", vec(0), { retrievalCount: 0, importanceScore: 0.1, updatedAt: fresh }),
        entry("c", "z", vec(0), { retrievalCount: 5, importanceScore: 0.1, updatedAt: old }),
        entry("d", "w", vec(0), { retrievalCount: 0, importanceScore: 0.9, updatedAt: old }),
      ],
      { dropAfterDays: 30, dropImportanceBelow: 0.3, clustered: new Set() },
    );
    expect(drops.map((d) => d.id)).toEqual(["a"]);
  });

  it("never drops clustered entries", () => {
    const drops = pickDrops(
      [entry("a", "x", vec(0), { retrievalCount: 0, importanceScore: 0.1, updatedAt: old })],
      { dropAfterDays: 30, dropImportanceBelow: 0.3, clustered: new Set(["a"]) },
    );
    expect(drops).toEqual([]);
  });
});

describe("buildPlan", () => {
  it("estimates the saving as (cluster collapse) + (drop sizes)", () => {
    const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const entries = [
      entry("a", "alpha alpha alpha", vec(1, 0, 0, 0)),
      entry("b", "alpha alpha alpha", vec(0.99, 0.05, 0, 0)),
      entry("c", "alpha alpha alpha", vec(0.99, 0.05, 0.05, 0)),
      entry("d", "to-drop content", vec(0, 0, 0.3, 1), { retrievalCount: 0, importanceScore: 0.1, updatedAt: old }),
    ];
    const plan = buildPlan(entries, {
      similarityThreshold: 0.95,
      minClusterSize: 3,
      dropAfterDays: 30,
      dropImportanceBelow: 0.3,
    });
    expect(plan.clusters).toHaveLength(1);
    expect(plan.drops.map((d) => d.id)).toEqual(["d"]);
    expect(plan.totalEntries).toBe(4);
    // Collapsed 3-member cluster + 1 drop = 4 → 1 (rep) + 0 = ~1 entry left.
    expect(plan.reducedEntries).toBe(1);
    expect(plan.estimatedSavingChars).toBeGreaterThan(0);
  });
});

describe("consolidateMemories", () => {
  it("dry-run returns the plan but does not change entries", async () => {
    const entries = [
      entry("a", "alpha", vec(1, 0, 0, 0)),
      entry("b", "alpha-near", vec(0.99, 0.05, 0, 0)),
      entry("c", "alpha-near-2", vec(0.99, 0.05, 0.05, 0)),
    ];
    const outcome = await consolidateMemories(
      entries,
      { dryRun: true, similarityThreshold: 0.9, minClusterSize: 3 },
      { embed: async () => vec(0, 0, 0, 0), mergeCluster: async () => "merged content" },
    );
    expect(outcome.dryRun).toBe(true);
    expect(outcome.merged).toEqual([]);
    expect(outcome.resultEntries).toHaveLength(3);
    expect(outcome.plan.clusters).toHaveLength(1);
  });

  it("executes the merge and shrinks the working set", async () => {
    const entries = [
      entry("a", "alpha", vec(1, 0, 0, 0)),
      entry("b", "alpha-near", vec(0.99, 0.05, 0, 0)),
      entry("c", "alpha-near-2", vec(0.99, 0.05, 0.05, 0)),
      entry("z", "untouched", vec(0, 1, 0, 0)),
    ];
    let mergeCalls = 0;
    const outcome = await consolidateMemories(
      entries,
      { dryRun: false, similarityThreshold: 0.9, minClusterSize: 3 },
      {
        embed: async () => vec(0, 0, 0, 0),
        mergeCluster: async (members) => {
          mergeCalls++;
          return `summary of ${members.length} entries`;
        },
      },
    );
    expect(mergeCalls).toBe(1);
    expect(outcome.merged).toHaveLength(1);
    expect(outcome.resultEntries).toHaveLength(2); // 1 merged + 1 untouched
    const merged = outcome.resultEntries.find((e) => e.content.startsWith("summary"));
    expect(merged).toBeDefined();
  });

  it("computes embeddings for entries missing them", async () => {
    const entries: ConsolidatableEntry[] = [
      { id: "a", content: "needs-embed-1" },
      { id: "b", content: "needs-embed-2" },
      { id: "c", content: "needs-embed-3" },
    ];
    let embedCalls = 0;
    const outcome = await consolidateMemories(
      entries,
      { dryRun: true },
      {
        embed: async () => {
          embedCalls++;
          return vec(1, 0, 0, 0);
        },
        mergeCluster: async () => "x",
      },
    );
    expect(embedCalls).toBe(3);
    // All three vectors are identical → similarity 1 → cluster of 3
    expect(outcome.plan.clusters).toHaveLength(1);
  });

  it("preserves importance as the max of the cluster", async () => {
    const entries = [
      entry("a", "x", vec(1, 0, 0, 0), { importanceScore: 0.4 }),
      entry("b", "y", vec(0.99, 0.05, 0, 0), { importanceScore: 0.9 }),
      entry("c", "z", vec(0.99, 0.05, 0.05, 0), { importanceScore: 0.6 }),
    ];
    const outcome = await consolidateMemories(
      entries,
      { dryRun: false, similarityThreshold: 0.9, minClusterSize: 3 },
      { embed: async () => vec(0), mergeCluster: async () => "merged" },
    );
    const merged = outcome.resultEntries.find((e) => e.content === "merged")!;
    expect(merged.importanceScore).toBe(0.9);
  });
});

describe("buildMergePrompt", () => {
  it("includes every member and the rules", () => {
    const prompt = buildMergePrompt(["fact one", "fact two"]);
    expect(prompt).toContain("fact one");
    expect(prompt).toContain("fact two");
    expect(prompt.toLowerCase()).toContain("preserve");
    expect(prompt.toLowerCase()).toContain("canonical");
  });
});

describe("audit log", () => {
  it("persists and reads back consolidation runs", async () => {
    const entries = [
      entry("a", "alpha", vec(1, 0, 0, 0)),
      entry("b", "alpha-near", vec(0.99, 0.05, 0, 0)),
      entry("c", "alpha-near-2", vec(0.99, 0.05, 0.05, 0)),
    ];
    const outcome = await consolidateMemories(
      entries,
      { dryRun: true, similarityThreshold: 0.9, minClusterSize: 3 },
      { embed: async () => vec(0), mergeCluster: async () => "x" },
    );
    const id = persistConsolidationRun(getDb(), outcome);
    const list = listConsolidationRuns(getDb());
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    const fetched = getConsolidationRun(getDb(), id)!;
    expect(fetched.payload.plan.totalEntries).toBe(3);
    expect(fetched.dryRun).toBe(true);
  });

  it("returns null for unknown ids", () => {
    expect(getConsolidationRun(getDb(), "no-such")).toBeNull();
  });
});
