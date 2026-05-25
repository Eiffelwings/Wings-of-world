import { describe, it, expect } from "vitest";
import {
  pickBranchEdges,
  evaluateBranchOutcome,
  evaluateLoopItems,
  runLoopBody,
} from "../lib/workflow-flow.js";

describe("workflow-flow · pickBranchEdges", () => {
  const edges = [
    { source: "cond", target: "a", branch: "true" as const },
    { source: "cond", target: "b", branch: "false" as const },
    { source: "passthrough", target: "a" }, // no branch — always fires
  ];

  it("only keeps the matching branch when an outcome is recorded", () => {
    const map = new Map<string, "true" | "false">([["cond", "true"]]);
    const filtered = pickBranchEdges(edges, map);
    const sources = filtered.map((e) => `${e.source}/${e.branch ?? "any"}`);
    expect(sources).toContain("cond/true");
    expect(sources).not.toContain("cond/false");
    expect(sources).toContain("passthrough/any");
  });

  it("drops both branches when the outcome is absent", () => {
    const filtered = pickBranchEdges(edges, new Map());
    const branched = filtered.filter((e) => e.branch);
    expect(branched).toHaveLength(0);
  });

  it("respects the branch=false case", () => {
    const map = new Map<string, "true" | "false">([["cond", "false"]]);
    const filtered = pickBranchEdges(edges, map);
    // The cond/false edge should now be the only branched edge that fires.
    const branched = filtered.filter((e) => e.branch);
    expect(branched).toHaveLength(1);
    expect(branched[0].branch).toBe("false");
    expect(branched[0].target).toBe("b");
    // The unbranched passthrough edge always fires regardless.
    expect(filtered.some((e) => e.source === "passthrough")).toBe(true);
  });
});

describe("workflow-flow · evaluateBranchOutcome", () => {
  it("returns 'true' for truthy expressions", async () => {
    const r = await evaluateBranchOutcome("input > 5", { input: 10 });
    expect(r.outcome).toBe("true");
    expect(r.error).toBeUndefined();
  });

  it("returns 'false' for falsy expressions", async () => {
    const r = await evaluateBranchOutcome("input.length > 100", { input: "short" });
    expect(r.outcome).toBe("false");
  });

  it("treats syntax errors as a falsy outcome with error captured", async () => {
    const r = await evaluateBranchOutcome("totally invalid {", { input: 0 });
    expect(r.outcome).toBe("false");
    expect(r.error).toBeTruthy();
  });

  it("can read context bindings", async () => {
    const r = await evaluateBranchOutcome("context.flag === true", {
      input: 0,
      context: { flag: true },
    });
    expect(r.outcome).toBe("true");
  });
});

describe("workflow-flow · evaluateLoopItems", () => {
  it("returns the array when the expression evaluates to one", async () => {
    const r = await evaluateLoopItems("[1, 2, 3]", { input: null }, 50);
    expect(r.items).toEqual([1, 2, 3]);
    expect(r.capped).toBe(false);
    expect(r.originalCount).toBe(3);
  });

  it("caps the array to maxIterations and reports capped:true", async () => {
    const r = await evaluateLoopItems("Array.from({length: 100}, (_, i) => i)", { input: null }, 5);
    expect(r.items).toHaveLength(5);
    expect(r.capped).toBe(true);
    expect(r.originalCount).toBe(100);
  });

  it("returns an error when the expression doesn't produce an array", async () => {
    const r = await evaluateLoopItems("'not an array'", { input: null }, 50);
    expect(r.items).toEqual([]);
    expect(r.error).toContain("array");
  });

  it("captures sandbox errors", async () => {
    const r = await evaluateLoopItems("input.does.not.exist", { input: null }, 50);
    expect(r.items).toEqual([]);
    expect(r.error).toBeTruthy();
  });

  it("default-splits stringy input lines via the standard expression", async () => {
    const r = await evaluateLoopItems("input.split('\\n').filter(Boolean)", { input: "a\nb\nc" }, 50);
    expect(r.items).toEqual(["a", "b", "c"]);
  });

  it("clamps an absurdly high cap to 500", async () => {
    const r = await evaluateLoopItems("Array.from({length: 2000}, (_, i) => i)", { input: null }, 99999);
    expect(r.items.length).toBe(500);
  });
});

describe("workflow-flow · runLoopBody", () => {
  it("runs the body once per item with item / index / total bindings", async () => {
    const body = "return context.index + ':' + context.item + '/' + context.total;";
    const r = await runLoopBody(["a", "b", "c"], body, { input: null });
    expect(r.errors).toBe(0);
    expect(r.results).toEqual(["0:a/3", "1:b/3", "2:c/3"]);
  });

  it("counts iterations that throw without aborting the loop", async () => {
    const body = "if (context.index === 1) throw new Error('boom'); return context.item;";
    const r = await runLoopBody(["x", "y", "z"], body, { input: null });
    expect(r.errors).toBe(1);
    expect(r.results[0]).toBe("x");
    expect(String(r.results[1])).toContain("boom");
    expect(r.results[2]).toBe("z");
  });

  it("preserves caller-provided extra context fields", async () => {
    const body = "return context.scale * context.item;";
    const r = await runLoopBody([1, 2, 3], body, {
      input: null,
      context: { scale: 10 },
    });
    expect(r.results).toEqual([10, 20, 30]);
  });
});
