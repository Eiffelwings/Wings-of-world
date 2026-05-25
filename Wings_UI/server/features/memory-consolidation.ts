// Memory consolidation ("sleep cycle").
//
// Runs over a flat list of memory entries, clusters them by embedding
// similarity, asks an LLM to merge each cluster into a single canonical
// memory, and optionally drops entries that have never been retrieved and
// have aged past a configurable threshold.
//
// The result: a much smaller working set that still preserves the original
// information — which directly shrinks the token footprint of the memory
// block we inject into chat context. Inspired by Letta / MemGPT "sleep".

import crypto from "crypto";
import type Database from "better-sqlite3";
import { cosineSimilarity } from "./vector-memory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsolidatableEntry {
  id: string;
  content: string;
  importanceScore?: number;
  retrievalCount?: number;
  updatedAt?: string;
  createdAt?: string;
  /** Optional pre-computed embedding. When absent, we'll request one. */
  embedding?: number[];
}

export interface ConsolidationDeps {
  /** Compute an embedding for a string. Called once per memory missing one. */
  embed: (text: string) => Promise<number[]>;
  /** Run the LLM merge prompt against a cluster's contents. */
  mergeCluster: (members: string[]) => Promise<string>;
}

export interface ConsolidationOptions {
  similarityThreshold?: number;   // default 0.85
  minClusterSize?: number;         // default 3
  dropAfterDays?: number;          // default 30 — drop unused below importance
  dropImportanceBelow?: number;    // default 0.3
  /** When true, plan only — no merges, no drops. */
  dryRun?: boolean;
}

export interface ClusterPlan {
  clusterId: string;
  memberIds: string[];
  representativeId: string;
  averageSimilarity: number;
}

export interface ConsolidationPlan {
  clusters: ClusterPlan[];
  drops: Array<{ id: string; reason: string }>;
  totalEntries: number;
  reducedEntries: number;
  estimatedSavingChars: number;
}

export interface ConsolidationOutcome {
  plan: ConsolidationPlan;
  merged: Array<{ clusterId: string; mergedContent: string; replacedIds: string[] }>;
  drops: string[];
  resultEntries: ConsolidatableEntry[];
  dryRun: boolean;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Audit table — lets the user inspect or roll back a consolidation run.
// ---------------------------------------------------------------------------

export function ensureConsolidationSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_consolidation_runs (
      id              TEXT PRIMARY KEY,
      created_at      TEXT NOT NULL,
      dry_run         INTEGER NOT NULL,
      total_before    INTEGER NOT NULL,
      total_after     INTEGER NOT NULL,
      clusters_merged INTEGER NOT NULL,
      entries_dropped INTEGER NOT NULL,
      duration_ms     INTEGER NOT NULL,
      payload         TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_consol_runs_created ON memory_consolidation_runs (created_at DESC);
  `);
}

export interface ConsolidationRunRow {
  id: string;
  createdAt: string;
  dryRun: boolean;
  totalBefore: number;
  totalAfter: number;
  clustersMerged: number;
  entriesDropped: number;
  durationMs: number;
  payload: ConsolidationOutcome;
}

export function persistConsolidationRun(db: Database.Database, outcome: ConsolidationOutcome): string {
  const id = `consol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    `INSERT INTO memory_consolidation_runs
       (id, created_at, dry_run, total_before, total_after, clusters_merged, entries_dropped, duration_ms, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    new Date().toISOString(),
    outcome.dryRun ? 1 : 0,
    outcome.plan.totalEntries,
    outcome.plan.reducedEntries,
    outcome.merged.length,
    outcome.drops.length,
    outcome.durationMs,
    JSON.stringify(outcome),
  );
  return id;
}

export function listConsolidationRuns(db: Database.Database, limit = 30): ConsolidationRunRow[] {
  const rows = db.prepare(
    `SELECT * FROM memory_consolidation_runs ORDER BY created_at DESC LIMIT ?`,
  ).all(limit) as Array<{
    id: string;
    created_at: string;
    dry_run: number;
    total_before: number;
    total_after: number;
    clusters_merged: number;
    entries_dropped: number;
    duration_ms: number;
    payload: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    dryRun: r.dry_run === 1,
    totalBefore: r.total_before,
    totalAfter: r.total_after,
    clustersMerged: r.clusters_merged,
    entriesDropped: r.entries_dropped,
    durationMs: r.duration_ms,
    payload: JSON.parse(r.payload) as ConsolidationOutcome,
  }));
}

export function getConsolidationRun(db: Database.Database, id: string): ConsolidationRunRow | null {
  const row = db.prepare(`SELECT * FROM memory_consolidation_runs WHERE id = ?`).get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    dryRun: row.dry_run === 1,
    totalBefore: row.total_before,
    totalAfter: row.total_after,
    clustersMerged: row.clusters_merged,
    entriesDropped: row.entries_dropped,
    durationMs: row.duration_ms,
    payload: JSON.parse(row.payload),
  };
}

// ---------------------------------------------------------------------------
// Clustering — pure greedy with cosine similarity.
//
// For each unmarked memory, find every neighbour above threshold and form a
// cluster. O(n²) but n is bounded (typically < 5000 memories before we
// consolidate). The representative is the memory with the highest mean
// similarity to its peers — i.e. the one closest to the centroid.
// ---------------------------------------------------------------------------

export function clusterByEmbedding(
  entries: ConsolidatableEntry[],
  threshold: number,
  minClusterSize: number,
): ClusterPlan[] {
  const visited = new Set<string>();
  const clusters: ClusterPlan[] = [];
  for (let i = 0; i < entries.length; i++) {
    const seed = entries[i];
    if (visited.has(seed.id) || !seed.embedding) continue;
    const members: Array<{ entry: ConsolidatableEntry; sim: number }> = [{ entry: seed, sim: 1 }];
    visited.add(seed.id);
    for (let j = i + 1; j < entries.length; j++) {
      const other = entries[j];
      if (visited.has(other.id) || !other.embedding) continue;
      const sim = cosineSimilarity(seed.embedding, other.embedding);
      if (sim >= threshold) {
        members.push({ entry: other, sim });
        visited.add(other.id);
      }
    }
    if (members.length >= minClusterSize) {
      // Pick the member with the highest mean similarity to its peers.
      const peerScore = members.map((m) => {
        const others = members.filter((p) => p.entry.id !== m.entry.id);
        const avg = others.length === 0 ? 1 : others.reduce((s, o) => s + cosineSimilarity(m.entry.embedding!, o.entry.embedding!), 0) / others.length;
        return { id: m.entry.id, score: avg };
      });
      peerScore.sort((a, b) => b.score - a.score);
      const representativeId = peerScore[0].id;
      const averageSimilarity =
        members.reduce((sum, m) => sum + m.sim, 0) / members.length;
      clusters.push({
        clusterId: `cluster_${crypto.randomBytes(4).toString("hex")}`,
        memberIds: members.map((m) => m.entry.id),
        representativeId,
        averageSimilarity: Number(averageSimilarity.toFixed(3)),
      });
    } else {
      // Release reservations so the lone members remain available for other
      // clusters. (In the current pass they stay unmatched — fine.)
      for (const m of members) visited.delete(m.entry.id);
      visited.add(seed.id); // but keep the seed marked so we don't loop on it
    }
  }
  return clusters;
}

// ---------------------------------------------------------------------------
// Drop policy — entries that have never been retrieved AND are old AND
// have low importance. All three conditions must hold.
// ---------------------------------------------------------------------------

export function pickDrops(
  entries: ConsolidatableEntry[],
  options: { dropAfterDays: number; dropImportanceBelow: number; clustered: Set<string> },
): Array<{ id: string; reason: string }> {
  const cutoff = Date.now() - options.dropAfterDays * 86_400_000;
  const drops: Array<{ id: string; reason: string }> = [];
  for (const entry of entries) {
    if (options.clustered.has(entry.id)) continue; // will be merged, not dropped
    if ((entry.retrievalCount ?? 0) > 0) continue;
    if ((entry.importanceScore ?? 1) >= options.dropImportanceBelow) continue;
    const updated = entry.updatedAt ? new Date(entry.updatedAt).getTime() : 0;
    const created = entry.createdAt ? new Date(entry.createdAt).getTime() : 0;
    const youngestStamp = Math.max(updated, created);
    if (youngestStamp >= cutoff) continue;
    drops.push({
      id: entry.id,
      reason: `unused & low-importance & older than ${options.dropAfterDays}d`,
    });
  }
  return drops;
}

// ---------------------------------------------------------------------------
// Plan builder — combines clustering + drop picking and computes savings.
// ---------------------------------------------------------------------------

export function buildPlan(
  entries: ConsolidatableEntry[],
  options: Required<Pick<ConsolidationOptions, "similarityThreshold" | "minClusterSize" | "dropAfterDays" | "dropImportanceBelow">>,
): ConsolidationPlan {
  const clusters = clusterByEmbedding(entries, options.similarityThreshold, options.minClusterSize);
  const clustered = new Set<string>();
  for (const c of clusters) for (const id of c.memberIds) clustered.add(id);
  const drops = pickDrops(entries, {
    dropAfterDays: options.dropAfterDays,
    dropImportanceBelow: options.dropImportanceBelow,
    clustered,
  });
  // Estimated saving: each cluster of N collapses to ~1, dropping (N-1) × avg
  // member length chars. Plus the chars from dropped entries.
  let estimatedSavingChars = 0;
  for (const c of clusters) {
    const members = entries.filter((e) => c.memberIds.includes(e.id));
    const avg = members.reduce((s, m) => s + m.content.length, 0) / Math.max(1, members.length);
    estimatedSavingChars += Math.round((c.memberIds.length - 1) * avg);
  }
  for (const d of drops) {
    const entry = entries.find((e) => e.id === d.id);
    if (entry) estimatedSavingChars += entry.content.length;
  }
  return {
    clusters,
    drops,
    totalEntries: entries.length,
    reducedEntries: entries.length - drops.length - clusters.reduce((s, c) => s + c.memberIds.length - 1, 0),
    estimatedSavingChars,
  };
}

// ---------------------------------------------------------------------------
// LLM merge prompt — the prompt template is intentionally factual: preserve
// names, numbers, dates, and any specifics. This is what stops consolidation
// from silently destroying detail.
// ---------------------------------------------------------------------------

export function buildMergePrompt(members: string[]): string {
  return [
    "You are merging duplicate memory entries about the same topic into a single canonical memory.",
    "",
    "RULES:",
    "1. Preserve every concrete fact: names, numbers, dates, IDs, URLs, code snippets.",
    "2. Resolve obvious contradictions in favour of the most specific or most recent entry.",
    "3. Output a single self-contained paragraph — no bullet points, no preamble, no postscript.",
    "4. Keep it under 600 characters.",
    "",
    "Entries to merge:",
    ...members.map((m, i) => `${i + 1}. ${m}`),
    "",
    "Canonical merged memory:",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

const DEFAULTS: Required<Pick<ConsolidationOptions, "similarityThreshold" | "minClusterSize" | "dropAfterDays" | "dropImportanceBelow">> = {
  similarityThreshold: 0.85,
  minClusterSize: 3,
  dropAfterDays: 30,
  dropImportanceBelow: 0.3,
};

export async function consolidateMemories(
  entries: ConsolidatableEntry[],
  options: ConsolidationOptions,
  deps: ConsolidationDeps,
): Promise<ConsolidationOutcome> {
  const start = Date.now();
  const opts = {
    similarityThreshold: options.similarityThreshold ?? DEFAULTS.similarityThreshold,
    minClusterSize: options.minClusterSize ?? DEFAULTS.minClusterSize,
    dropAfterDays: options.dropAfterDays ?? DEFAULTS.dropAfterDays,
    dropImportanceBelow: options.dropImportanceBelow ?? DEFAULTS.dropImportanceBelow,
  };

  // Step 1: ensure every entry has an embedding.
  const enriched: ConsolidatableEntry[] = [];
  for (const entry of entries) {
    if (entry.embedding && entry.embedding.length > 0) {
      enriched.push(entry);
    } else {
      const embedding = await deps.embed(entry.content);
      enriched.push({ ...entry, embedding });
    }
  }

  // Step 2: build the plan.
  const plan = buildPlan(enriched, opts);

  // Step 3: dry-run short-circuit.
  if (options.dryRun) {
    return {
      plan,
      merged: [],
      drops: [],
      resultEntries: enriched,
      dryRun: true,
      durationMs: Date.now() - start,
    };
  }

  // Step 4: execute the plan — merge each cluster, drop the picked entries.
  const dropSet = new Set(plan.drops.map((d) => d.id));
  const merged: ConsolidationOutcome["merged"] = [];
  const replacements = new Map<string, ConsolidatableEntry>();

  for (const cluster of plan.clusters) {
    const members = enriched.filter((e) => cluster.memberIds.includes(e.id));
    const mergedText = await deps.mergeCluster(members.map((m) => m.content));
    const representative = members.find((m) => m.id === cluster.representativeId) || members[0];
    // The merged entry keeps the representative's id so external references
    // stay valid for at least one of the originals. Importance is the max of
    // the cluster — the best part of the cluster wins.
    const next: ConsolidatableEntry = {
      id: representative.id,
      content: mergedText,
      importanceScore: Math.max(...members.map((m) => m.importanceScore ?? 0.5)),
      retrievalCount: members.reduce((sum, m) => sum + (m.retrievalCount ?? 0), 0),
      updatedAt: new Date().toISOString(),
      createdAt: representative.createdAt,
    };
    replacements.set(representative.id, next);
    merged.push({
      clusterId: cluster.clusterId,
      mergedContent: mergedText,
      replacedIds: cluster.memberIds.filter((id) => id !== representative.id),
    });
  }

  // Build the final list: drop dropSet entries, replace cluster members
  // with the representative's merged version, leave everything else.
  const allClusteredButRep = new Set<string>();
  for (const m of merged) for (const id of m.replacedIds) allClusteredButRep.add(id);

  const resultEntries: ConsolidatableEntry[] = [];
  for (const entry of enriched) {
    if (dropSet.has(entry.id)) continue;
    if (allClusteredButRep.has(entry.id)) continue;
    if (replacements.has(entry.id)) {
      resultEntries.push(replacements.get(entry.id)!);
    } else {
      resultEntries.push(entry);
    }
  }

  return {
    plan,
    merged,
    drops: plan.drops.map((d) => d.id),
    resultEntries,
    dryRun: false,
    durationMs: Date.now() - start,
  };
}
