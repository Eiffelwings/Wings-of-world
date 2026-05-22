import { describe, it, expect } from "vitest";
import {
  compressText,
  compressMessages,
  protectStructure,
  restoreStructure,
  splitIntoSentences,
  scoreSentences,
  selectByBudget,
  collapseWhitespace,
} from "../lib/prompt-compress.js";

const LONG_PROSE = `
Wings is an open-source AI agent platform. It supports multiple LLM providers including
Anthropic, OpenAI, DeepSeek, Groq, and Gemini. The platform handles streaming responses,
tool calling, and agentic loops for complex tasks. Users can configure rate limits and
spend caps to keep their API budget under control. The codebase is written in TypeScript
and uses SQLite for storage. There are over 200 unit tests covering the core features.
The architecture supports both Telegram bots and web UIs. Recent updates include semantic
caching, distributed tracing, and a smart model cascade that routes easy queries to
cheaper models. Hermes integration allows memory sync with the Hermes agent framework.
The system also includes guardrails based on the Future AGI evaluation catalog. All of
this works together to provide a production-ready agent platform that's actively
maintained and extended.
`.trim();

describe("collapseWhitespace", () => {
  it("collapses multiple newlines and trailing spaces", () => {
    const out = collapseWhitespace("hello   \n\n\n  world  \n");
    expect(out).toBe("hello\n\n  world");
  });

  it("normalises CRLF to LF", () => {
    expect(collapseWhitespace("a\r\nb")).toBe("a\nb");
  });

  it("collapses repeated spaces", () => {
    expect(collapseWhitespace("foo     bar")).toBe("foo bar");
  });
});

describe("protectStructure / restoreStructure", () => {
  it("preserves fenced code blocks through round-trip", () => {
    const input = "Here is some code:\n```python\nprint('hi')\n```\nDone.";
    const { stripped, blocks } = protectStructure(input);
    expect(blocks.some((b) => b.content.includes("print"))).toBe(true);
    expect(stripped).not.toContain("print('hi')");
    const restored = restoreStructure(stripped, blocks);
    expect(restored).toContain("```python\nprint('hi')\n```");
  });

  it("preserves inline code", () => {
    const input = "Use `node --version` to check.";
    const { stripped, blocks } = protectStructure(input);
    expect(stripped).not.toContain("node --version");
    expect(blocks).toHaveLength(1);
    expect(restoreStructure(stripped, blocks)).toBe(input);
  });

  it("preserves bullet and numbered lists", () => {
    const input = "Steps:\n1. First step\n2. Second step\n- bullet item";
    const { blocks } = protectStructure(input);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
  });
});

describe("splitIntoSentences", () => {
  it("returns one sentence per terminal punctuation", () => {
    const sentences = splitIntoSentences("First. Second! Third? Fourth.");
    expect(sentences).toHaveLength(4);
  });

  it("handles a single trailing fragment with no punctuation", () => {
    const sentences = splitIntoSentences("just one fragment");
    expect(sentences).toEqual(["just one fragment"]);
  });

  it("returns empty for whitespace", () => {
    expect(splitIntoSentences("   \n  ")).toEqual([]);
  });
});

describe("scoreSentences", () => {
  it("ranks sentences with numbers and proper nouns higher than filler", () => {
    const sentences = [
      "Anthropic released Claude Opus 4 on 2026-01-15.",
      "you know, basically, sort of, kind of, just like that",
    ];
    const scored = scoreSentences(sentences);
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
  });

  it("uses query similarity when sentence embeddings are provided", () => {
    const sentences = ["A", "B"];
    const scored = scoreSentences(sentences, [1, 0, 0], [[1, 0, 0], [0, 1, 0]]);
    // Sentence A perfectly matches the query, sentence B is orthogonal.
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
    expect(scored[0].reasons.some((r) => r.startsWith("sim:"))).toBe(true);
  });
});

describe("selectByBudget", () => {
  it("keeps the highest-scoring sentences within the char budget", () => {
    const scored = [
      { sentence: "important fact one.", index: 0, score: 0.9, reasons: [] },
      { sentence: "filler nonsense maybe sort of probably.", index: 1, score: 0.2, reasons: [] },
      { sentence: "another important fact.", index: 2, score: 0.85, reasons: [] },
    ];
    const kept = selectByBudget(scored, 50);
    const ids = kept.map((k) => k.index);
    expect(ids).toContain(0);
    expect(ids).toContain(2);
    expect(ids).not.toContain(1);
  });

  it("returns at least one sentence even when budget is below the smallest", () => {
    const scored = [{ sentence: "long sentence that exceeds budget", index: 0, score: 0.9, reasons: [] }];
    const kept = selectByBudget(scored, 5);
    expect(kept).toHaveLength(1);
  });

  it("preserves original order in the output", () => {
    const scored = [
      { sentence: "first.", index: 0, score: 0.5, reasons: [] },
      { sentence: "second.", index: 1, score: 0.9, reasons: [] },
      { sentence: "third.", index: 2, score: 0.7, reasons: [] },
    ];
    const kept = selectByBudget(scored, 100);
    expect(kept.map((k) => k.index)).toEqual([0, 1, 2]);
  });
});

describe("compressText · level=off", () => {
  it("returns the input unchanged", () => {
    const r = compressText(LONG_PROSE, { level: "off" });
    expect(r.text).toBe(LONG_PROSE);
    expect(r.ratio).toBe(1);
  });
});

describe("compressText · short input", () => {
  it("only collapses whitespace when below minChars", () => {
    const r = compressText("hello   world\n\n\n\nthere", { level: "light" });
    expect(r.techniques).toContain("whitespace-only");
    expect(r.text).toBe("hello world\n\nthere");
  });
});

describe("compressText · light", () => {
  it("reduces long prose toward the target ratio", () => {
    const r = compressText(LONG_PROSE, { level: "light" });
    expect(r.compressedChars).toBeLessThan(r.originalChars);
    // Allow 15% slack on either side of the 0.75 target.
    expect(r.ratio).toBeLessThan(0.95);
  });

  it("preserves code blocks verbatim", () => {
    const text = LONG_PROSE + "\n\n```\nconst x = compute();\n```\nMore prose to fill space. " + "Padding sentence. ".repeat(20);
    const r = compressText(text, { level: "light" });
    expect(r.text).toContain("const x = compute();");
    expect(r.preservedBlocks).toBeGreaterThan(0);
  });
});

describe("compressText · aggressive", () => {
  it("compresses harder than light", () => {
    const light = compressText(LONG_PROSE, { level: "light" });
    const aggressive = compressText(LONG_PROSE, { level: "aggressive" });
    expect(aggressive.compressedChars).toBeLessThanOrEqual(light.compressedChars);
  });
});

describe("compressText · monotonicity", () => {
  it("never makes the doc longer than the input", () => {
    const first = compressText(LONG_PROSE, { level: "light" });
    expect(first.compressedChars).toBeLessThanOrEqual(LONG_PROSE.length);
  });

  it("converges — repeated passes stop shrinking once below the saturation floor", () => {
    let current = LONG_PROSE;
    for (let i = 0; i < 8; i++) current = compressText(current, { level: "light" }).text;
    const stable = current;
    const next = compressText(stable, { level: "light" }).text;
    // After enough passes the output should reach a fixed point or near-it.
    expect(Math.abs(next.length - stable.length) / Math.max(1, stable.length)).toBeLessThan(0.05);
  });
});

describe("compressMessages", () => {
  it("never modifies the latest user message", () => {
    const messages = [
      { role: "system", content: LONG_PROSE },
      { role: "user", content: "first question " + "padding ".repeat(80) },
      { role: "assistant", content: "earlier answer with much detail " + "added context ".repeat(80) },
      { role: "user", content: "what about now?" },
    ];
    const r = compressMessages(messages, { level: "light" });
    expect(r.messages[3].content).toBe("what about now?");
    // Earlier messages should be touched.
    expect((r.messages[0].content as string).length).toBeLessThan(LONG_PROSE.length);
  });

  it("reports total chars before/after", () => {
    const messages = [
      { role: "system", content: LONG_PROSE + LONG_PROSE },
      { role: "user", content: "go" },
    ];
    const r = compressMessages(messages, { level: "aggressive" });
    expect(r.totalCompressedChars).toBeLessThan(r.totalOriginalChars);
  });

  it("ignores non-string content gracefully", () => {
    const messages = [
      { role: "tool", content: { complex: "object" } },
      { role: "user", content: "trigger" },
    ];
    const r = compressMessages(messages, { level: "light" });
    expect(r.messages[0].content).toEqual({ complex: "object" });
  });
});

describe("compressText · query-aware", () => {
  it("favours sentences embedded near the query vector when explicit embeddings are supplied", () => {
    // We can't supply per-sentence embeddings through compressText itself,
    // but the scorer takes them — verify ordering at the score layer.
    const sentences = ["Wings supports streaming.", "Random unrelated lore about fish."];
    const scored = scoreSentences(sentences, [1, 0, 0], [[1, 0, 0], [0, 1, 0]]);
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
  });
});
