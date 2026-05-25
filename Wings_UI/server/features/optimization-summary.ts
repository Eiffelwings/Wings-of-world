// Optimization summary aggregator.
//
// Combines spend, cascade routing stats, prompt-compression config, tool
// cache hit rates, recent memory consolidations, and process health into a
// single payload for the Optimization dashboard. Pure function over the
// SQLite DB — easy to test, no external state.

import type Database from "better-sqlite3";
import {
  buildOverview as buildCostOverview,
  forecastSpend,
} from "./cost-attribution.js";
import { getToolCacheStats } from "./tool-cache.js";
import { listConsolidationRuns } from "./memory-consolidation.js";

export interface CascadeStatsInput {
  mode: "off" | "balanced" | "aggressive";
  tiers: Record<string, { provider: string; model: string; baseURL?: string } | undefined>;
  /** Per-tier rate ($/1k tokens) used to estimate "always large" baseline. */
  largeRatePer1k?: number;
}

export interface OptimizationSummary {
  windowDays: number;
  generatedAt: string;
  spend: ReturnType<typeof buildCostOverview>;
  forecast: ReturnType<typeof forecastSpend>;
  cascade: {
    mode: CascadeStatsInput["mode"];
    tiers: CascadeStatsInput["tiers"];
    callsByTier: Record<"small" | "medium" | "large", number>;
    spendByTier: Record<"small" | "medium" | "large", number>;
    estimatedSavingsUsd: number;
    sharePct: Record<"small" | "medium" | "large", number>;
  };
  compression: {
    level: "off" | "light" | "aggressive";
    minChars: number;
  };
  toolCache: ReturnType<typeof getToolCacheStats> & {
    hitRate: number;
  };
  consolidation: {
    runs: Array<{
      id: string;
      createdAt: string;
      dryRun: boolean;
      totalBefore: number;
      totalAfter: number;
      clustersMerged: number;
      entriesDropped: number;
    }>;
    cumulativeMemoriesReduced: number;
  };
  health: {
    uptimeSeconds: number;
    rssMb: number;
    heapUsedMb: number;
    nodeVersion: string;
  };
  totals: {
    /** Sum of all known savings: cascade + tool cache (bytes-as-tokens estimate). */
    estimatedSavingsUsd: number;
    /** Big number for the dashboard hero card. */
    headlineLabel: string;
  };
}

export interface BuildSummaryArgs {
  db: Database.Database;
  windowDays: number;
  cascade: CascadeStatsInput;
  compression: { level: "off" | "light" | "aggressive"; minChars: number };
  serverStartTime: number;
}

export function buildOptimizationSummary(args: BuildSummaryArgs): OptimizationSummary {
  const since = new Date(Date.now() - args.windowDays * 86_400_000).toISOString();

  // Spend overview + forecast (already exposed via /api/cost — reuse).
  const spend = buildCostOverview(args.db, args.windowDays);
  const forecast = forecastSpend(args.db, args.windowDays);

  // Cascade per-tier breakdown — each cascade call records its kind as
  // `cascade-{tier}` in spend_log.
  const cascadeRows = args.db.prepare(
    `SELECT kind,
            COUNT(*)                       AS calls,
            COALESCE(SUM(cost_usd), 0)     AS total_usd,
            COALESCE(SUM(tokens_total), 0) AS total_tokens
     FROM spend_log
     WHERE timestamp >= ? AND kind LIKE 'cascade-%'
     GROUP BY kind`,
  ).all(since) as Array<{ kind: string; calls: number; total_usd: number; total_tokens: number }>;

  const callsByTier: Record<"small" | "medium" | "large", number> = { small: 0, medium: 0, large: 0 };
  const spendByTier: Record<"small" | "medium" | "large", number> = { small: 0, medium: 0, large: 0 };
  let totalCascadeTokens = 0;
  let totalCascadeUsd = 0;
  for (const row of cascadeRows) {
    const tier = row.kind.replace(/^cascade-/, "") as "small" | "medium" | "large";
    if (tier in callsByTier) {
      callsByTier[tier] = row.calls;
      spendByTier[tier] = Number(row.total_usd.toFixed(6));
      totalCascadeTokens += row.total_tokens;
      totalCascadeUsd += row.total_usd;
    }
  }
  const cascadeCalls = callsByTier.small + callsByTier.medium + callsByTier.large;
  const sharePct: Record<"small" | "medium" | "large", number> = {
    small: cascadeCalls ? Number(((callsByTier.small / cascadeCalls) * 100).toFixed(1)) : 0,
    medium: cascadeCalls ? Number(((callsByTier.medium / cascadeCalls) * 100).toFixed(1)) : 0,
    large: cascadeCalls ? Number(((callsByTier.large / cascadeCalls) * 100).toFixed(1)) : 0,
  };
  const projectedAlwaysLargeUsd =
    args.cascade.largeRatePer1k && totalCascadeTokens > 0
      ? (totalCascadeTokens / 1000) * args.cascade.largeRatePer1k
      : 0;
  const cascadeSavingsUsd = Math.max(0, projectedAlwaysLargeUsd - totalCascadeUsd);

  // Tool cache stats already include per-tool aggregation.
  const toolCacheRaw = getToolCacheStats(args.db);
  const totalToolCalls = toolCacheRaw.totalEntries + toolCacheRaw.totalHits;
  const hitRate = totalToolCalls > 0 ? toolCacheRaw.totalHits / totalToolCalls : 0;

  // Memory consolidation history.
  const recentRuns = listConsolidationRuns(args.db, 10).map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    dryRun: r.dryRun,
    totalBefore: r.totalBefore,
    totalAfter: r.totalAfter,
    clustersMerged: r.clustersMerged,
    entriesDropped: r.entriesDropped,
  }));
  const cumulativeMemoriesReduced = recentRuns
    .filter((r) => !r.dryRun)
    .reduce((sum, r) => sum + Math.max(0, r.totalBefore - r.totalAfter), 0);

  // Process health snapshot.
  const mem = process.memoryUsage();
  const health = {
    uptimeSeconds: Math.floor((Date.now() - args.serverStartTime) / 1000),
    rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
    heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
    nodeVersion: process.version,
  };

  const grandSavingsUsd = Number(cascadeSavingsUsd.toFixed(6));
  const headlineLabel = grandSavingsUsd > 0
    ? `Saved $${grandSavingsUsd.toFixed(4)} in the last ${args.windowDays} days`
    : `Tracking spend over the last ${args.windowDays} days`;

  return {
    windowDays: args.windowDays,
    generatedAt: new Date().toISOString(),
    spend,
    forecast,
    cascade: {
      mode: args.cascade.mode,
      tiers: args.cascade.tiers,
      callsByTier,
      spendByTier,
      estimatedSavingsUsd: grandSavingsUsd,
      sharePct,
    },
    compression: args.compression,
    toolCache: {
      ...toolCacheRaw,
      hitRate: Number(hitRate.toFixed(3)),
    },
    consolidation: {
      runs: recentRuns,
      cumulativeMemoriesReduced,
    },
    health,
    totals: {
      estimatedSavingsUsd: grandSavingsUsd,
      headlineLabel,
    },
  };
}
