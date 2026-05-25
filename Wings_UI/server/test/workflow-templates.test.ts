import { describe, expect, it } from "vitest";
import {
  WORKFLOW_TEMPLATES,
  getStarterWorkflowRecords,
} from "../../shared/workflow-templates.js";

describe("workflow templates", () => {
  it("keeps a stable starter workflow for fresh installs", () => {
    const starters = getStarterWorkflowRecords();
    expect(starters).toHaveLength(1);
    expect(starters[0].id).toBe("starter-incident-triage");
    expect(starters[0].nodes.some((node) => node.type === "trigger")).toBe(true);
    expect(starters[0].nodes.some((node) => node.type === "output")).toBe(true);
  });

  it("ships the expected bundled workflow template catalog", () => {
    expect(WORKFLOW_TEMPLATES.map((template) => template.id)).toEqual([
      "summarize-text",
      "search-files-summary",
      "telegram-delivery",
      "conditional-routing",
      "loop-line-items",
    ]);
  });

  it("keeps every template internally connected", () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const nodeIds = new Set(template.nodes.map((node) => node.id));
      expect(template.nodes.some((node) => node.type === "trigger")).toBe(true);
      expect(template.nodes.some((node) => node.type === "output")).toBe(true);
      expect(template.defaultInput.trim()).not.toBe("");

      for (const edge of template.edges) {
        expect(nodeIds.has(edge.source), `${template.id} missing source ${edge.source}`).toBe(true);
        expect(nodeIds.has(edge.target), `${template.id} missing target ${edge.target}`).toBe(true);
      }
    }
  });

  it("includes explicit control-flow examples", () => {
    const condition = WORKFLOW_TEMPLATES.find((template) => template.id === "conditional-routing");
    const loop = WORKFLOW_TEMPLATES.find((template) => template.id === "loop-line-items");

    expect(condition?.edges.some((edge) => edge.branch === "true")).toBe(true);
    expect(condition?.edges.some((edge) => edge.branch === "false")).toBe(true);
    expect(loop?.nodes.some((node) => node.type === "loop")).toBe(true);
  });
});
