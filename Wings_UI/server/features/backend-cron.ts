import type { ScheduledTask } from "./scheduled-tasks.js";

export interface BackendCronCommand {
  command: string;
  args: string[];
  display: string;
}

function quoteCommandPart(value: string): string {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function formatBackendCronInterval(intervalMs: number): string {
  const ms = Math.max(1, Math.floor(intervalMs));
  const units = [
    { suffix: "d", size: 24 * 60 * 60_000 },
    { suffix: "h", size: 60 * 60_000 },
    { suffix: "m", size: 60_000 },
    { suffix: "s", size: 1000 },
  ];
  for (const unit of units) {
    if (ms >= unit.size && ms % unit.size === 0) {
      return `${ms / unit.size}${unit.suffix}`;
    }
  }
  return `${ms}ms`;
}

export function buildBackendCronAgentArgs(task: ScheduledTask): string[] {
  if (task.kind !== "agent") {
    throw new Error("Only agent schedules can be registered in Wings_Backend cron.");
  }
  const name = task.name.trim();
  const message = task.prompt?.trim();
  if (!name) throw new Error("Task name is required.");
  if (!message) throw new Error("Agent task prompt is required.");

  const args = ["cron", "agent", "--name", name, "--message", message];
  if (task.scheduleMode === "cron") {
    const expression = task.cronExpression?.trim();
    if (!expression) throw new Error("Cron expression is required.");
    args.push("--cron", expression, "--tz", task.timezone || "Asia/Bangkok");
  } else {
    args.push("--every", formatBackendCronInterval(task.intervalMs));
  }
  if (task.model?.trim()) args.push("--model", task.model.trim());
  if (task.enabled === false) args.push("--disabled");
  return args;
}

export function redactBackendCronAgentArgs(args: string[]): string[] {
  const redacted = [...args];
  for (let index = 0; index < redacted.length - 1; index += 1) {
    if (redacted[index] === "--message") {
      redacted[index + 1] = "[redacted]";
      index += 1;
    }
  }
  return redacted;
}

export function formatBackendCronCommand(command: string, args: string[]): BackendCronCommand {
  return {
    command,
    args,
    display: [command, ...args].map(quoteCommandPart).join(" "),
  };
}
