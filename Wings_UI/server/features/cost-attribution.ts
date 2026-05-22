// Cost attribution. Builds breakdowns over the existing spend_log table so
// you can see where the money is going — by day, model, kind, or feature.
// All read-only views; the spend recorder lives in lib/spend-cap.ts.

import type Database from "better-sqlite3";

export interface CostBreakdown {
  bucket: string;
  totalUsd: number;
  totalTokens: number;
  calls: number;
}

export interface OverviewWindow {
  windowStart: string;
  windowEnd: string;
  totalUsd: number;
  totalTokens: number;
  totalCalls: number;
  byModel: CostBreakdown[];
  byKind: CostBreakdown[];
  byDay: CostBreakdown[];
  topModelToday: { model: string; usd: number } | null;
}

function spendBucketed(db: Database.Database, column: "model" | "kind" | "day", since: string): CostBreakdown[] {
  const rows = db.prepare(
    `SELECT COALESCE(${column}, 'unknown') AS bucket,
            COALESCE(SUM(cost_usd), 0)     AS total_usd,
            COALESCE(SUM(tokens_total), 0) AS total_tokens,
            COUNT(*)                       AS calls
     FROM spend_log
     WHERE timestamp >= ?
     GROUP BY ${column}
     ORDER BY total_usd DESC`,
  ).all(since) as Array<{ bucket: string; total_usd: number; total_tokens: number; calls: number }>;
  return rows.map((r) => ({
    bucket: r.bucket,
    totalUsd: Number(r.total_usd.toFixed(6)),
    totalTokens: r.total_tokens,
    calls: r.calls,
  }));
}

export function buildOverview(db: Database.Database, windowDays = 7): OverviewWindow {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowDays * 86_400_000);
  const since = windowStart.toISOString();

  const totals = db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) AS total_usd,
            COALESCE(SUM(tokens_total), 0) AS total_tokens,
            COUNT(*) AS calls
     FROM spend_log
     WHERE timestamp >= ?`,
  ).get(since) as { total_usd: number; total_tokens: number; calls: number };

  const byModel = spendBucketed(db, "model", since);
  const byKind = spendBucketed(db, "kind", since);
  const byDay = spendBucketed(db, "day", since);

  const today = new Date().toISOString().slice(0, 10);
  const todayTop = db.prepare(
    `SELECT COALESCE(model, 'unknown') AS model, COALESCE(SUM(cost_usd), 0) AS usd
     FROM spend_log
     WHERE day = ?
     GROUP BY model
     ORDER BY usd DESC
     LIMIT 1`,
  ).get(today) as { model: string; usd: number } | undefined;

  return {
    windowStart: since,
    windowEnd: windowEnd.toISOString(),
    totalUsd: Number(totals.total_usd.toFixed(6)),
    totalTokens: totals.total_tokens,
    totalCalls: totals.calls,
    byModel,
    byKind,
    byDay: byDay.sort((a, b) => a.bucket.localeCompare(b.bucket)),
    topModelToday: todayTop && todayTop.usd > 0
      ? { model: todayTop.model, usd: Number(todayTop.usd.toFixed(6)) }
      : null,
  };
}

export interface SpendForecast {
  dailyAvgUsd: number;
  projectedMonthlyUsd: number;
  daysOfDataUsed: number;
}

export function forecastSpend(db: Database.Database, lookbackDays = 7): SpendForecast {
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
  const row = db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) AS total_usd,
            COUNT(DISTINCT day) AS days
     FROM spend_log
     WHERE timestamp >= ?`,
  ).get(since) as { total_usd: number; days: number };
  const days = Math.max(1, row.days);
  const dailyAvgUsd = row.total_usd / days;
  return {
    dailyAvgUsd: Number(dailyAvgUsd.toFixed(6)),
    projectedMonthlyUsd: Number((dailyAvgUsd * 30).toFixed(6)),
    daysOfDataUsed: row.days,
  };
}
