import { describe, it, expect } from "vitest";
import {
  applyToolSecurityPolicy,
  canUseToolAgentically,
  toolRequiresConfirmation,
} from "../features/tool-security.js";

describe("tool security policy", () => {
  it("requires confirmation for all high-risk tools", () => {
    const tool = applyToolSecurityPolicy({ riskLevel: "high" as const });
    expect(tool.requiresConfirmation).toBe(true);
    expect(toolRequiresConfirmation(tool)).toBe(true);
    expect(canUseToolAgentically(tool)).toBe(false);
  });

  it("preserves explicit confirmation for lower-risk write tools", () => {
    const tool = applyToolSecurityPolicy({
      riskLevel: "medium" as const,
      requiresConfirmation: true,
    });
    expect(tool.requiresConfirmation).toBe(true);
    expect(canUseToolAgentically(tool)).toBe(false);
  });

  it("allows low-risk tools to be used agentically", () => {
    const tool = applyToolSecurityPolicy({ riskLevel: "low" as const });
    expect(tool.requiresConfirmation).toBe(false);
    expect(canUseToolAgentically(tool)).toBe(true);
  });
});
