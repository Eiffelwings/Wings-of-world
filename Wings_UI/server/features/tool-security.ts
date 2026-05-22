export type ToolRiskLevel = "low" | "medium" | "high";

export interface ToolSecurityDescriptor {
  riskLevel: ToolRiskLevel;
  requiresConfirmation?: boolean;
}

export function toolRequiresConfirmation(tool: ToolSecurityDescriptor): boolean {
  return tool.requiresConfirmation === true || tool.riskLevel === "high";
}

export function canUseToolAgentically(tool: ToolSecurityDescriptor): boolean {
  return !toolRequiresConfirmation(tool);
}

export function applyToolSecurityPolicy<T extends ToolSecurityDescriptor>(tool: T): T & { requiresConfirmation: boolean } {
  return {
    ...tool,
    requiresConfirmation: toolRequiresConfirmation(tool),
  };
}
