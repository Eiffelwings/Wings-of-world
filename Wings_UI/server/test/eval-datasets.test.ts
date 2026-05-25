import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb, getDb } from "../lib/db.js";
import {
  ensureDatasetSchema,
  createDataset,
  listDatasets,
  addDatasetItem,
  listDatasetItems,
  deleteDataset,
  passRate,
} from "../features/eval-datasets.js";
import { runReplay } from "../features/replay-engine.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-ds-"));
  initDb(path.join(tmpDir, "ds.db"));
  ensureDatasetSchema(getDb());
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("eval-datasets", () => {
  it("creates and lists datasets with item counts", () => {
    const ds = createDataset(getDb(), { name: "qa-suite" });
    addDatasetItem(getDb(), ds.id, { input: "What is 2+2?", expectedOutput: "4" });
    addDatasetItem(getDb(), ds.id, { input: "Capital of France?", expectedOutput: "Paris" });
    const all = listDatasets(getDb());
    expect(all).toHaveLength(1);
    expect(all[0].itemCount).toBe(2);
  });

  it("cascades deletion of items when dataset is removed", () => {
    const ds = createDataset(getDb(), { name: "tmp" });
    addDatasetItem(getDb(), ds.id, { input: "x" });
    expect(listDatasetItems(getDb(), ds.id)).toHaveLength(1);
    deleteDataset(getDb(), ds.id);
    expect(listDatasetItems(getDb(), ds.id)).toHaveLength(0);
  });

  it("passRate handles empty runs", () => {
    expect(passRate({ id: "x", datasetId: "y", model: "m", evalIds: [], startedAt: "", passCount: 0, failCount: 0, errorCount: 0, itemCount: 0, status: "complete" }))
      .toBe(0);
  });
});

describe("replay-engine", () => {
  it("runs each item through the generator and tallies results", async () => {
    const ds = createDataset(getDb(), { name: "fake" });
    addDatasetItem(getDb(), ds.id, { input: "ok-1" });
    addDatasetItem(getDb(), ds.id, { input: "ok-2" });
    addDatasetItem(getDb(), ds.id, { input: "fail-1" });

    const generate = async ({ input }: any) => ({
      output: `echo:${input}`,
      durationMs: 1,
    });
    // Judge: marks anything containing "fail" as Failed.
    const judge = async (prompt: string) => ({
      content: prompt.includes("fail") ? "Verdict: Failed" : "Verdict: Passed",
      durationMs: 1,
    });

    const run = await runReplay(
      getDb(),
      { datasetId: ds.id, model: "test", evalIds: ["toxicity"], concurrency: 1 },
      { generate, judge },
    );

    expect(run.itemCount).toBe(3);
    expect(run.passCount).toBe(2);
    expect(run.failCount).toBe(1);
    expect(run.errorCount).toBe(0);
    expect(passRate(run)).toBeCloseTo(2 / 3);
  });

  it("counts generation failures as run errors", async () => {
    const ds = createDataset(getDb(), { name: "broken" });
    addDatasetItem(getDb(), ds.id, { input: "x" });
    const generate = async () => { throw new Error("provider down"); };
    const judge = async () => ({ content: "Verdict: Passed", durationMs: 1 });
    const run = await runReplay(
      getDb(),
      { datasetId: ds.id, model: "test", evalIds: ["toxicity"], concurrency: 1 },
      { generate, judge },
    );
    expect(run.errorCount).toBe(1);
  });
});
