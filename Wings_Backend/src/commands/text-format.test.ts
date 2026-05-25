import { describe, expect, it } from "vitest";
import { shortenText } from "./text-format.js";

describe("shortenText", () => {
  it("returns original text when it fits", () => {
    expect(shortenText("mechanical-wings", 16)).toBe("mechanical-wings");
  });

  it("truncates and appends ellipsis when over limit", () => {
    expect(shortenText("mechanical-wings-status-output", 10)).toBe("mechanical-wings-…");
  });

  it("counts multi-byte characters correctly", () => {
    expect(shortenText("hello🙂world", 7)).toBe("hello🙂…");
  });
});
