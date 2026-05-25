import { describe, expect, it } from "vitest";
import { buildCommandPlan } from "../features/command-center.js";

describe("command center", () => {
  it("rejects empty commands", () => {
    expect(() => buildCommandPlan({ command: "   " })).toThrow("command is required");
  });

  it("routes production restart work to a high-risk human operation", () => {
    const plan = buildCommandPlan({
      command: "Restart the production Telegram bridge urgently and verify health.",
      owner: "ops",
    });

    expect(plan.route).toBe("human");
    expect(plan.riskLevel).toBe("high");
    expect(plan.priority).toBe("critical");
    expect(plan.owner).toBe("ops");
    expect(plan.checklist.join(" ")).toContain("approval");
  });

  it("routes scoped file inspection to tools", () => {
    const plan = buildCommandPlan({
      command: "Search the project files for old standalone product names.",
    });

    expect(plan.route).toBe("tool");
    expect(plan.automation?.href).toBe("/tools");
  });

  it("routes repeatable work to workflow automation", () => {
    const plan = buildCommandPlan({
      command: "Create a workflow that repeats every morning and summarizes system readiness.",
    });

    expect(plan.route).toBe("workflow");
    expect(plan.automation?.href).toBe("/workflow-builder");
    expect(plan.detailsMarkdown).toContain("Acceptance criteria:");
  });
});
