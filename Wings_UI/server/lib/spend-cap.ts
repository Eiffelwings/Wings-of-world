import type Database from "better-sqlite3";

export interface SpendBudget {
  dailyUsd: number;
  monthlyUsd?: number;
}

export interface SpendStatus {
  todayUsd: number;
  monthUsd: number;
  dailyUsd: number;
  monthlyUsd?: number;
  remainingDailyUsd: number;
  remainingMonthlyUsd?: number;
  blocked: boolean;
  reason?: string;
}

export function ensureSpendSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS spend_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp    TEXT NOT NULL,
      day          TEXT NOT NULL,
      month        TEXT NOT NULL,
      cost_usd     REAL NOT NULL,
      tokens_total INTEGER NOT NULL DEFAULT 0,
      model        TEXT,
      kind         TEXT NOT NULL DEFAULT 'chat'
    );
    CREATE INDEX IF NOT EXISTS idx_spend_day ON spend_log (day);
    CREATE INDEX IF NOT EXISTS idx_spend_month ON spend_log (month);
  `);
}

function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

export function recordSpend(
  db: Database.Database,
  entry: { costUsd: number; totalTokens?: number; model?: string; kind?: string },
): void {
  // Skip negative costs (data error). Zero-cost free-tier calls are still
  // recorded so cascade accounting and call counts stay accurate.
  if (typeof entry.costUsd !== "number" || entry.costUsd < 0) return;
  if (entry.costUsd === 0 && (!entry.totalTokens || entry.totalTokens <= 0)) return;
  const now = new Date();
  db.prepare(
    `INSERT INTO spend_log (timestamp, day, month, cost_usd, tokens_total, model, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    now.toISOString(),
    todayKey(now),
    monthKey(now),
    entry.costUsd,
    entry.totalTokens ?? 0,
    entry.model ?? null,
    entry.kind ?? "chat",
  );
}

export function getSpendStatus(db: Database.Database, budget: SpendBudget): SpendStatus {
  const today = todayKey();
  const month = monthKey();
  const todayUsd =
    (db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS s FROM spend_log WHERE day = ?`).get(today) as { s: number }).s;
  const monthUsd =
    (db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS s FROM spend_log WHERE month = ?`).get(month) as { s: number }).s;

  const remainingDailyUsd = Math.max(0, budget.dailyUsd - todayUsd);
  const remainingMonthlyUsd =
    typeof budget.monthlyUsd === "number"
      ? Math.max(0, budget.monthlyUsd - monthUsd)
      : undefined;

  let blocked = false;
  let reason: string | undefined;
  if (todayUsd >= budget.dailyUsd) {
    blocked = true;
    reason = `Daily spend cap reached ($${todayUsd.toFixed(4)} / $${budget.dailyUsd.toFixed(2)})`;
  } else if (typeof budget.monthlyUsd === "number" && monthUsd >= budget.monthlyUsd) {
    blocked = true;
    reason = `Monthly spend cap reached ($${monthUsd.toFixed(2)} / $${budget.monthlyUsd.toFixed(2)})`;
  }

  return {
    todayUsd,
    monthUsd,
    dailyUsd: budget.dailyUsd,
    monthlyUsd: budget.monthlyUsd,
    remainingDailyUsd,
    remainingMonthlyUsd,
    blocked,
    reason,
  };
}

export function pruneSpendLog(db: Database.Database, retentionDays = 90): number {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString().slice(0, 10);
  const result = db.prepare(`DELETE FROM spend_log WHERE day < ?`).run(cutoff);
  return result.changes;
}
