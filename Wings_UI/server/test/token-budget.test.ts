import { describe, it, expect } from "vitest";
import {
  adaptiveMaxTokens,
  capMessage,
  capMessageSizes,
  estimateMessagesTokens,
  smartTruncateToolResult,
  truncateMemoryContent,
  MESSAGE_CHAR_CAP,
  TOOL_RESULT_CHAR_CAP,
} from "../lib/token-budget.js";

describe("token-budget", () => {
  describe("estimateMessagesTokens", () => {
    it("estimates roughly chars/4 tokens", () => {
      const messages = [{ role: "user", content: "hello world" }];
      expect(estimateMessagesTokens(messages)).toBe(Math.ceil("hello world".length / 4));
    });

    it("ignores non-string content", () => {
      const messages = [
        { role: "user", content: "abcd" },
        { role: "tool", content: { tool_call_id: "x" } as any },
      ];
      expect(estimateMessagesTokens(messages)).toBe(1);
    });
  });

  describe("adaptiveMaxTokens", () => {
    it("clamps short prompts to 1024", () => {
      const messages = [{ role: "user", content: "hi" }];
      expect(adaptiveMaxTokens(messages, 8192)).toBe(1024);
    });

    it("medium prompts get 2048", () => {
      const messages = [{ role: "user", content: "x".repeat(500) }];
      expect(adaptiveMaxTokens(messages, 8192)).toBe(2048);
    });

    it("long prompts get the full default cap", () => {
      const messages = [{ role: "user", content: "x".repeat(5000) }];
      expect(adaptiveMaxTokens(messages, 4096)).toBe(4096);
    });

    it("never exceeds the default cap", () => {
      const messages = [{ role: "user", content: "hi" }];
      expect(adaptiveMaxTokens(messages, 256)).toBe(256);
    });
  });

  describe("capMessage", () => {
    it("returns short messages unchanged", () => {
      const m = { role: "user", content: "short" };
      expect(capMessage(m, 1000)).toBe(m);
    });

    it("preserves head and tail when over cap", () => {
      const cap = 100;
      const head = "H".repeat(80);
      const tail = "T".repeat(80);
      const middle = "M".repeat(500);
      const m = { role: "user", content: head + middle + tail };
      const capped = capMessage(m, cap);
      expect(typeof capped.content).toBe("string");
      expect(capped.content as string).toMatch(/chars omitted/);
      expect((capped.content as string).startsWith("H")).toBe(true);
      expect((capped.content as string).endsWith("T")).toBe(true);
    });
  });

  describe("capMessageSizes", () => {
    it("caps each oversized message independently", () => {
      const messages = [
        { role: "user", content: "x".repeat(MESSAGE_CHAR_CAP + 1000) },
        { role: "assistant", content: "ok" },
      ];
      const out = capMessageSizes(messages);
      expect((out[0].content as string).length).toBeLessThan(MESSAGE_CHAR_CAP);
      expect(out[1].content).toBe("ok");
    });
  });

  describe("truncateMemoryContent", () => {
    it("appends ellipsis when over cap", () => {
      const result = truncateMemoryContent("x".repeat(500), 100);
      expect(result.endsWith("…")).toBe(true);
      expect(result.length).toBe(101);
    });

    it("returns input unchanged when within cap", () => {
      expect(truncateMemoryContent("short", 100)).toBe("short");
    });
  });

  describe("smartTruncateToolResult", () => {
    it("returns short strings unchanged", () => {
      expect(smartTruncateToolResult("hello")).toBe("hello");
    });

    it("truncates long strings with marker", () => {
      const out = smartTruncateToolResult("x".repeat(10_000));
      expect(out.length).toBeLessThan(10_000);
      expect(out).toMatch(/truncated/);
    });

    it("trims object fields by largest first", () => {
      const huge = "z".repeat(5000);
      const result = { tiny: "a", medium: "b".repeat(50), huge };
      const out = smartTruncateToolResult(result);
      const parsed = JSON.parse(out);
      expect(parsed.tiny).toBe("a");
      expect(typeof parsed.huge).toBe("string");
      expect(parsed.huge.length).toBeLessThan(huge.length);
      expect(out.length).toBeLessThanOrEqual(TOOL_RESULT_CHAR_CAP + 200);
    });

    it("handles arrays via the string-fallback branch", () => {
      const big = new Array(2000).fill({ k: "v" });
      const out = smartTruncateToolResult(big);
      expect(out.length).toBeLessThan(JSON.stringify(big).length);
    });
  });
});
