import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb, getDb } from "../lib/db.js";
import {
  ensureSpendSchema,
  recordSpend,
  getSpendStatus,
  pruneSpendLog,
} from "../lib/spend-cap.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-spend-"));
  initDb(path.join(tmpDir, "spend.db"));
  ensureSpendSchema(getDb());
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("spend-cap", () => {
  it("starts unblocked with empty spend log", () => {
    const status = getSpendStatus(getDb(), { dailyUsd: 5 });
    expect(status.blocked).toBe(false);
    expect(status.todayUsd).toBe(0);
    expect(status.remainingDailyUsd).toBe(5);
  });

  it("accumulates spend across multiple records", () => {
    const db = getDb();
    recordSpend(db, { costUsd: 0.5, totalTokens: 100, model: "gpt-4o" });
    recordSpend(db, { costUsd: 1.25, totalTokens: 250 });
    const status = getSpendStatus(db, { dailyUsd: 5 });
    expect(status.todayUsd).toBeCloseTo(1.75);
    expect(status.remainingDailyUsd).toBeCloseTo(3.25);
  });

  it("blocks when daily cap is reached", () => {
    const db = getDb();
    recordSpend(db, { costUsd: 5.0 });
    const status = getSpendStatus(db, { dailyUsd: 5 });
    expect(status.blocked).toBe(true);
    expect(status.reason).toContain("Daily");
  });

  it("ignores zero or negative costs", () => {
    const db = getDb();
    recordSpend(db, { costUsd: 0 });
    recordSpend(db, { costUsd: -1 });
    expect(getSpendStatus(db, { dailyUsd: 1 }).todayUsd).toBe(0);
  });

  it("blocks on monthly cap when set and reached", () => {
    const db = getDb();
    recordSpend(db, { costUsd: 30 });
    const status = getSpendStatus(db, { dailyUsd: 100, monthlyUsd: 25 });
    expect(status.blocked).toBe(true);
    expect(status.reason).toContain("Monthly");
  });

  it("does not block when monthly cap is unset", () => {
    const db = getDb();
    recordSpend(db, { costUsd: 1 });
    expect(getSpendStatus(db, { dailyUsd: 5 }).blocked).toBe(false);
  });

  it("prune removes records older than the retention window", () => {
    const db = getDb();
    const oldDay = new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO spend_log (timestamp, day, month, cost_usd) VALUES (?, ?, ?, ?)`,
    ).run(`${oldDay}T00:00:00Z`, oldDay, oldDay.slice(0, 7), 1.0);
    expect(pruneSpendLog(db, 90)).toBe(1);
  });
});
