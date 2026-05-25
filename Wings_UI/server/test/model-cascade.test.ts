import { describe, it, expect } from "vitest";
import {
  classifyComplexity,
  pickStartingTier,
  nextEscalationTier,
  confidenceFromResponse,
  decideEscalation,
  estimateTierSaving,
  type CascadeMode,
  type Tier,
  type TierConfig,
} from "../lib/model-cascade.js";
import {
  runCascade,
  defaultTiersFor,
  CASCADE_DEFAULT_TIERS_BY_PROVIDER,
} from "../features/cascade-runtime.js";

const FULL_TIERS: TierConfig = {
  small: { provider: "anthropic", model: "claude-haiku-4" },
  medium: { provider: "anthropic", model: "claude-sonnet-4-6" },
  large: { provider: "anthropic", model: "claude-opus-4" },
};

describe("classifyComplexity", () => {
  it("flags greetings as easy", () => {
    expect(classifyComplexity([{ role: "user", content: "hi" }]).complexity).toBe("easy");
    expect(classifyComplexity([{ role: "user", content: "thanks!" }]).complexity).toBe("easy");
    expect(classifyComplexity([{ role: "user", content: "สวัสดี" }]).complexity).toBe("easy");
  });

  it("flags very short non-code questions as easy", () => {
    expect(classifyComplexity([{ role: "user", content: "What time is it?" }]).complexity).toBe("easy");
  });

  it("flags medium-length questions as medium", () => {
    const q = "Can you summarize the differences between supervised and unsupervised learning, and give me one example of each that would be useful in a healthcare setting?";
    expect(classifyComplexity([{ role: "user", content: q }]).complexity).toBe("medium");
  });

  it("flags long prompts as hard", () => {
    const long = "Explain " + "extremely complex topic ".repeat(120);
    expect(classifyComplexity([{ role: "user", content: long }]).complexity).toBe("hard");
  });

  it("flags presence of code blocks as a signal", () => {
    const result = classifyComplexity([
      { role: "user", content: "```python\ndef foo():\n  return 42\n```\nWhat does this do?" },
    ]);
    expect(result.signals).toContain("code");
  });

  it("flags long code as hard", () => {
    const lines = Array.from({ length: 90 }, (_, i) => `  step_${i}();`).join("\n");
    const r = classifyComplexity([{ role: "user", content: `\`\`\`js\nfunction big() {\n${lines}\n}\n\`\`\`` }]);
    expect(r.complexity).toBe("hard");
    expect(r.signals).toContain("long-code");
  });

  it("flags hard keywords", () => {
    const r = classifyComplexity([{ role: "user", content: "Please refactor this module step by step." }]);
    expect(r.complexity).toBe("hard");
    expect(r.signals).toContain("hard-keyword");
  });

  it("flags long conversations as hard via signal", () => {
    const messages = Array.from({ length: 14 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "ongoing chat",
    }));
    const r = classifyComplexity(messages);
    expect(r.signals).toContain("long-conversation");
    expect(r.complexity).toBe("hard");
  });

  it("flags math as hard", () => {
    const r = classifyComplexity([{ role: "user", content: "Prove that $\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$." }]);
    expect(r.complexity).toBe("hard");
    expect(r.signals).toContain("math");
  });
});

describe("pickStartingTier", () => {
  const matrix: Array<{ complexity: "easy" | "medium" | "hard"; mode: CascadeMode; expected: Tier | null }> = [
    { complexity: "easy", mode: "off", expected: null },
    { complexity: "hard", mode: "off", expected: null },
    { complexity: "easy", mode: "balanced", expected: "small" },
    { complexity: "medium", mode: "balanced", expected: "medium" },
    { complexity: "hard", mode: "balanced", expected: "large" },
    { complexity: "easy", mode: "aggressive", expected: "small" },
    { complexity: "medium", mode: "aggressive", expected: "small" },
    { complexity: "hard", mode: "aggressive", expected: "large" },
  ];
  for (const row of matrix) {
    it(`returns ${row.expected} for ${row.complexity}/${row.mode}`, () => {
      expect(pickStartingTier(row.complexity, row.mode, FULL_TIERS)).toBe(row.expected);
    });
  }

  it("falls back to a configured tier when the ideal one is missing", () => {
    const partial: TierConfig = { medium: FULL_TIERS.medium };
    expect(pickStartingTier("easy", "balanced", partial)).toBe("medium");
    expect(pickStartingTier("hard", "balanced", partial)).toBe("medium");
  });

  it("returns null when no tier is configured", () => {
    expect(pickStartingTier("medium", "balanced", {})).toBe(null);
  });
});

describe("nextEscalationTier", () => {
  it("walks up the available tiers", () => {
    expect(nextEscalationTier("small", FULL_TIERS)).toBe("medium");
    expect(nextEscalationTier("medium", FULL_TIERS)).toBe("large");
    expect(nextEscalationTier("large", FULL_TIERS)).toBe(null);
  });

  it("skips missing tiers", () => {
    const t: TierConfig = { small: FULL_TIERS.small, large: FULL_TIERS.large };
    expect(nextEscalationTier("small", t)).toBe("large");
  });
});

describe("confidenceFromResponse", () => {
  it("scores normal responses high", () => {
    const r = confidenceFromResponse("The capital of France is Paris.");
    expect(r.score).toBeGreaterThan(0.7);
  });

  it("penalises empty responses heavily", () => {
    expect(confidenceFromResponse("").score).toBe(0);
    expect(confidenceFromResponse("   ").score).toBe(0);
  });

  it("penalises refusal patterns", () => {
    const r = confidenceFromResponse("I'm sorry, but I don't know the answer.");
    expect(r.score).toBeLessThan(0.6);
    expect(r.reasons.some((x) => x.startsWith("refusal:"))).toBe(true);
  });

  it("penalises uncertainty markers", () => {
    const r = confidenceFromResponse("I think this might be related to quantum tunneling, but I'm not sure.");
    expect(r.score).toBeLessThan(0.7);
    expect(r.reasons.some((x) => x.startsWith("uncertainty:"))).toBe(true);
  });

  it("penalises very short responses", () => {
    expect(confidenceFromResponse("yes").score).toBeLessThan(confidenceFromResponse("yes, the calculation checks out across all three test cases").score);
  });

  it("penalises denied-access patterns", () => {
    const r = confidenceFromResponse("I don't have access to the file you mentioned.");
    expect(r.reasons.some((x) => x === "denies-access")).toBe(true);
  });
});

describe("decideEscalation", () => {
  it("never escalates in non-aggressive mode", () => {
    const d = decideEscalation({
      mode: "balanced",
      currentTier: "small",
      tiers: FULL_TIERS,
      complexity: "medium",
      confidence: { score: 0.1, reasons: [] },
    });
    expect(d.shouldEscalate).toBe(false);
  });

  it("escalates aggressively when confidence is low", () => {
    const d = decideEscalation({
      mode: "aggressive",
      currentTier: "small",
      tiers: FULL_TIERS,
      complexity: "medium",
      confidence: { score: 0.3, reasons: [] },
    });
    expect(d.shouldEscalate).toBe(true);
    expect(d.nextTier).toBe("medium");
  });

  it("does not escalate when confidence clears the threshold", () => {
    const d = decideEscalation({
      mode: "aggressive",
      currentTier: "small",
      tiers: FULL_TIERS,
      complexity: "medium",
      confidence: { score: 0.9, reasons: [] },
    });
    expect(d.shouldEscalate).toBe(false);
  });

  it("does not escalate when there is no higher tier", () => {
    const d = decideEscalation({
      mode: "aggressive",
      currentTier: "large",
      tiers: FULL_TIERS,
      complexity: "hard",
      confidence: { score: 0.1, reasons: [] },
    });
    expect(d.shouldEscalate).toBe(false);
    expect(d.reason).toContain("no-higher-tier");
  });
});

describe("estimateTierSaving", () => {
  it("returns zero when the actual tier is large", () => {
    expect(estimateTierSaving({ actualTier: "large", largeRate: 0.04, actualRate: 0.04, totalTokens: 1000 })).toBe(0);
  });

  it("returns the difference in cost vs always-large for cheaper tiers", () => {
    const saved = estimateTierSaving({ actualTier: "small", largeRate: 0.04, actualRate: 0.001, totalTokens: 10_000 });
    expect(saved).toBeCloseTo((10 * 0.04) - (10 * 0.001), 6);
  });
});

describe("runCascade integration", () => {
  it("returns nothing when mode is off", async () => {
    const r = await runCascade(
      { messages: [{ role: "user", content: "hi" }], tiers: FULL_TIERS, mode: "off" },
      { generate: async () => ({ content: "should not be called", tokensTotal: 0 }) },
    );
    expect(r.content).toBe("");
    expect(r.record.startingTier).toBeNull();
  });

  it("uses small tier for greetings in balanced mode and does not escalate", async () => {
    const calls: string[] = [];
    const r = await runCascade(
      { messages: [{ role: "user", content: "hello" }], tiers: FULL_TIERS, mode: "balanced" },
      {
        generate: async (target) => {
          calls.push(target.model);
          return { content: "Hi! How can I help?", tokensTotal: 12 };
        },
      },
    );
    expect(calls).toEqual([FULL_TIERS.small!.model]);
    expect(r.record.escalations).toBe(0);
    expect(r.record.finalTier).toBe("small");
  });

  it("escalates from small to medium when small responds with refusal", async () => {
    const calls: string[] = [];
    const r = await runCascade(
      {
        messages: [{ role: "user", content: "Plan a 7-step sales rollout for our SaaS product." }],
        tiers: FULL_TIERS,
        mode: "aggressive",
      },
      {
        generate: async (target, opts) => {
          calls.push(target.model);
          if (opts.tier === "small") return { content: "I'm sorry, but I don't know.", tokensTotal: 10 };
          return { content: "Here is a thorough rollout plan: 1. ...", tokensTotal: 200 };
        },
      },
    );
    expect(calls).toEqual([FULL_TIERS.small!.model, FULL_TIERS.medium!.model]);
    expect(r.record.escalations).toBe(1);
    expect(r.record.finalTier).toBe("medium");
    expect(r.content).toMatch(/rollout plan/);
  });

  it("respects maxEscalations cap", async () => {
    const r = await runCascade(
      {
        messages: [{ role: "user", content: "Plan a complex sales rollout." }],
        tiers: FULL_TIERS,
        mode: "aggressive",
        maxEscalations: 1,
      },
      {
        generate: async () => ({ content: "I'm not sure.", tokensTotal: 10 }),
      },
    );
    // Cap at 1 escalation: small → medium, then stop even though medium also fails.
    expect(r.record.attempts.map((a) => a.tier)).toEqual(["small", "medium"]);
    expect(r.record.escalations).toBe(1);
  });
});

describe("default tiers", () => {
  it("returns the OpenRouter map when baseURL is openrouter.ai", () => {
    expect(defaultTiersFor("https://openrouter.ai/api/v1", "custom")).toBe(
      CASCADE_DEFAULT_TIERS_BY_PROVIDER.openrouter,
    );
  });

  it("returns the Anthropic map for the anthropic provider", () => {
    expect(defaultTiersFor("https://api.anthropic.com", "anthropic")).toBe(
      CASCADE_DEFAULT_TIERS_BY_PROVIDER.anthropic,
    );
  });

  it("returns an empty object when nothing matches", () => {
    const result = defaultTiersFor("https://unknown.example.com", "custom");
    expect(Object.keys(result)).toHaveLength(0);
  });
});
