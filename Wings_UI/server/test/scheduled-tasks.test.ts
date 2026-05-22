import { describe, it, expect } from "vitest";
import {
  dueForRun,
  parseCronExpression,
  previewScheduledTask,
  runScheduledTask,
  validateScheduledTaskInput,
  MIN_INTERVAL_MS,
  SCHEDULE_TEMPLATES,
  type ScheduledTask,
} from "../features/scheduled-tasks.js";
import { buildBackendCronAgentArgs, formatBackendCronInterval, redactBackendCronAgentArgs } from "../features/backend-cron.js";

const baseTask: ScheduledTask = {
  id: "t1",
  name: "demo",
  kind: "chat",
  intervalMs: 60_000,
  prompt: "hello",
  enabled: true,
  createdAt: new Date().toISOString(),
};

describe("scheduled-tasks", () => {
  describe("dueForRun", () => {
    it("returns false when disabled", () => {
      expect(dueForRun({ ...baseTask, enabled: false }, Date.now())).toBe(false);
    });

    it("returns true when never run", () => {
      expect(dueForRun(baseTask, Date.now())).toBe(true);
    });

    it("returns false when interval has not elapsed", () => {
      const lastRunAt = new Date().toISOString();
      expect(dueForRun({ ...baseTask, lastRunAt }, Date.now())).toBe(false);
    });

    it("returns true once interval has elapsed", () => {
      const lastRunAt = new Date(Date.now() - 120_000).toISOString();
      expect(dueForRun({ ...baseTask, lastRunAt }, Date.now())).toBe(true);
    });

    it("enforces a minimum interval", () => {
      const lastRunAt = new Date(Date.now() - 5_000).toISOString();
      expect(dueForRun({ ...baseTask, intervalMs: 1000, lastRunAt }, Date.now())).toBe(false);
    });
  });

  describe("runScheduledTask", () => {
    it("invokes runChat for chat tasks", async () => {
      let called = false;
      const outcome = await runScheduledTask(baseTask, {
        runChat: async () => {
          called = true;
          return { content: "ok" };
        },
        sendWebhook: async () => ({ ok: true, status: 200 }),
      });
      expect(called).toBe(true);
      expect(outcome.ok).toBe(true);
      expect(outcome.summary).toBe("ok");
    });

    it("returns error when chat task missing prompt", async () => {
      const outcome = await runScheduledTask(
        { ...baseTask, prompt: undefined },
        {
          runChat: async () => ({ content: "n/a" }),
          sendWebhook: async () => ({ ok: true, status: 200 }),
        },
      );
      expect(outcome.ok).toBe(false);
    });

    it("invokes sendWebhook for webhook tasks", async () => {
      let url = "";
      const outcome = await runScheduledTask(
        { ...baseTask, kind: "webhook", webhookUrl: "https://example.test/hook", prompt: undefined },
        {
          runChat: async () => ({ content: "" }),
          sendWebhook: async (u: string) => {
            url = u;
            return { ok: true, status: 202 };
          },
        },
      );
      expect(url).toBe("https://example.test/hook");
      expect(outcome.summary).toBe("HTTP 202");
    });

    it("dispatches command tasks into the command queue", async () => {
      let command = "";
      const outcome = await runScheduledTask(
        { ...baseTask, kind: "command", prompt: "Check readiness and create evidence", owner: "ops" },
        {
          runChat: async () => ({ content: "" }),
          sendWebhook: async () => ({ ok: true, status: 200 }),
          dispatchCommand: async (_task, c) => {
            command = c;
            return { taskId: "task_1", route: "tool", riskLevel: "low" };
          },
        },
      );
      expect(command).toContain("Check readiness");
      expect(outcome.ok).toBe(true);
      expect(outcome.summary).toContain("task_1");
    });

    it("runs autonomous agent tasks", async () => {
      let prompt = "";
      const outcome = await runScheduledTask(
        { ...baseTask, kind: "agent", prompt: "Inspect readiness", model: "gpt-5.4" },
        {
          runChat: async () => ({ content: "" }),
          sendWebhook: async () => ({ ok: true, status: 200 }),
          runAgent: async (p, model) => {
            prompt = `${p}:${model}`;
            return { engine: "Hermes", content: "readiness checked" };
          },
        },
      );
      expect(prompt).toBe("Inspect readiness:gpt-5.4");
      expect(outcome.ok).toBe(true);
      expect(outcome.summary).toContain("Hermes");
    });
  });

  describe("validateScheduledTaskInput", () => {
    it("accepts valid chat input", () => {
      const result = validateScheduledTaskInput({ name: "x", prompt: "say hi", intervalMs: 30_000 });
      expect(result.ok).toBe(true);
    });

    it("rejects chat task without prompt", () => {
      const result = validateScheduledTaskInput({ kind: "chat" });
      expect(result.ok).toBe(false);
    });

    it("rejects webhook task without URL", () => {
      const result = validateScheduledTaskInput({ kind: "webhook" });
      expect(result.ok).toBe(false);
    });

    it("clamps interval below minimum", () => {
      const result = validateScheduledTaskInput({ prompt: "p", intervalMs: 100 });
      if (result.ok) {
        expect(result.task.intervalMs).toBe(MIN_INTERVAL_MS);
      } else {
        throw new Error("expected ok");
      }
    });

    it("accepts macro, command, and agent task kinds", () => {
      expect(validateScheduledTaskInput({ kind: "macro", prompt: "nightly-cleanup" }).ok).toBe(true);
      expect(validateScheduledTaskInput({ kind: "command", prompt: "Create a daily readiness task" }).ok).toBe(true);
      expect(validateScheduledTaskInput({ kind: "agent", prompt: "Investigate blockers" }).ok).toBe(true);
    });

    it("validates cron expressions and previews future runs", () => {
      const result = validateScheduledTaskInput({
        kind: "command",
        name: "daily readiness",
        prompt: "Check readiness",
        scheduleMode: "cron",
        cronExpression: "0 9 * * 1-5",
        timezone: "Asia/Bangkok",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected ok");
      parseCronExpression(result.task.cronExpression || "");
      const runs = previewScheduledTask({
        id: "preview",
        createdAt: new Date().toISOString(),
        ...result.task,
      });
      expect(runs).toHaveLength(5);
    });

    it("keeps built-in agent templates valid", () => {
      for (const template of SCHEDULE_TEMPLATES) {
        const result = validateScheduledTaskInput(template.task);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(`${template.id}: ${result.error}`);
        expect(result.task.kind).toBe("agent");
      }
    });
  });

  describe("backend cron command helpers", () => {
    it("formats intervals for the backend CLI", () => {
      expect(formatBackendCronInterval(15 * 60_000)).toBe("15m");
      expect(formatBackendCronInterval(2 * 60 * 60_000)).toBe("2h");
      expect(formatBackendCronInterval(750)).toBe("750ms");
    });

    it("builds Wings_Backend cron agent args", () => {
      const args = buildBackendCronAgentArgs({
        ...baseTask,
        kind: "agent",
        name: "Daily readiness",
        prompt: "Inspect readiness",
        scheduleMode: "cron",
        cronExpression: "0 9 * * 1-5",
        timezone: "Asia/Bangkok",
        model: "gpt-5.4",
      });
      expect(args).toEqual([
        "cron",
        "agent",
        "--name",
        "Daily readiness",
        "--message",
        "Inspect readiness",
        "--cron",
        "0 9 * * 1-5",
        "--tz",
        "Asia/Bangkok",
        "--model",
        "gpt-5.4",
      ]);
    });

    it("redacts agent prompts from displayed backend commands", () => {
      const args = redactBackendCronAgentArgs([
        "cron",
        "agent",
        "--name",
        "Daily readiness",
        "--message",
        "secret prompt",
        "--cron",
        "0 9 * * *",
      ]);
      expect(args).toContain("[redacted]");
      expect(args).not.toContain("secret prompt");
    });
  });
});
