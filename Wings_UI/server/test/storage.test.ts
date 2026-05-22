import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { writeJsonSync, writeJsonQueued, readJsonSafe, flushWriteQueue } from "../lib/storage.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-storage-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("storage", () => {
  it("writes and reads a JSON file atomically", () => {
    const file = path.join(tmpDir, "data.json");
    writeJsonSync(file, { hello: "world", count: 42 });
    const parsed = readJsonSafe<{ hello: string; count: number }>(file, { hello: "", count: 0 });
    expect(parsed).toEqual({ hello: "world", count: 42 });
  });

  it("returns fallback when file does not exist", () => {
    const file = path.join(tmpDir, "missing.json");
    const result = readJsonSafe<string[]>(file, []);
    expect(result).toEqual([]);
  });

  it("returns fallback when file has invalid JSON", () => {
    const file = path.join(tmpDir, "bad.json");
    fs.writeFileSync(file, "not json {");
    const result = readJsonSafe<{ ok: boolean }>(file, { ok: true });
    expect(result).toEqual({ ok: true });
  });

  it("does not leave temporary files on success", () => {
    const file = path.join(tmpDir, "data.json");
    writeJsonSync(file, { v: 1 });
    const leftovers = fs.readdirSync(tmpDir).filter((name) => name.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("serializes concurrent queued writes — last write wins without corruption", async () => {
    const file = path.join(tmpDir, "queued.json");
    const writes = Array.from({ length: 20 }, (_, i) =>
      writeJsonQueued(file, { seq: i, items: new Array(i + 1).fill(i) }),
    );
    await Promise.all(writes);
    await flushWriteQueue(file);

    const final = readJsonSafe<{ seq: number; items: number[] }>(file, { seq: -1, items: [] });
    expect(final.seq).toBe(19);
    expect(final.items).toHaveLength(20);
  });

  it("concurrent writes never produce invalid JSON at rest", async () => {
    const file = path.join(tmpDir, "concurrent.json");
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 50; i++) {
      promises.push(writeJsonQueued(file, { i, payload: "x".repeat(1000) }));
      if (i % 5 === 0) {
        const raw = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "{}";
        expect(() => JSON.parse(raw)).not.toThrow();
      }
    }
    await Promise.all(promises);
    await flushWriteQueue(file);
    const parsed = readJsonSafe<{ i: number }>(file, { i: -1 });
    expect(parsed.i).toBe(49);
  });
});
