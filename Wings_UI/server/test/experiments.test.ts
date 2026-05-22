import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb, getDb } from "../lib/db.js";
import {
  ensureExperimentSchema,
  createExperiment,
  pickArm,
  recordObservation,
  getExperimentStats,
  listExperiments,
  setExperimentStatus,
  type Experiment,
} from "../features/experiments.js";
import { ensureSpendSchema } from "../lib/spend-cap.js";
import { buildOverview, forecastSpend } from "../features/cost-attribution.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-exp-"));
  initDb(path.join(tmpDir, "exp.db"));
  ensureExperimentSchema(getDb());
  ensureSpendSchema(getDb());
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("experiments", () => {
  it("rejects an experiment with fewer than two arms", () => {
    expect(() =>
      createExperiment(getDb(), {
        name: "bad",
        arms: [{ name: "a", model: "x", weight: 100 }],
      }),
    ).toThrow();
  });

  it("rejects an experiment with all weights at zero", () => {
    expect(() =>
      createExperiment(getDb(), {
        name: "bad",
        arms: [
          { name: "a", model: "x", weight: 0 },
          { name: "b", model: "y", weight: 0 },
        ],
      }),
    ).toThrow();
  });

  it("creates and lists an experiment", () => {
    const exp = createExperiment(getDb(), {
      name: "model-test",
      arms: [
        { name: "control", model: "gpt-4o", weight: 50 },
        { name: "treatment", model: "claude-sonnet-4-6", weight: 50 },
      ],
    });
    const all = listExperiments(getDb());
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(exp.id);
  });

  it("pickArm is deterministic for the same key", () => {
    const exp: Experiment = createExperiment(getDb(), {
      name: "x",
      arms: [
        { name: "a", model: "m1", weight: 50 },
        { name: "b", model: "m2", weight: 50 },
      ],
    });
    const first = pickArm(exp, "user-42");
    const second = pickArm(exp, "user-42");
    expect(first.name).toBe(second.name);
  });

  it("pickArm spreads traffic across arms over many keys", () => {
    const exp = createExperiment(getDb(), {
      name: "x",
      arms: [
        { name: "a", model: "m1", weight: 50 },
        { name: "b", model: "m2", weight: 50 },
      ],
    });
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 1000; i++) {
      counts[pickArm(exp, `key-${i}`).name as "a" | "b"]++;
    }
    // Each arm should land in roughly the 30-70% range with 1000 samples.
    expect(counts.a).toBeGreaterThan(300);
    expect(counts.a).toBeLessThan(700);
  });

  it("aggregates observations into stats", () => {
    const exp = createExperiment(getDb(), {
      name: "x",
      arms: [
        { name: "a", model: "m1", weight: 50 },
        { name: "b", model: "m2", weight: 50 },
      ],
    });
    recordObservation(getDb(), { experimentId: exp.id, arm: "a", costUsd: 0.001, durationMs: 200, tokensTotal: 100 });
    recordObservation(getDb(), { experimentId: exp.id, arm: "a", costUsd: 0.003, durationMs: 400, tokensTotal: 200 });
    recordObservation(getDb(), { experimentId: exp.id, arm: "b", costUsd: 0.0005, durationMs: 100, tokensTotal: 50, success: false });

    const stats = getExperimentStats(getDb(), exp.id);
    const a = stats.find((s) => s.arm === "a")!;
    const b = stats.find((s) => s.arm === "b")!;
    expect(a.observations).toBe(2);
    expect(a.successRate).toBe(1);
    expect(a.totalCostUsd).toBeCloseTo(0.004);
    expect(b.successRate).toBe(0);
  });

  it("setExperimentStatus updates the row", () => {
    const exp = createExperiment(getDb(), {
      name: "x",
      arms: [
        { name: "a", model: "m1", weight: 50 },
        { name: "b", model: "m2", weight: 50 },
      ],
    });
    setExperimentStatus(getDb(), exp.id, "running");
    expect(listExperiments(getDb())[0].status).toBe("running");
  });
});

describe("cost-attribution", () => {
  it("builds an overview from spend_log", () => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO spend_log (timestamp, day, month, cost_usd, tokens_total, model, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(new Date().toISOString(), today, today.slice(0, 7), 0.5, 1000, "gpt-4o", "chat");
    db.prepare(
      `INSERT INTO spend_log (timestamp, day, month, cost_usd, tokens_total, model, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(new Date().toISOString(), today, today.slice(0, 7), 0.25, 500, "claude-sonnet-4-6", "chat");

    const o = buildOverview(db, 7);
    expect(o.totalUsd).toBeCloseTo(0.75);
    expect(o.byModel.find((m) => m.bucket === "gpt-4o")?.totalUsd).toBeCloseTo(0.5);
    expect(o.topModelToday?.model).toBe("gpt-4o");
  });

  it("forecasts based on average daily spend", () => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO spend_log (timestamp, day, month, cost_usd) VALUES (?, ?, ?, ?)`,
    ).run(new Date().toISOString(), today, today.slice(0, 7), 1.0);
    const f = forecastSpend(db, 7);
    expect(f.dailyAvgUsd).toBeGreaterThan(0);
    expect(f.projectedMonthlyUsd).toBeCloseTo(f.dailyAvgUsd * 30);
  });
});
