import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { addGatewayClientOptions, callGatewayFromCli } from "../gateway-rpc.js";
import { parsePositiveIntOrUndefined } from "../program/helpers.js";
import { resolveCronCreateSchedule } from "./schedule-options.js";
import { handleCronCliError, printCronJson, warnIfCronSchedulerDisabled } from "./shared.js";

function registerCronToggleCommand(params: {
  cron: Command;
  name: "enable" | "disable";
  description: string;
  enabled: boolean;
}) {
  addGatewayClientOptions(
    params.cron
      .command(params.name)
      .description(params.description)
      .argument("<id>", "Job id")
      .action(async (id, opts) => {
        try {
          const res = await callGatewayFromCli("cron.update", opts, {
            id,
            patch: { enabled: params.enabled },
          });
          printCronJson(res);
          await warnIfCronSchedulerDisabled(opts);
        } catch (err) {
          handleCronCliError(err);
        }
      }),
  );
}

function registerCronAgentCommand(cron: Command) {
  addGatewayClientOptions(
    cron
      .command("agent")
      .description("Schedule an autonomous isolated agent job")
      .requiredOption("--name <name>", "Job name")
      .requiredOption("--message <text>", "Agent task prompt")
      .option("--at <when>", "Run once at time (ISO with offset, or +duration)")
      .option("--every <duration>", "Run every duration (e.g. 10m, 1h)")
      .option("--cron <expr>", "Cron expression (5-field or 6-field with seconds)")
      .option("--tz <iana>", "Timezone for cron expressions (IANA)", "")
      .option("--stagger <duration>", "Cron stagger window (e.g. 30s, 5m)")
      .option("--exact", "Disable cron staggering (set stagger to 0)", false)
      .option("--model <model>", "Model override for agent jobs")
      .option("--thinking <level>", "Thinking level (minimal|low|medium|high|xhigh)", "low")
      .option("--timeout-seconds <n>", "Timeout seconds for the agent job", "900")
      .option("--light-context", "Use lightweight bootstrap context", true)
      .option("--full-context", "Use full bootstrap context", false)
      .option("--announce", "Announce summary to the last/current chat target", false)
      .option("--disabled", "Create job disabled", false)
      .option("--json", "Output JSON", false)
      .action(async (opts) => {
        try {
          const name = typeof opts.name === "string" ? opts.name.trim() : "";
          const message = typeof opts.message === "string" ? opts.message.trim() : "";
          if (!name) {
            throw new Error("--name is required");
          }
          if (!message) {
            throw new Error("--message is required");
          }

          const schedule = resolveCronCreateSchedule({
            at: opts.at,
            cron: opts.cron,
            every: opts.every,
            exact: opts.exact,
            stagger: opts.stagger,
            tz: opts.tz,
          });
          const timeoutSeconds = parsePositiveIntOrUndefined(opts.timeoutSeconds);
          const payload = {
            kind: "agentTurn" as const,
            message,
            model:
              typeof opts.model === "string" && opts.model.trim() ? opts.model.trim() : undefined,
            thinking:
              typeof opts.thinking === "string" && opts.thinking.trim()
                ? opts.thinking.trim()
                : "low",
            timeoutSeconds,
            lightContext: opts.fullContext ? undefined : true,
          };
          const res = await callGatewayFromCli("cron.add", opts, {
            name,
            schedule,
            payload,
            sessionTarget: "isolated",
            wakeMode: "now",
            enabled: !opts.disabled,
            delivery: { mode: opts.announce ? "announce" : "none" },
          });
          printCronJson(res);
          await warnIfCronSchedulerDisabled(opts);
        } catch (err) {
          handleCronCliError(err);
        }
      }),
  );
}

export function registerCronSimpleCommands(cron: Command) {
  registerCronAgentCommand(cron);

  addGatewayClientOptions(
    cron
      .command("rm")
      .alias("remove")
      .alias("delete")
      .description("Remove a cron job")
      .argument("<id>", "Job id")
      .option("--json", "Output JSON", false)
      .action(async (id, opts) => {
        try {
          const res = await callGatewayFromCli("cron.remove", opts, { id });
          printCronJson(res);
        } catch (err) {
          handleCronCliError(err);
        }
      }),
  );

  registerCronToggleCommand({
    cron,
    name: "enable",
    description: "Enable a cron job",
    enabled: true,
  });
  registerCronToggleCommand({
    cron,
    name: "disable",
    description: "Disable a cron job",
    enabled: false,
  });

  addGatewayClientOptions(
    cron
      .command("runs")
      .description("Show cron run history (JSONL-backed)")
      .requiredOption("--id <id>", "Job id")
      .option("--limit <n>", "Max entries (default 50)", "50")
      .action(async (opts) => {
        try {
          const limitRaw = Number.parseInt(String(opts.limit ?? "50"), 10);
          const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
          const id = String(opts.id);
          const res = await callGatewayFromCli("cron.runs", opts, {
            id,
            limit,
          });
          printCronJson(res);
        } catch (err) {
          handleCronCliError(err);
        }
      }),
  );

  addGatewayClientOptions(
    cron
      .command("run")
      .description("Run a cron job now (debug)")
      .argument("<id>", "Job id")
      .option("--due", "Run only when due (default behavior in older versions)", false)
      .action(async (id, opts, command) => {
        try {
          if (command.getOptionValueSource("timeout") === "default") {
            opts.timeout = "600000";
          }
          const res = await callGatewayFromCli("cron.run", opts, {
            id,
            mode: opts.due ? "due" : "force",
          });
          printCronJson(res);
          const result = res as { ok?: boolean; ran?: boolean; enqueued?: boolean } | undefined;
          defaultRuntime.exit(result?.ok && (result?.ran || result?.enqueued) ? 0 : 1);
        } catch (err) {
          handleCronCliError(err);
        }
      }),
  );
}
