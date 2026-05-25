import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb, getDb } from "../lib/db.js";
import { ensureSpendSchema, recordSpend } from "../lib/spend-cap.js";
import { ensureToolCacheSchema, saveToCache, lookupCache, recordHit } from "../features/tool-cache.js";
import {
  ensureConsolidationSchema,
  persistConsolidationRun,
  type ConsolidationOutcome,
} from "../features/memory-consolidation.js";
import { buildOptimizationSummary } from "../features/optimization-summary.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-optsum-"));
  initDb(path.join(tmpDir, "opt.db"));
  ensureSpendSchema(getDb());
  ensureToolCacheSchema(getDb());
  ensureConsolidationSchema(getDb());
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const baseArgs = (overrides: Partial<Parameters<typeof buildOptimizationSummary>[0]> = {}) => ({
  db: getDb(),
  windowDays: 7,
  cascade: {
    mode: "balanced" as const,
    tiers: {
      small: { provider: "custom", model: "gemma-free" },
      medium: { provider: "custom", model: "sonnet" },
      large: { provider: "anthropic", model: "claude-opus-4" },
    },
    largeRatePer1k: 0.04,
  },
  compression: { level: "light" as const, minChars: 600 },
  serverStartTime: Date.now() - 60_000,
  ...overrides,
});

describe("buildOptimizationSummary · empty state", () => {
  it("returns zero-valued summary when nothing is recorded yet", () => {
    const r = buildOptimizationSummary(baseArgs());
    expect(r.windowDays).toBe(7);
    expect(r.spend.totalUsd).toBe(0);
    expect(r.cascade.callsByTier.small).toBe(0);
    expect(r.cascade.estimatedSavingsUsd).toBe(0);
    expect(r.toolCache.totalEntries).toBe(0);
    expect(r.consolidation.runs).toEqual([]);
    expect(r.consolidation.cumulativeMemoriesReduced).toBe(0);
    expect(r.totals.headlineLabel).toContain("Tracking spend");
  });

  it("reports current process health", () => {
    const r = buildOptimizationSummary(baseArgs());
    expect(r.health.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(r.health.rssMb).toBeGreaterThan(0);
    expect(r.health.nodeVersion).toMatch(/^v\d/);
  });
});

describe("buildOptimizationSummary · cascade attribution", () => {
  it("aggregates per-tier calls and computes savings vs always-large", () => {
    const db = getDb();
    // Small-tier calls: 10k tokens @ ~$0 (free model)
    recordSpend(db, { costUsd: 0, totalTokens: 5_000, model: "gemma-free", kind: "cascade-small" });
    recordSpend(db, { costUsd: 0, totalTokens: 5_000, model: "gemma-free", kind: "cascade-small" });
    // Medium-tier calls: 4k tokens @ $0.03
    recordSpend(db, { costUsd: 0.03, totalTokens: 4_000, model: "sonnet", kind: "cascade-medium" });
    // Large-tier calls: 1k tokens @ $0.04
    recordSpend(db, { costUsd: 0.04, totalTokens: 1_000, model: "claude-opus-4", kind: "cascade-large" });

    const r = buildOptimizationSummary(baseArgs());
    expect(r.cascade.callsByTier).toEqual({ small: 2, medium: 1, large: 1 });
    expect(r.cascade.spendByTier.small).toBe(0);
    expect(r.cascade.sharePct.small).toBe(50.0);
    // Always-large baseline: 15k tokens × $0.04/1k = $0.60.
    // Actual cost: $0 + $0.03 + $0.04 = $0.07 → savings $0.53.
    expect(r.cascade.estimatedSavingsUsd).toBeCloseTo(0.53, 2);
    expect(r.totals.headlineLabel).toContain("Saved");
  });

  it("returns zero savings when no large rate is supplied", () => {
    recordSpend(getDb(), { costUsd: 0, totalTokens: 5_000, model: "gemma-free", kind: "cascade-small" });
    const r = buildOptimizationSummary({ ...baseArgs(), cascade: { ...baseArgs().cascade, largeRatePer1k: 0 } });
    expect(r.cascade.estimatedSavingsUsd).toBe(0);
  });
});

describe("buildOptimizationSummary · tool cache hit rate", () => {
  it("computes hit rate as hits / (hits + entries)", () => {
    const db = getDb();
    saveToCache(db, "calculator", { e: "1+1" }, 2, { cacheable: true, invalidator: "none" });
    const lookup = lookupCache(db, "calculator", { e: "1+1" }, { cacheable: true, invalidator: "none" });
    if (lookup.rowKey) {
      recordHit(db, lookup.rowKey, lookup.bytes ?? 0);
      recordHit(db, lookup.rowKey, lookup.bytes ?? 0);
      recordHit(db, lookup.rowKey, lookup.bytes ?? 0);
    }
    const r = buildOptimizationSummary(baseArgs());
    expect(r.toolCache.totalEntries).toBe(1);
    expect(r.toolCache.totalHits).toBe(3);
    // 3 hits / (1 entry + 3 hits) = 0.75
    expect(r.toolCache.hitRate).toBe(0.75);
  });
});

describe("buildOptimizationSummary · consolidation cumulative", () => {
  it("sums memories reduced across executed runs only", () => {
    const db = getDb();
    const fakeOutcome = (totalBefore: number, totalAfter: number, dryRun: boolean): ConsolidationOutcome => ({
      plan: { clusters: [], drops: [], totalEntries: totalBefore, reducedEntries: totalAfter, estimatedSavingChars: 0 },
      merged: [],
      drops: [],
      resultEntries: [],
      dryRun,
      durationMs: 1,
    });
    persistConsolidationRun(db, fakeOutcome(10, 6, false)); // -4
    persistConsolidationRun(db, fakeOutcome(6, 4, false));  // -2
    persistConsolidationRun(db, fakeOutcome(4, 2, true));   // dry-run, doesn't count

    const r = buildOptimizationSummary(baseArgs());
    expect(r.consolidation.runs).toHaveLength(3);
    expect(r.consolidation.cumulativeMemoriesReduced).toBe(6);
  });
});

describe("buildOptimizationSummary · compression passthrough", () => {
  it("echoes the configured compression settings", () => {
    const r = buildOptimizationSummary({
      ...baseArgs(),
      compression: { level: "aggressive", minChars: 800 },
    });
    expect(r.compression.level).toBe("aggressive");
    expect(r.compression.minChars).toBe(800);
  });
});

describe("buildOptimizationSummary · windowDays sanity", () => {
  it("respects the configured window", () => {
    const r = buildOptimizationSummary({ ...baseArgs(), windowDays: 30 });
    expect(r.windowDays).toBe(30);
    expect(r.spend.windowStart).toBeDefined();
  });
});
