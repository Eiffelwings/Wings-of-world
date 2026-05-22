import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb, getDb } from "../lib/db.js";
import {
  appendAuditEntry,
  listAuditEntries,
  pruneAuditEntries,
  migrateAuditFromJson,
  type AuditEntry,
} from "../features/audit-log.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-audit-"));
  initDb(path.join(tmpDir, "test.db"));
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("audit-log", () => {
  it("appends and lists entries newest first", () => {
    const db = getDb();
    appendAuditEntry(db, { area: "system", action: "boot", status: "success", summary: "first" });
    appendAuditEntry(db, { area: "chat", action: "send", status: "success", summary: "second" });
    const list = listAuditEntries(db);
    expect(list).toHaveLength(2);
    expect(list[0].summary).toBe("second");
    expect(list[1].summary).toBe("first");
  });

  it("respects retention by pruning oldest", () => {
    const db = getDb();
    for (let i = 0; i < 10; i++) {
      appendAuditEntry(db, { area: "system", action: "tick", status: "success", summary: `e${i}` }, 5);
    }
    const list = listAuditEntries(db);
    expect(list.length).toBeLessThanOrEqual(5);
    expect(list[0].summary).toBe("e9");
  });

  it("preserves targetId when set", () => {
    const db = getDb();
    appendAuditEntry(db, { area: "tool", action: "exec", status: "success", summary: "ok", targetId: "tool-42" });
    const [entry] = listAuditEntries(db);
    expect(entry.targetId).toBe("tool-42");
  });

  it("limits result size", () => {
    const db = getDb();
    for (let i = 0; i < 20; i++) {
      appendAuditEntry(db, { area: "system", action: "x", status: "success", summary: `s${i}` });
    }
    expect(listAuditEntries(db, 5)).toHaveLength(5);
  });

  it("prune is idempotent below retention", () => {
    const db = getDb();
    appendAuditEntry(db, { area: "system", action: "x", status: "success", summary: "one" });
    expect(pruneAuditEntries(db, 100)).toBe(0);
  });

  it("migrateAuditFromJson is idempotent", () => {
    const db = getDb();
    const seed: AuditEntry[] = [
      { id: "audit_1", timestamp: "2025-01-01T00:00:00Z", area: "system", action: "boot", status: "success", summary: "first" },
      { id: "audit_2", timestamp: "2025-01-02T00:00:00Z", area: "chat", action: "send", status: "error", summary: "fail" },
    ];
    expect(migrateAuditFromJson(db, seed)).toBe(2);
    expect(migrateAuditFromJson(db, seed)).toBe(0);
    expect(listAuditEntries(db)).toHaveLength(2);
  });
});
