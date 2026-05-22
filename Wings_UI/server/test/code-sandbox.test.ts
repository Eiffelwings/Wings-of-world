import { describe, it, expect } from "vitest";
import { runUserCode, evalToolArgs } from "../lib/code-sandbox.js";

describe("code-sandbox · runUserCode", () => {
  it("evaluates a simple expression and returns the value", async () => {
    const r = await runUserCode<number>("input * 2", { input: 21 });
    expect(r.ok).toBe(true);
    expect(r.value).toBe(42);
  });

  it("supports `return` statements when the snippet is multi-line", async () => {
    const code = `
      const doubled = input.map(n => n * 2);
      return doubled.reduce((a, b) => a + b, 0);
    `;
    const r = await runUserCode<number>(code, { input: [1, 2, 3, 4] });
    expect(r.ok).toBe(true);
    expect(r.value).toBe(20);
  });

  it("exposes context bindings", async () => {
    const r = await runUserCode("context.label + ': ' + input", { input: "42", context: { label: "answer" } });
    expect(r.ok).toBe(true);
    expect(r.value).toBe("answer: 42");
  });

  it("returns ok:false for syntax errors instead of crashing", async () => {
    const r = await runUserCode("totally not js {", { input: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("blocks access to `process`", async () => {
    const r = await runUserCode("typeof process", { input: 0 });
    // Either the sandbox throws (isolated-vm) or returns "undefined" (vm fallback).
    if (r.ok) expect(r.value).toBe("undefined");
    else expect(r.error).toBeTruthy();
  });

  it("blocks access to `require`", async () => {
    const r = await runUserCode("typeof require", { input: 0 });
    if (r.ok) expect(r.value).toBe("undefined");
    else expect(r.error).toBeTruthy();
  });

  it("times out an infinite loop within the deadline", async () => {
    const start = Date.now();
    const r = await runUserCode("while (true) {}", { input: 0 }, { timeoutMs: 200 });
    const elapsed = Date.now() - start;
    expect(r.ok).toBe(false);
    // Should kill the script in well under a second, not hang the test.
    expect(elapsed).toBeLessThan(2000);
  });

  it("clips overlong string results", async () => {
    // Build a 200KB string inside the sandbox to confirm the clipper kicks in.
    const r = await runUserCode<string>("'x'.repeat(200000)", { input: 0 });
    expect(r.ok).toBe(true);
    if (typeof r.value === "string") {
      expect(r.value.length).toBeLessThan(200_000);
      expect(r.value.endsWith("…[truncated]")).toBe(true);
    }
  });

  it("reports which engine ran the code", async () => {
    const r = await runUserCode("input + 1", { input: 1 });
    expect(["isolated-vm", "node-vm"]).toContain(r.engine);
  });
});

describe("code-sandbox · evalToolArgs", () => {
  it("fast-paths a JSON literal", async () => {
    const r = await evalToolArgs('{"a":1,"b":"hi"}', { input: null });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ a: 1, b: "hi" });
  });

  it("evaluates an expression that references input", async () => {
    const r = await evalToolArgs("({ q: input.toUpperCase(), top: 5 })", { input: "wings" });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ q: "WINGS", top: 5 });
  });

  it("returns ok:false when the expression throws", async () => {
    const r = await evalToolArgs("input.does.not.exist", { input: null });
    expect(r.ok).toBe(false);
  });
});
