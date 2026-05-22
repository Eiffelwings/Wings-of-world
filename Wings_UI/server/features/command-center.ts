export type CommandRoute = "chat" | "workflow" | "tool" | "human";
export type CommandRiskLevel = "low" | "medium" | "high";
export type CommandPriority = "low" | "medium" | "high" | "critical";

export interface CommandPlan {
  title: string;
  objective: string;
  route: CommandRoute;
  priority: CommandPriority;
  riskLevel: CommandRiskLevel;
  owner?: string;
  checklist: string[];
  acceptanceCriteria: string[];
  suggestedNextStep: string;
  automation?: {
    kind: "tool" | "workflow" | "chat";
    label: string;
    href?: string;
  };
  detailsMarkdown: string;
}

export interface CommandPlanInput {
  command: string;
  owner?: string;
  source?: string;
}

const ROUTE_LABELS: Record<CommandRoute, string> = {
  chat: "Assistant response",
  workflow: "Workflow automation",
  tool: "Tool execution",
  human: "Human operation",
};

function hasAny(value: string, words: string[]) {
  return words.some((word) => value.includes(word));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function makeTitle(command: string) {
  const firstLine = normalizeWhitespace(command.split(/\r?\n/).find((line) => line.trim()) || command);
  if (firstLine.length <= 96) return firstLine;
  return `${firstLine.slice(0, 93).trim()}...`;
}

function pickRoute(command: string): CommandRoute {
  const lower = command.toLowerCase();

  if (
    hasAny(lower, [
      "approve",
      "approval",
      "credential",
      "credentials",
      "deploy",
      "login",
      "password",
      "phone",
      "physical",
      "production",
      "restart",
      "secret",
      "server",
      "sign in",
      "token",
    ])
  ) {
    return "human";
  }

  if (
    hasAny(lower, [
      "automate",
      "automation",
      "pipeline",
      "repeat",
      "schedule",
      "trigger",
      "webhook",
      "workflow",
    ])
  ) {
    return "workflow";
  }

  if (
    hasAny(lower, [
      "calculate",
      "directory",
      "file",
      "find",
      "grep",
      "inspect",
      "json",
      "list",
      "read",
      "search",
      "tool",
    ])
  ) {
    return "tool";
  }

  if (
    hasAny(lower, [
      "answer",
      "draft",
      "explain",
      "plan",
      "rewrite",
      "summarize",
      "translate",
      "write",
    ])
  ) {
    return "chat";
  }

  return "human";
}

function pickRiskLevel(command: string): CommandRiskLevel {
  const lower = command.toLowerCase();
  if (
    hasAny(lower, [
      "delete",
      "deploy",
      "kill",
      "overwrite",
      "password",
      "payment",
      "production",
      "remove",
      "restart",
      "secret",
      "token",
      "wipe",
    ])
  ) {
    return "high";
  }
  if (
    hasAny(lower, [
      "change",
      "configure",
      "connect",
      "execute",
      "install",
      "run",
      "send",
      "update",
      "write",
    ])
  ) {
    return "medium";
  }
  return "low";
}

function pickPriority(command: string, riskLevel: CommandRiskLevel): CommandPriority {
  const lower = command.toLowerCase();
  if (hasAny(lower, ["asap", "critical", "down", "outage", "production broken", "urgent"])) {
    return "critical";
  }
  if (riskLevel === "high") return "high";
  if (riskLevel === "low") return "medium";
  return "medium";
}

function buildChecklist(route: CommandRoute, riskLevel: CommandRiskLevel) {
  const routeAction: Record<CommandRoute, string> = {
    chat: "Draft the response and check it against the objective.",
    workflow: "Open the workflow builder, configure the required nodes, and run a test execution.",
    tool: "Pick the safest matching tool, run it with scoped inputs, and capture the output.",
    human: "Assign the real-world action to an owner and wait for a completion signal.",
  };
  const checklist = [
    "Confirm the objective, scope, and expected completion signal.",
    "Gather the minimum context needed to act without guessing.",
    routeAction[route],
    "Verify the result against the acceptance criteria.",
    "Record evidence, output, or a short completion note.",
    "Close the task or mark it blocked with the missing condition.",
  ];

  if (riskLevel === "high") {
    checklist.splice(2, 0, "Get explicit approval or create a rollback/backup path before making changes.");
  }

  return checklist;
}

function buildAcceptanceCriteria(route: CommandRoute) {
  const routeSignal: Record<CommandRoute, string> = {
    chat: "Final answer is ready to send and does not need hidden context.",
    workflow: "Workflow can be saved and run once without an error state.",
    tool: "Tool result is visible and matches the requested scope.",
    human: "Owner confirms the real-world action is complete.",
  };

  return [
    routeSignal[route],
    "No unexpected side effects, leaked secrets, or unrelated changes are introduced.",
    "Evidence is captured in the task details, audit trail, or linked output.",
  ];
}

function buildAutomation(route: CommandRoute): CommandPlan["automation"] {
  if (route === "tool") {
    return { kind: "tool", label: "Open Tools", href: "/tools" };
  }
  if (route === "workflow") {
    return { kind: "workflow", label: "Open Workflow Builder", href: "/workflow-builder" };
  }
  if (route === "chat") {
    return { kind: "chat", label: "Open Chat", href: "/chat" };
  }
  return undefined;
}

function buildNextStep(route: CommandRoute, riskLevel: CommandRiskLevel) {
  if (riskLevel === "high") {
    return "Confirm approval and rollback conditions, then start execution with evidence capture enabled.";
  }
  if (route === "workflow") return "Build or select the workflow, then run a test with safe sample input.";
  if (route === "tool") return "Open the tool registry, choose the scoped tool, then run the smallest useful command.";
  if (route === "chat") return "Open chat with this objective and produce the final response.";
  return "Assign an owner and wait for a clear completion signal.";
}

function buildDetailsMarkdown(plan: Omit<CommandPlan, "detailsMarkdown">) {
  return [
    `Objective: ${plan.objective}`,
    `Route: ${ROUTE_LABELS[plan.route]}`,
    `Risk: ${plan.riskLevel}`,
    `Priority: ${plan.priority}`,
    "",
    "Checklist:",
    ...plan.checklist.map((item) => `- ${item}`),
    "",
    "Acceptance criteria:",
    ...plan.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    `Next step: ${plan.suggestedNextStep}`,
  ].join("\n");
}

export function buildCommandPlan(input: CommandPlanInput): CommandPlan {
  const command = typeof input.command === "string" ? input.command.trim().slice(0, 4000) : "";
  if (!command) {
    throw new Error("command is required");
  }

  const route = pickRoute(command);
  const riskLevel = pickRiskLevel(command);
  const priority = pickPriority(command, riskLevel);
  const checklist = buildChecklist(route, riskLevel);
  const acceptanceCriteria = buildAcceptanceCriteria(route);
  const suggestedNextStep = buildNextStep(route, riskLevel);
  const basePlan = {
    title: makeTitle(command),
    objective: command,
    route,
    priority,
    riskLevel,
    owner:
      typeof input.owner === "string" && input.owner.trim()
        ? input.owner.trim().slice(0, 120)
        : undefined,
    checklist,
    acceptanceCriteria,
    suggestedNextStep,
    automation: buildAutomation(route),
  };

  return {
    ...basePlan,
    detailsMarkdown: buildDetailsMarkdown(basePlan),
  };
}
