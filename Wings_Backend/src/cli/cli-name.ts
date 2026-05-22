import path from "node:path";

export const DEFAULT_CLI_NAME = "wings-of-world-backend";

const KNOWN_CLI_NAMES = new Set([DEFAULT_CLI_NAME, "mechanical-wings"]);
const CLI_PREFIX_RE =
  /^(?:((?:pnpm|npm|bunx|npx)\s+))?(mechanical-wings|wings-of-world-backend)\b/;

export function resolveCliName(argv: string[] = process.argv): string {
  const argv1 = argv[1];
  if (!argv1) {
    return DEFAULT_CLI_NAME;
  }
  const base = path.basename(argv1).trim();
  if (KNOWN_CLI_NAMES.has(base)) {
    return base;
  }
  const baseWithoutExtension = base.replace(/\.(?:mjs|js|cjs|cmd|ps1|exe)$/i, "");
  if (KNOWN_CLI_NAMES.has(baseWithoutExtension)) {
    return baseWithoutExtension;
  }
  return DEFAULT_CLI_NAME;
}

export function replaceCliName(command: string, cliName = resolveCliName()): string {
  if (!command.trim()) {
    return command;
  }
  if (!CLI_PREFIX_RE.test(command)) {
    return command;
  }
  return command.replace(CLI_PREFIX_RE, (_match, runner: string | undefined) => {
    return `${runner ?? ""}${cliName}`;
  });
}
