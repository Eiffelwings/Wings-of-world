import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCodexSpawnPlan, formatCodexCliError } from "../features/codex-local.js";

describe("codex local spawn plan", () => {
  it("wraps Windows Codex calls without shell=true and preserves spaced args", () => {
    const plan = buildCodexSpawnPlan(
      ["exec", "-C", "C:\\Path\\To\\Wings Of World", "-"],
      { platform: "win32", command: "codex" },
    );

    expect(plan.command).toBe("powershell.exe");
    expect(plan.shell).toBe(false);
    expect(plan.args).toContain("-EncodedCommand");
    expect(plan.env.WINGS_OF_WORLD_CODEX_CLI_COMMAND).toBe("codex");
    expect(JSON.parse(plan.env.WINGS_OF_WORLD_CODEX_CLI_ARGS_JSON)).toContain(
      "C:\\Path\\To\\Wings Of World",
    );
  });

  it("uses direct exec on non-Windows platforms", () => {
    const plan = buildCodexSpawnPlan(["exec", "-"], {
      platform: "linux",
      command: "/usr/local/bin/codex",
    });

    expect(plan).toEqual({
      command: "/usr/local/bin/codex",
      args: ["exec", "-"],
      env: {},
      shell: false,
    });
  });
});

describe("codex local error formatting", () => {
  it("extracts model support errors from noisy CLI output", () => {
    const message = formatCodexCliError(
      `2026 WARN codex_core_plugins::manager: failed <html>secret challenge</html>
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5-mini' model is not supported when using Codex with a ChatGPT account."}}
#< CLIXML<Objs></Objs>`,
      "",
      1,
    );

    expect(message).toBe(
      "The 'gpt-5-mini' model is not supported when using Codex with a ChatGPT account.",
    );
  });

  it("truncates generic noisy errors", () => {
    const message = formatCodexCliError(
      [
        "2026 WARN codex_core_plugins::manager: failed",
        "<html>huge page</html>",
        "actual failure",
      ].join("\n"),
      "",
      1,
    );

    expect(message).toContain("actual failure");
    expect(message).not.toContain("huge page");
  });

  it("extracts local account usage limit errors", () => {
    const message = formatCodexCliError(
      "ERROR: You've hit your usage limit. Upgrade to Pro or try again later.\nERROR: You've hit your usage limit. Upgrade to Pro or try again later.",
      "",
      1,
    );

    expect(message).toBe("You've hit your usage limit. Upgrade to Pro or try again later.");
  });
});

describe("codex local server routing", () => {
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), "server", "index.ts"), "utf8");

  it("routes agentic chat through the Codex CLI instead of HTTP fetch", () => {
    expect(serverSource).toContain('cfg.provider === "codex_local"');
    expect(serverSource).toContain("callCodexLocal(cfg, messages, modelOverride)");
  });

  it("disables cascade routing for the CLI-backed Codex local provider", () => {
    expect(serverSource).toContain('cfg.provider === "codex_local" ? "off"');
  });
});
