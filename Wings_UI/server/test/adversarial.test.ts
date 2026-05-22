import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { initDb, closeDb, getDb } from "../lib/db.js";
import {
  PROBE_LIBRARY,
  listProbes,
  runAdversarialSuite,
  ensureAdversarialSchema,
  persistReport,
  listReports,
} from "../features/adversarial.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-adv-"));
  initDb(path.join(tmpDir, "adv.db"));
  ensureAdversarialSchema(getDb());
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("adversarial", () => {
  it("ships a non-empty probe library covering the major attack categories", () => {
    expect(PROBE_LIBRARY.length).toBeGreaterThanOrEqual(8);
    const categories = new Set(PROBE_LIBRARY.map((p) => p.category));
    expect(categories.has("jailbreak")).toBe(true);
    expect(categories.has("prompt_injection")).toBe(true);
    expect(categories.has("pii_extraction")).toBe(true);
    expect(categories.has("harmful_content")).toBe(true);
  });

  it("filters probes by category", () => {
    const filtered = listProbes({ categories: ["jailbreak"] });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((p) => p.category === "jailbreak")).toBe(true);
  });

  it("flags an attack as succeeded when guardrails report a Fail", async () => {
    const probes = [PROBE_LIBRARY.find((p) => p.id === "jailbreak.dan")!];
    const generate = async () => ({ output: "Sure, here's how to bypass the firewall: …", durationMs: 1 });
    const judge = async () => ({ content: "Verdict: Failed", durationMs: 1 });

    const report = await runAdversarialSuite(
      { model: "test", probes },
      { generate, judge },
    );
    expect(report.attacksSucceeded).toBe(1);
    expect(report.results[0].attackSucceeded).toBe(true);
  });

  it("respects the blockedByGuardrails signal from the chat layer", async () => {
    const probes = [PROBE_LIBRARY.find((p) => p.id === "jailbreak.dan")!];
    const generate = async () => ({ output: "[blocked]", durationMs: 1, blockedByGuardrails: true });
    const judge = async () => ({ content: "Verdict: Failed", durationMs: 1 });

    const report = await runAdversarialSuite(
      { model: "test", probes },
      { generate, judge },
    );
    expect(report.guardrailsBlocked).toBe(1);
    expect(report.results[0].attackSucceeded).toBe(false);
  });

  it("persists and lists reports", async () => {
    const probes = [PROBE_LIBRARY[0]];
    const report = await runAdversarialSuite(
      { model: "test", probes },
      { generate: async () => ({ output: "safe", durationMs: 1 }), judge: async () => ({ content: "Verdict: Passed", durationMs: 1 }) },
    );
    persistReport(getDb(), report);
    const list = listReports(getDb());
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(report.id);
  });
});
