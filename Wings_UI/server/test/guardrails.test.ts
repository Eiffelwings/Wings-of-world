import { describe, it, expect } from "vitest";
import {
  loadCatalog,
  listEvals,
  getEvalDefinition,
  renderPrompt,
  parseVerdict,
  validateInput,
  runEval,
  runEvals,
  type EvalVerdict,
  type JudgeFn,
} from "../features/guardrails/engine.js";
import {
  POLICY_PRESETS,
  runPreChecks,
  runPostChecks,
  summarizeReport,
} from "../features/guardrails/runtime.js";

const fakeJudge =
  (response: string): JudgeFn =>
  async () => ({ content: response, durationMs: 5 });

describe("guardrails catalog", () => {
  it("loads the catalog with the expected core evals", () => {
    const catalog = loadCatalog();
    expect(catalog.size).toBeGreaterThan(20);
    expect(catalog.has("detect_hallucination")).toBe(true);
    expect(catalog.has("groundedness")).toBe(true);
    expect(catalog.has("prompt_injection")).toBe(true);
    expect(catalog.has("toxicity")).toBe(true);
    expect(catalog.has("pii")).toBe(true);
  });

  it("each eval has a populated rule prompt and required keys", () => {
    for (const def of listEvals()) {
      expect(def.rulePrompt.length).toBeGreaterThan(50);
      expect(Array.isArray(def.requiredKeys)).toBe(true);
    }
  });

  it("returns null for unknown ids", () => {
    expect(getEvalDefinition("nope_no_eval_with_this_id")).toBeNull();
  });
});

describe("renderPrompt", () => {
  it("substitutes mustache placeholders", () => {
    expect(renderPrompt("hello {{name}}", { name: "world" })).toBe("hello world");
  });

  it("replaces missing variables with empty strings", () => {
    expect(renderPrompt("a {{x}} b {{y}} c", { x: "1" })).toBe("a 1 b  c");
  });

  it("handles whitespace inside braces", () => {
    expect(renderPrompt("{{  foo  }}", { foo: "bar" })).toBe("bar");
  });
});

describe("parseVerdict", () => {
  it("parses 'Verdict: Passed'", () => {
    const r = parseVerdict("Detailed reasoning here.\nVerdict: Passed", "Pass/Fail");
    expect(r.passed).toBe(true);
  });

  it("parses 'Verdict: Failed'", () => {
    const r = parseVerdict("Bad output.\nVerdict: Failed", "Pass/Fail");
    expect(r.passed).toBe(false);
  });

  it("uses last-occurrence to break ties", () => {
    // Judge says "did not fail" earlier, then concludes "Passed"
    const r = parseVerdict("Initially I thought this could fail. Verdict: Passed", "Pass/Fail");
    expect(r.passed).toBe(true);
  });

  it("returns null for ambiguous text", () => {
    expect(parseVerdict("the quick brown fox", "Pass/Fail").passed).toBe(null);
  });

  it("parses JSON verdicts", () => {
    const r = parseVerdict('{"verdict":"Passed","score":0.92}', "Pass/Fail");
    expect(r.passed).toBe(true);
    expect(r.score).toBeCloseTo(0.92);
  });

  it("falls back to 0.5 score threshold for JSON without verdict", () => {
    expect(parseVerdict('{"score":0.7}', "Pass/Fail").passed).toBe(true);
    expect(parseVerdict('{"score":0.3}', "Pass/Fail").passed).toBe(false);
  });

  it("parses fractional scores like 4/5", () => {
    const r = parseVerdict("Score: 4/5\nReason: works fine", "score");
    expect(r.score).toBeCloseTo(0.8);
    expect(r.passed).toBe(true);
  });
});

describe("validateInput", () => {
  it("returns null when all keys present", () => {
    const def = getEvalDefinition("detect_hallucination")!;
    expect(validateInput(def, { input: "q", output: "a", context: "ctx" })).toBe(null);
  });

  it("returns an error message when a required key is missing", () => {
    const def = getEvalDefinition("detect_hallucination")!;
    expect(validateInput(def, { input: "q", output: "a" })).toContain("context");
  });
});

describe("runEval", () => {
  it("runs an eval through a fake judge and returns a passed verdict", async () => {
    const def = getEvalDefinition("toxicity")!;
    const verdict = await runEval(
      def,
      { values: { output: "Hello there, hope you have a nice day." } },
      fakeJudge("This output is respectful and free of harmful language.\nVerdict: Passed"),
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.evalId).toBe("toxicity");
    expect(verdict.error).toBeUndefined();
  });

  it("returns an error verdict when required keys are missing", async () => {
    const def = getEvalDefinition("detect_hallucination")!;
    const verdict = await runEval(def, { values: { output: "x" } }, fakeJudge("Verdict: Passed"));
    expect(verdict.error).toBeDefined();
    expect(verdict.passed).toBe(null);
  });

  it("captures judge errors gracefully", async () => {
    const def = getEvalDefinition("toxicity")!;
    const judge: JudgeFn = async () => { throw new Error("provider down"); };
    const verdict = await runEval(def, { values: { output: "x" } }, judge);
    expect(verdict.error).toContain("provider down");
    expect(verdict.passed).toBe(null);
  });
});

describe("runEvals batch", () => {
  it("runs multiple evals", async () => {
    // toxicity requires `output`; pii requires `input` — supply both so each
    // eval's required-key check passes.
    const verdicts = await runEvals(
      ["toxicity", "pii"],
      { values: { input: "neutral input", output: "neutral text" } },
      fakeJudge("Verdict: Passed"),
    );
    expect(verdicts).toHaveLength(2);
    expect(verdicts.every((v) => v.passed === true)).toBe(true);
  });

  it("returns an error verdict for an unknown id without throwing", async () => {
    const verdicts = await runEvals(
      ["toxicity", "no_such_eval"],
      { values: { output: "x" } },
      fakeJudge("Verdict: Passed"),
    );
    expect(verdicts[1].error).toContain("Unknown");
  });
});

describe("runtime policy presets", () => {
  it("exports off/basic/rag/strict presets", () => {
    expect(POLICY_PRESETS.off.outputEvals).toEqual([]);
    expect(POLICY_PRESETS.basic.outputEvals).toContain("toxicity");
    expect(POLICY_PRESETS.rag.outputEvals).toContain("detect_hallucination");
    expect(POLICY_PRESETS.strict.outputEvals.length).toBeGreaterThanOrEqual(POLICY_PRESETS.rag.outputEvals.length);
    expect(POLICY_PRESETS.rag.blockOnFail).toBe(true);
  });

  it("pre-checks return empty when policy has no input evals", async () => {
    const r = await runPreChecks(POLICY_PRESETS.off, { userMessage: "hi" }, fakeJudge("Verdict: Passed"));
    expect(r.verdicts).toEqual([]);
    expect(r.blocked).toBe(false);
  });

  it("post-checks block when blockOnFail and any eval fails", async () => {
    const passing = fakeJudge("Verdict: Passed");
    const failing = fakeJudge("Verdict: Failed");

    const okReport = await runPostChecks(
      POLICY_PRESETS.rag,
      { userMessage: "what is in the doc?", output: "the answer", context: "the answer" },
      passing,
    );
    expect(okReport.blocked).toBe(false);

    const failReport = await runPostChecks(
      POLICY_PRESETS.rag,
      { userMessage: "what is in the doc?", output: "made up", context: "different content" },
      failing,
    );
    expect(failReport.blocked).toBe(true);
    expect(failReport.blockingEvals.length).toBeGreaterThan(0);
  });

  it("summarizeReport produces a one-line summary", () => {
    const verdicts: EvalVerdict[] = [
      { evalId: "a", passed: true, rawResponse: "", durationMs: 1 },
      { evalId: "b", passed: false, rawResponse: "", durationMs: 1 },
      { evalId: "c", passed: null, rawResponse: "", durationMs: 1, error: "x" },
    ];
    expect(summarizeReport({ stage: "post", verdicts, blocked: false, blockingEvals: ["b"] }))
      .toBe("post: 1 passed, 1 failed, 1 errored");
  });
});
