import { describe, expect, it } from "vitest";
import { coerceIdentityValue } from "./assistant-identity-values.js";

describe("shared/assistant-identity-values", () => {
  it("returns undefined for missing or blank values", () => {
    expect(coerceIdentityValue(undefined, 10)).toBeUndefined();
    expect(coerceIdentityValue("   ", 10)).toBeUndefined();
    expect(coerceIdentityValue(42 as unknown as string, 10)).toBeUndefined();
  });

  it("trims values and preserves strings within the limit", () => {
    expect(coerceIdentityValue("  Wings  ", 20)).toBe("Wings");
    expect(coerceIdentityValue("  Wings  ", 8)).toBe("Wings");
  });

  it("truncates overlong trimmed values at the exact limit", () => {
    expect(coerceIdentityValue("  Wings Assistant  ", 8)).toBe("Wings As");
  });

  it("returns an empty string when truncating to a non-positive limit", () => {
    expect(coerceIdentityValue("  Wings  ", 0)).toBe("");
    expect(coerceIdentityValue("  Wings  ", -1)).toBe("");
  });
});
