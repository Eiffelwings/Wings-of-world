import { readJsonSafe, writeJsonSync } from "../lib/storage.js";

export type ScheduledTaskKind = "chat" | "webhook" | "macro" | "command" | "agent";
export type ScheduledTaskStatus = "success" | "error";
export type ScheduledTaskScheduleMode = "interval" | "cron";

export interface ScheduledTaskRunRecord {
  at: string;
  status: ScheduledTaskStatus;
  summary: string;
  durationMs?: number;
}

export interface ScheduledTaskTemplate {
  id: string;
  label: string;
  description: string;
  task: {
    name: string;
    kind: ScheduledTaskKind;
    scheduleMode: ScheduledTaskScheduleMode;
    intervalMs?: number;
    cronExpression?: string;
    timezone?: string;
    prompt?: string;
    model?: string;
    owner?: string;
    enabled?: boolean;
  };
}

export interface ScheduledTask {
  id: string;
  name: string;
  kind: ScheduledTaskKind;
  scheduleMode?: ScheduledTaskScheduleMode;
  intervalMs: number;
  cronExpression?: string;
  timezone?: string;
  prompt?: string; // chat prompt, macro name, command text, or autonomous agent task
  model?: string;
  owner?: string;
  webhookUrl?: string;
  webhookPayload?: unknown;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  lastStatus?: ScheduledTaskStatus;
  lastSummary?: string;
  lastDurationMs?: number;
  nextRunAt?: string;
  runCount?: number;
  failureCount?: number;
  consecutiveFailures?: number;
  recentRuns?: ScheduledTaskRunRecord[];
}

interface CronField {
  min: number;
  max: number;
  values: Set<number>;
}

interface ParsedCronExpression {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

export const MIN_INTERVAL_MS = 10_000;
export const DEFAULT_TIMEZONE = "Asia/Bangkok";
const NEXT_RUN_SCAN_MINUTES = 60 * 24 * 366;

export const SCHEDULE_PRESETS = [
  { id: "5m", label: "Every 5 minutes", scheduleMode: "interval" as const, intervalMs: 5 * 60_000 },
  { id: "15m", label: "Every 15 minutes", scheduleMode: "interval" as const, intervalMs: 15 * 60_000 },
  { id: "hourly", label: "Hourly", scheduleMode: "cron" as const, cronExpression: "0 * * * *" },
  { id: "daily-9", label: "Daily at 09:00", scheduleMode: "cron" as const, cronExpression: "0 9 * * *" },
  { id: "weekdays-9", label: "Weekdays at 09:00", scheduleMode: "cron" as const, cronExpression: "0 9 * * 1-5" },
];

export const SCHEDULE_TEMPLATES: ScheduledTaskTemplate[] = [
  {
    id: "daily-readiness-agent",
    label: "Daily readiness agent",
    description: "Checks app readiness, blockers, and next actions every weekday morning.",
    task: {
      name: "Daily readiness agent",
      kind: "agent",
      scheduleMode: "cron",
      cronExpression: "0 9 * * 1-5",
      timezone: DEFAULT_TIMEZONE,
      intervalMs: 15 * 60_000,
      owner: "ops",
      enabled: true,
      prompt: [
        "Run an autonomous Wings Of World readiness check.",
        "Inspect UI health, backend cron health, failing tasks, missing configuration, and release blockers.",
        "Return a concise evidence summary with exact next actions.",
      ].join("\n"),
    },
  },
  {
    id: "backend-watchdog-agent",
    label: "Backend watchdog",
    description: "Watches Wings_Backend gateway, cron, and automation health twice an hour.",
    task: {
      name: "Backend watchdog agent",
      kind: "agent",
      scheduleMode: "cron",
      cronExpression: "*/30 * * * *",
      timezone: DEFAULT_TIMEZONE,
      intervalMs: 30 * 60_000,
      owner: "backend",
      enabled: true,
      prompt: [
        "Inspect Wings_Backend gateway status, cron jobs, recent run failures, and automation blockers.",
        "Confirm what is healthy, what is degraded, and what action should be taken next.",
        "Include concrete evidence in the response.",
      ].join("\n"),
    },
  },
  {
    id: "memory-sync-agent",
    label: "Memory sync agent",
    description: "Keeps memory and human-action context tidy at the end of the day.",
    task: {
      name: "Memory sync agent",
      kind: "agent",
      scheduleMode: "cron",
      cronExpression: "0 18 * * 1-5",
      timezone: DEFAULT_TIMEZONE,
      intervalMs: 24 * 60 * 60_000,
      owner: "knowledge",
      enabled: true,
      prompt: [
        "Review Wings Of World memory, human actions, audit entries, and recent automation output.",
        "Summarize useful state, stale items, and follow-up work.",
        "Do not delete anything without an explicit approval trail.",
      ].join("\n"),
    },
  },
  {
    id: "release-quality-agent",
    label: "Release quality agent",
    description: "Runs a release-quality check before end-of-day delivery windows.",
    task: {
      name: "Release quality agent",
      kind: "agent",
      scheduleMode: "cron",
      cronExpression: "30 17 * * 1-5",
      timezone: DEFAULT_TIMEZONE,
      intervalMs: 24 * 60 * 60_000,
      owner: "release",
      enabled: true,
      prompt: [
        "Verify Wings Of World release quality.",
        "Check tests, build status, branding consistency, release packaging risks, and unresolved blockers.",
        "Return pass/fail evidence and the smallest next action list.",
      ].join("\n"),
    },
  },
  {
    id: "line-inbox-digest-agent",
    label: "LINE inbox digest",
    description: "Builds a daily reply queue from LINE/customer messages without sending anything automatically.",
    task: {
      name: "LINE inbox digest agent",
      kind: "agent",
      scheduleMode: "cron",
      cronExpression: "0 10 * * 1-6",
      timezone: DEFAULT_TIMEZONE,
      intervalMs: 24 * 60 * 60_000,
      owner: "customer-care",
      enabled: true,
      prompt: [
        "Prepare a LINE/customer inbox digest for a small operator.",
        "Review available messages, notes, and recent customer tasks.",
        "Return urgent replies, payment/order questions, messages that need human confirmation, and safe-to-delay replies.",
        "Do not send messages automatically; produce drafts and evidence only.",
      ].join("\n"),
    },
  },
  {
    id: "small-operator-daily-plan-agent",
    label: "Small operator daily plan",
    description: "Creates a short owner plan that protects cash flow, customer trust, and family time.",
    task: {
      name: "Small operator daily plan agent",
      kind: "agent",
      scheduleMode: "cron",
      cronExpression: "30 8 * * 1-6",
      timezone: DEFAULT_TIMEZONE,
      intervalMs: 24 * 60 * 60_000,
      owner: "owner",
      enabled: true,
      prompt: [
        "Create today's action plan for a small owner.",
        "Prioritize actions that protect cash flow, customer trust, delivery readiness, and family time.",
        "Return: must-do today, batch together, can wait, reply drafts to prepare, and a clear stop-work cutoff.",
        "Keep the output concise and practical.",
      ].join("\n"),
    },
  },
  {
    id: "family-time-handoff-agent",
    label: "Family time handoff",
    description: "Prepares an evening handoff so work can stop cleanly and resume tomorrow.",
    task: {
      name: "Family time handoff agent",
      kind: "agent",
      scheduleMode: "cron",
      cronExpression: "0 18 * * 1-6",
      timezone: DEFAULT_TIMEZONE,
      intervalMs: 24 * 60 * 60_000,
      owner: "owner",
      enabled: true,
      prompt: [
        "Prepare an end-of-day work handoff for a small operator.",
        "Separate emergencies from work that can wait until tomorrow.",
        "Return: last replies to send, unresolved risks, tomorrow's first task, and a short family-time boundary message.",
        "Do not trigger external sends or high-risk tools.",
      ].join("\n"),
    },
  },
];

export function makeScheduledTaskId(): string {
  return `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadScheduledTasks(filePath: string): ScheduledTask[] {
  const raw = readJsonSafe<unknown>(filePath, []);
  return Array.isArray(raw) ? raw.map(normalizeStoredTask).filter(Boolean) as ScheduledTask[] : [];
}

export function saveScheduledTasks(filePath: string, tasks: ScheduledTask[]): void {
  writeJsonSync(filePath, tasks);
}

function normalizeStoredTask(task: unknown): ScheduledTask | null {
  if (!task || typeof task !== "object") return null;
  const entry = task as Partial<ScheduledTask>;
  if (typeof entry.id !== "string" || typeof entry.name !== "string") return null;
  const kind = normalizeKind(entry.kind);
  return {
    id: entry.id,
    name: entry.name,
    kind,
    scheduleMode: entry.scheduleMode === "cron" ? "cron" : "interval",
    intervalMs: Math.max(MIN_INTERVAL_MS, Number(entry.intervalMs) || 60_000),
    cronExpression: typeof entry.cronExpression === "string" ? normalizeCronExpression(entry.cronExpression) : undefined,
    timezone: normalizeTimezone(entry.timezone),
    prompt: typeof entry.prompt === "string" ? entry.prompt : undefined,
    model: typeof entry.model === "string" ? entry.model : undefined,
    owner: typeof entry.owner === "string" ? entry.owner : undefined,
    webhookUrl: typeof entry.webhookUrl === "string" ? entry.webhookUrl : undefined,
    webhookPayload: entry.webhookPayload,
    enabled: entry.enabled !== false,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
    lastRunAt: typeof entry.lastRunAt === "string" ? entry.lastRunAt : undefined,
    lastStatus: entry.lastStatus === "success" || entry.lastStatus === "error" ? entry.lastStatus : undefined,
    lastSummary: typeof entry.lastSummary === "string" ? entry.lastSummary : undefined,
    lastDurationMs: typeof entry.lastDurationMs === "number" ? entry.lastDurationMs : undefined,
    nextRunAt: typeof entry.nextRunAt === "string" ? entry.nextRunAt : undefined,
    runCount: typeof entry.runCount === "number" ? entry.runCount : 0,
    failureCount: typeof entry.failureCount === "number" ? entry.failureCount : 0,
    consecutiveFailures: typeof entry.consecutiveFailures === "number" ? entry.consecutiveFailures : 0,
    recentRuns: Array.isArray(entry.recentRuns)
      ? entry.recentRuns.filter(isRunRecord).slice(0, 10)
      : [],
  };
}

function isRunRecord(value: unknown): value is ScheduledTaskRunRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as ScheduledTaskRunRecord).at === "string" &&
      ((value as ScheduledTaskRunRecord).status === "success" ||
        (value as ScheduledTaskRunRecord).status === "error") &&
      typeof (value as ScheduledTaskRunRecord).summary === "string",
  );
}

function normalizeKind(value: unknown): ScheduledTaskKind {
  if (
    value === "webhook" ||
    value === "macro" ||
    value === "command" ||
    value === "agent" ||
    value === "chat"
  ) {
    return value;
  }
  return "chat";
}

function normalizeTimezone(value: unknown): string {
  const timezone = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function normalizeCronExpression(expression: string): string {
  const trimmed = expression.trim().toLowerCase();
  if (trimmed === "@hourly") return "0 * * * *";
  if (trimmed === "@daily" || trimmed === "@midnight") return "0 0 * * *";
  if (trimmed === "@weekly") return "0 0 * * 0";
  if (trimmed === "@monthly") return "0 0 1 * *";
  return trimmed.replace(/\s+/g, " ");
}

function parseCronField(raw: string, min: number, max: number, options?: { dayOfWeek?: boolean }): CronField {
  const values = new Set<number>();
  const add = (value: number) => {
    const normalized = options?.dayOfWeek && value === 7 ? 0 : value;
    if (normalized < min || normalized > max) {
      throw new Error(`Cron field value ${value} is outside ${min}-${max}`);
    }
    values.add(normalized);
  };

  for (const segment of raw.split(",")) {
    const part = segment.trim();
    if (!part) throw new Error("Cron field contains an empty segment");
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step <= 0) throw new Error("Cron step must be a positive integer");

    let start = min;
    let end = max;
    if (rangePart !== "*") {
      if (rangePart.includes("-")) {
        const [a, b] = rangePart.split("-").map(Number);
        if (!Number.isInteger(a) || !Number.isInteger(b) || a > b) {
          throw new Error(`Invalid cron range: ${rangePart}`);
        }
        start = a;
        end = b;
      } else {
        const single = Number(rangePart);
        if (!Number.isInteger(single)) throw new Error(`Invalid cron value: ${rangePart}`);
        start = single;
        end = single;
      }
    }

    for (let value = start; value <= end; value += step) add(value);
  }

  return { min, max, values };
}

export function parseCronExpression(expression: string): ParsedCronExpression {
  const normalized = normalizeCronExpression(expression);
  const fields = normalized.split(" ");
  if (fields.length !== 5) {
    throw new Error("Cron expression must have 5 fields: minute hour day month weekday");
  }
  return {
    minute: parseCronField(fields[0], 0, 59),
    hour: parseCronField(fields[1], 0, 23),
    dayOfMonth: parseCronField(fields[2], 1, 31),
    month: parseCronField(fields[3], 1, 12),
    dayOfWeek: parseCronField(fields[4], 0, 6, { dayOfWeek: true }),
  };
}

function getZonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  return {
    year,
    month,
    day,
    hour: Number(map.hour),
    minute: Number(map.minute),
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function cronMatches(parsed: ParsedCronExpression, date: Date, timezone: string): boolean {
  const parts = getZonedParts(date, timezone);
  return (
    parsed.minute.values.has(parts.minute) &&
    parsed.hour.values.has(parts.hour) &&
    parsed.dayOfMonth.values.has(parts.day) &&
    parsed.month.values.has(parts.month) &&
    parsed.dayOfWeek.values.has(parts.dayOfWeek)
  );
}

export function computeNextRunAt(task: ScheduledTask, now = Date.now()): string {
  if (task.scheduleMode === "cron" && task.cronExpression) {
    const parsed = parseCronExpression(task.cronExpression);
    const timezone = normalizeTimezone(task.timezone);
    const cursor = new Date(now + 60_000);
    cursor.setSeconds(0, 0);
    for (let i = 0; i < NEXT_RUN_SCAN_MINUTES; i += 1) {
      if (cronMatches(parsed, cursor, timezone)) return cursor.toISOString();
      cursor.setMinutes(cursor.getMinutes() + 1);
    }
    throw new Error("No cron run found within one year");
  }

  const base = task.lastRunAt ? new Date(task.lastRunAt).getTime() : now;
  return new Date(base + Math.max(MIN_INTERVAL_MS, task.intervalMs)).toISOString();
}

export function previewScheduledTask(task: ScheduledTask, count = 5, now = Date.now()): string[] {
  const runs: string[] = [];
  const draft: ScheduledTask = { ...task, lastRunAt: undefined };
  let cursor = now;
  for (let i = 0; i < Math.max(1, Math.min(10, count)); i += 1) {
    const next = computeNextRunAt(draft, cursor);
    runs.push(next);
    draft.lastRunAt = next;
    cursor = new Date(next).getTime() + 1;
  }
  return runs;
}

export function dueForRun(task: ScheduledTask, now: number): boolean {
  if (!task.enabled) return false;
  if (task.nextRunAt) {
    const next = new Date(task.nextRunAt).getTime();
    return Number.isFinite(next) ? now >= next : true;
  }
  const last = task.lastRunAt ? new Date(task.lastRunAt).getTime() : 0;
  return now - last >= Math.max(MIN_INTERVAL_MS, task.intervalMs);
}

export interface ScheduledTaskOutcome {
  ok: boolean;
  summary: string;
  durationMs?: number;
}

export interface ScheduledTaskDeps {
  runChat: (prompt: string, model?: string) => Promise<{ content: string }>;
  sendWebhook: (url: string, payload: unknown) => Promise<{ ok: boolean; status: number }>;
  runMacro?: (macroName: string) => Promise<{ status: string; finalState: string }>;
  runAgent?: (prompt: string, model?: string) => Promise<{ content: string; engine: string }>;
  dispatchCommand?: (task: ScheduledTask, command: string) => Promise<{ taskId: string; route: string; riskLevel: string }>;
}

export async function runScheduledTask(
  task: ScheduledTask,
  deps: ScheduledTaskDeps,
): Promise<ScheduledTaskOutcome> {
  const startedAt = Date.now();
  const done = (ok: boolean, summary: string): ScheduledTaskOutcome => ({
    ok,
    summary,
    durationMs: Date.now() - startedAt,
  });

  try {
    if (task.kind === "chat") {
      if (!task.prompt) return done(false, "Missing prompt");
      const result = await deps.runChat(task.prompt, task.model);
      return done(true, result.content.slice(0, 280));
    }
    if (task.kind === "webhook") {
      if (!task.webhookUrl) return done(false, "Missing webhook URL");
      const result = await deps.sendWebhook(task.webhookUrl, task.webhookPayload ?? {});
      return done(result.ok, `HTTP ${result.status}`);
    }
    if (task.kind === "macro") {
      if (!task.prompt) return done(false, "Missing macro name");
      if (!deps.runMacro) return done(false, "Macro runner not provided");
      const result = await deps.runMacro(task.prompt);
      return done(
        result.status === "completed" || result.status === "success",
        `Macro executed. State: ${result.finalState.slice(0, 100)}`,
      );
    }
    if (task.kind === "agent") {
      if (!task.prompt) return done(false, "Missing agent task");
      if (!deps.runAgent) return done(false, "Agent runner not provided");
      const result = await deps.runAgent(task.prompt, task.model);
      return done(true, `${result.engine}: ${result.content.slice(0, 240)}`);
    }
    if (task.kind === "command") {
      if (!task.prompt) return done(false, "Missing command");
      if (!deps.dispatchCommand) return done(false, "Command dispatcher not provided");
      const result = await deps.dispatchCommand(task, task.prompt);
      return done(true, `Command dispatched to ${result.taskId}. Route: ${result.route}. Risk: ${result.riskLevel}.`);
    }
    return done(false, `Unknown task kind: ${task.kind}`);
  } catch (error: any) {
    return done(false, error.message || String(error));
  }
}

export function recordScheduledTaskOutcome(task: ScheduledTask, outcome: ScheduledTaskOutcome, now = Date.now()): ScheduledTask {
  const timestamp = new Date(now).toISOString();
  const status: ScheduledTaskStatus = outcome.ok ? "success" : "error";
  const nextTask: ScheduledTask = {
    ...task,
    lastRunAt: timestamp,
    lastStatus: status,
    lastSummary: outcome.summary,
    lastDurationMs: outcome.durationMs,
    runCount: (task.runCount || 0) + 1,
    failureCount: (task.failureCount || 0) + (outcome.ok ? 0 : 1),
    consecutiveFailures: outcome.ok ? 0 : (task.consecutiveFailures || 0) + 1,
    recentRuns: [
      {
        at: timestamp,
        status,
        summary: outcome.summary,
        durationMs: outcome.durationMs,
      },
      ...(task.recentRuns || []),
    ].slice(0, 10),
  };

  nextTask.nextRunAt = computeNextRunAt(nextTask, now);
  return nextTask;
}

export interface ScheduledRunnerDeps extends ScheduledTaskDeps {
  filePath: string;
  onComplete?: (task: ScheduledTask, outcome: ScheduledTaskOutcome) => void;
  tickIntervalMs?: number;
}

export function startScheduledTaskRunner(deps: ScheduledRunnerDeps): () => void {
  let stopped = false;
  const running = new Set<string>();
  const tick = deps.tickIntervalMs ?? 5_000;
  const timer = setInterval(async () => {
    if (stopped) return;
    const tasks = loadScheduledTasks(deps.filePath);
    const now = Date.now();
    let dirty = false;
    for (const task of tasks) {
      if (running.has(task.id) || !dueForRun(task, now)) continue;
      running.add(task.id);
      try {
        const outcome = await runScheduledTask(task, deps);
        const nextTask = recordScheduledTaskOutcome(task, outcome);
        Object.assign(task, nextTask);
        dirty = true;
        deps.onComplete?.(task, outcome);
      } catch (err: any) {
        const outcome = { ok: false, summary: err?.message || String(err) };
        const nextTask = recordScheduledTaskOutcome(task, outcome);
        Object.assign(task, nextTask);
        dirty = true;
        deps.onComplete?.(task, outcome);
      } finally {
        running.delete(task.id);
      }
    }
    if (dirty) saveScheduledTasks(deps.filePath, tasks);
  }, tick);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function parseWebhookPayload(value: unknown) {
  if (typeof value !== "string") return value;
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return { text: value };
  }
}

export function validateScheduledTaskInput(body: any): { ok: true; task: Omit<ScheduledTask, "id" | "createdAt"> } | { ok: false; error: string } {
  const kind = normalizeKind(body?.kind);
  const name = String(body?.name || "").trim() || "Untitled task";
  const scheduleMode: ScheduledTaskScheduleMode =
    body?.scheduleMode === "cron" || typeof body?.cronExpression === "string" ? "cron" : "interval";
  const intervalMs = Math.max(MIN_INTERVAL_MS, Number(body?.intervalMs) || 60_000);
  const timezone = normalizeTimezone(body?.timezone);
  const cronExpression =
    scheduleMode === "cron"
      ? normalizeCronExpression(String(body?.cronExpression || "0 * * * *"))
      : undefined;

  if (scheduleMode === "cron") {
    try {
      parseCronExpression(cronExpression || "");
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  if (
    (kind === "chat" || kind === "macro" || kind === "command" || kind === "agent") &&
    !String(body?.prompt || "").trim()
  ) {
    return {
      ok: false,
      error:
        kind === "command"
          ? "command is required"
          : kind === "agent"
            ? "agent task is required"
            : "prompt is required",
    };
  }
  if (kind === "webhook" && !String(body?.webhookUrl || "").trim()) {
    return { ok: false, error: "webhookUrl is required" };
  }

  const task: Omit<ScheduledTask, "id" | "createdAt"> = {
    name: name.slice(0, 160),
    kind,
    scheduleMode,
    intervalMs,
    cronExpression,
    timezone,
    prompt:
      kind === "chat" || kind === "macro" || kind === "command" || kind === "agent"
        ? String(body.prompt).trim()
        : undefined,
    model: typeof body?.model === "string" && body.model.trim() ? body.model.trim() : undefined,
    owner: typeof body?.owner === "string" && body.owner.trim() ? body.owner.trim() : undefined,
    webhookUrl: kind === "webhook" ? String(body.webhookUrl).trim() : undefined,
    webhookPayload: kind === "webhook" ? parseWebhookPayload(body.webhookPayload) : undefined,
    enabled: body?.enabled !== false,
    nextRunAt: undefined,
    runCount: typeof body?.runCount === "number" ? body.runCount : 0,
    failureCount: typeof body?.failureCount === "number" ? body.failureCount : 0,
    consecutiveFailures: typeof body?.consecutiveFailures === "number" ? body.consecutiveFailures : 0,
    recentRuns: Array.isArray(body?.recentRuns) ? body.recentRuns.filter(isRunRecord).slice(0, 10) : [],
  };

  task.nextRunAt = computeNextRunAt({
    id: typeof body?.id === "string" ? body.id : "preview",
    createdAt: typeof body?.createdAt === "string" ? body.createdAt : new Date().toISOString(),
    ...task,
    lastRunAt: typeof body?.lastRunAt === "string" ? body.lastRunAt : undefined,
  });

  return { ok: true, task };
}
