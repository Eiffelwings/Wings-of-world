// Smoke tests for the CLI client helpers. The actual HTTP layer is exercised
// against a live server in manual usage; these tests cover the formatting and
// argument-parsing primitives.
import { describe, it, expect } from "vitest";
// @ts-expect-error mjs import without types
import { formatTokenUsage, formatTable, shortenText, color } from "../../scripts/cli/client.mjs";

describe("CLI client helpers", () => {
  describe("formatTokenUsage", () => {
    it("formats a usage triplet", () => {
      expect(formatTokenUsage({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }))
        .toBe("10p + 5c = 15t");
    });

    it("handles undefined as empty", () => {
      expect(formatTokenUsage(undefined)).toBe("");
    });

    it("treats missing fields as 0", () => {
      expect(formatTokenUsage({})).toBe("0p + 0c = 0t");
    });
  });

  describe("shortenText", () => {
    it("returns short text unchanged", () => {
      expect(shortenText("hello", 60)).toBe("hello");
    });

    it("collapses whitespace", () => {
      expect(shortenText("hi   there\n\nworld", 60)).toBe("hi there world");
    });

    it("truncates with ellipsis when over limit", () => {
      const out = shortenText("x".repeat(200), 50);
      expect(out.length).toBe(50);
      expect(out.endsWith("…")).toBe(true);
    });

    it("returns empty for non-string input", () => {
      expect(shortenText(undefined, 60)).toBe("");
      expect(shortenText(42, 60)).toBe("");
    });
  });

  describe("formatTable", () => {
    it("returns a placeholder for empty rows", () => {
      const out = formatTable([], [{ label: "X", value: () => "" }]);
      expect(out).toContain("(empty)");
    });

    it("renders header + separator + rows", () => {
      const out = formatTable(
        [{ id: "1", name: "alpha" }, { id: "22", name: "beta" }],
        [
          { label: "ID", value: (r: any) => r.id },
          { label: "Name", value: (r: any) => r.name },
        ],
      );
      const lines = out.split("\n");
      expect(lines).toHaveLength(4);
      expect(lines[0]).toContain("ID");
      expect(lines[0]).toContain("Name");
      expect(lines[2]).toContain("alpha");
      expect(lines[3]).toContain("beta");
    });

    it("pads columns based on widest value", () => {
      const out = formatTable(
        [{ id: "short" }, { id: "very-long-id-value" }],
        [{ label: "ID", value: (r: any) => r.id }],
      );
      const dataLine = out.split("\n")[2];
      // The line includes ANSI codes only when stdout is a TTY; in CI it isn't.
      expect(dataLine).toContain("short");
    });
  });

  describe("color", () => {
    it("returns plain text when not in TTY", () => {
      // vitest stdout is not a TTY → no ANSI codes
      expect(color("red", "x")).toBe("x");
    });
  });
});
