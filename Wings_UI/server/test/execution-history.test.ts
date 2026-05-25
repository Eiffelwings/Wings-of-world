import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb, getDb } from "../lib/db.js";
import {
  appendExecutionRecord,
  listExecutionRecords,
  migrateExecutionFromJson,
  type ExecutionRecord,
} from "../features/execution-history.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-exec-"));
  initDb(path.join(tmpDir, "test.db"));
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("execution-history", () => {
  it("appends and lists records newest first", () => {
    const db = getDb();
    appendExecutionRecord(db, {
      kind: "chat",
      status: "success",
      title: "first run",
      summary: "ok",
      inputPreview: "hi",
      memoryCount: 0,
    });
    appendExecutionRecord(db, {
      kind: "tool",
      status: "error",
      title: "second run",
      summary: "boom",
      inputPreview: "x",
      memoryCount: 2,
    });
    const list = listExecutionRecords(db);
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe("second run");
    expect(list[0].kind).toBe("tool");
  });

  it("round-trips token usage", () => {
    const db = getDb();
    appendExecutionRecord(db, {
      kind: "chat",
      status: "success",
      title: "t",
      summary: "s",
      inputPreview: "i",
      memoryCount: 0,
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      costEstimateUsd: 0.0042,
    });
    const [record] = listExecutionRecords(db);
    expect(record.tokenUsage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    expect(record.costEstimateUsd).toBeCloseTo(0.0042);
  });

  it("respects retention", () => {
    const db = getDb();
    for (let i = 0; i < 10; i++) {
      appendExecutionRecord(db, {
        kind: "chat",
        status: "success",
        title: `r${i}`,
        summary: "s",
        inputPreview: "i",
        memoryCount: 0,
      }, 3);
    }
    const list = listExecutionRecords(db);
    expect(list).toHaveLength(3);
    expect(list[0].title).toBe("r9");
  });

  it("migrateExecutionFromJson is idempotent", () => {
    const db = getDb();
    const seed: ExecutionRecord[] = [
      {
        id: "run_1",
        createdAt: "2025-01-01T00:00:00Z",
        kind: "chat",
        status: "success",
        title: "seed",
        summary: "ok",
        inputPreview: "hi",
        memoryCount: 0,
      },
    ];
    expect(migrateExecutionFromJson(db, seed)).toBe(1);
    expect(migrateExecutionFromJson(db, seed)).toBe(0);
  });
});
