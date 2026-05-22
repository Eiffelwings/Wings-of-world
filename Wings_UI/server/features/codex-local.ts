import { spawn, type SpawnOptionsWithoutStdio } from "child_process";

const POWERSHELL_CODEX_WRAPPER = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$commandPath = $env:WINGS_OF_WORLD_CODEX_CLI_COMMAND
$rawArgs = $env:WINGS_OF_WORLD_CODEX_CLI_ARGS_JSON
$decodedArgs = ConvertFrom-Json -InputObject $rawArgs
$commandArgs = @($decodedArgs | ForEach-Object { [string]$_ })
$stdinText = [Console]::In.ReadToEnd()
if ($stdinText.Length -gt 0) {
  $stdinText | & $commandPath @commandArgs
} else {
  & $commandPath @commandArgs
}
exit $LASTEXITCODE
`.trim();

export type CodexSpawnPlan = {
  command: string;
  args: string[];
  env: Record<string, string>;
  shell: false;
};

function extractJsonErrorMessage(text: string) {
  const matches = text.matchAll(/ERROR:\s*(\{[^\r\n]*"error"[^\r\n]*\})/g);
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      const message = parsed?.error?.message || parsed?.message;
      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
    } catch {
      // Keep looking for a parseable JSON error.
    }
  }
  return "";
}

export function formatCodexCliError(stderr: string, stdout: string, code: number | null) {
  const combined = [stderr, stdout].filter(Boolean).join("\n").trim();
  const jsonMessage = extractJsonErrorMessage(combined);
  if (jsonMessage) return jsonMessage;

  const unsupportedModel = combined.match(/The '[^']+' model is not supported[^"\r\n]*/);
  if (unsupportedModel) return unsupportedModel[0];

  const usageLimit = combined.match(/You've hit your usage limit\.[^\r\n]*/);
  if (usageLimit) return usageLimit[0];

  const scrubbed = combined
    .replace(/#< CLIXML[\s\S]*?<\/Objs>/g, "")
    .replace(/<html[\s\S]*?<\/html>/gi, "[HTML response omitted]")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/\bWARN codex_core_(plugins|skills)::/.test(line))
    .filter((line) => !line.includes("Cloudflare"))
    .filter((line) => !line.includes("<script>"))
    .slice(0, 8)
    .join("\n")
    .trim();

  return scrubbed.slice(0, 1200) || `codex exited with code ${code ?? "unknown"}`;
}

function encodePowerShellCommand(script: string) {
  return Buffer.from(script, "utf16le").toString("base64");
}

export function buildCodexSpawnPlan(
  codexArgs: string[],
  options?: {
    platform?: NodeJS.Platform;
    command?: string;
  },
): CodexSpawnPlan {
  const platform = options?.platform || process.platform;
  const codexCommand =
    options?.command?.trim() ||
    process.env.WINGS_OF_WORLD_CODEX_CLI?.trim() ||
    "codex";

  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodePowerShellCommand(POWERSHELL_CODEX_WRAPPER),
      ],
      env: {
        WINGS_OF_WORLD_CODEX_CLI_COMMAND: codexCommand,
        WINGS_OF_WORLD_CODEX_CLI_ARGS_JSON: JSON.stringify(codexArgs),
      },
      shell: false,
    };
  }

  return {
    command: codexCommand,
    args: codexArgs,
    env: {},
    shell: false,
  };
}

export function spawnCodexCli(
  codexArgs: string[],
  options: SpawnOptionsWithoutStdio,
) {
  const plan = buildCodexSpawnPlan(codexArgs);
  return spawn(plan.command, plan.args, {
    ...options,
    env: {
      ...options.env,
      ...plan.env,
    },
    shell: plan.shell,
  });
}
