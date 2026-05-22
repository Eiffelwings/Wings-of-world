import { createSubsystemLogger } from "../logging/subsystem.js";

let log: ReturnType<typeof createSubsystemLogger> | null = null;
const loggedEnv = new Set<string>();

function getLog(): ReturnType<typeof createSubsystemLogger> {
  if (!log) {
    log = createSubsystemLogger("env");
  }
  return log;
}

type AcceptedEnvOption = {
  key: string;
  description: string;
  value?: string;
  redact?: boolean;
};

function formatEnvValue(value: string, redact?: boolean): string {
  if (redact) {
    return "<redacted>";
  }
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 160) {
    return singleLine;
  }
  return `${singleLine.slice(0, 160)}…`;
}

export function logAcceptedEnvOption(option: AcceptedEnvOption): void {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return;
  }
  if (loggedEnv.has(option.key)) {
    return;
  }
  const rawValue = option.value ?? process.env[option.key];
  if (!rawValue || !rawValue.trim()) {
    return;
  }
  loggedEnv.add(option.key);
  getLog().info(
    `env: ${option.key}=${formatEnvValue(rawValue, option.redact)} (${option.description})`,
  );
}

export function normalizeZaiEnv(): void {
  if (!process.env.ZAI_API_KEY?.trim() && process.env.Z_AI_API_KEY?.trim()) {
    process.env.ZAI_API_KEY = process.env.Z_AI_API_KEY;
  }
}

const WINGS_OF_WORLD_ENV_ALIASES = [
  ["WINGS_OF_WORLD_BACKEND_HOME", "OPENCLAW_HOME"],
  ["WINGS_OF_WORLD_HOME", "OPENCLAW_HOME"],
  ["WINGS_OF_WORLD_BACKEND_STATE_DIR", "OPENCLAW_STATE_DIR"],
  ["WINGS_OF_WORLD_STATE_DIR", "OPENCLAW_STATE_DIR"],
  ["WINGS_OF_WORLD_BACKEND_CONFIG_PATH", "OPENCLAW_CONFIG_PATH"],
  ["WINGS_OF_WORLD_CONFIG_PATH", "OPENCLAW_CONFIG_PATH"],
  ["WINGS_OF_WORLD_BACKEND_OAUTH_DIR", "OPENCLAW_OAUTH_DIR"],
  ["WINGS_OF_WORLD_OAUTH_DIR", "OPENCLAW_OAUTH_DIR"],
  ["WINGS_OF_WORLD_BACKEND_PROFILE", "OPENCLAW_PROFILE"],
  ["WINGS_OF_WORLD_BACKEND_GATEWAY_PORT", "OPENCLAW_GATEWAY_PORT"],
  ["WINGS_OF_WORLD_GATEWAY_PORT", "OPENCLAW_GATEWAY_PORT"],
  ["WINGS_OF_WORLD_BACKEND_GATEWAY_TOKEN", "OPENCLAW_GATEWAY_TOKEN"],
  ["WINGS_OF_WORLD_GATEWAY_TOKEN", "OPENCLAW_GATEWAY_TOKEN"],
  ["WINGS_OF_WORLD_BACKEND_GATEWAY_PASSWORD", "OPENCLAW_GATEWAY_PASSWORD"],
  ["WINGS_OF_WORLD_GATEWAY_PASSWORD", "OPENCLAW_GATEWAY_PASSWORD"],
  ["WINGS_OF_WORLD_BACKEND_ALLOW_INSECURE_PRIVATE_WS", "OPENCLAW_ALLOW_INSECURE_PRIVATE_WS"],
  ["WINGS_OF_WORLD_ALLOW_INSECURE_PRIVATE_WS", "OPENCLAW_ALLOW_INSECURE_PRIVATE_WS"],
  ["WINGS_OF_WORLD_BACKEND_BUNDLED_PLUGINS_DIR", "OPENCLAW_BUNDLED_PLUGINS_DIR"],
  ["WINGS_OF_WORLD_BUNDLED_PLUGINS_DIR", "OPENCLAW_BUNDLED_PLUGINS_DIR"],
] as const;

function copyEnvAliasIfMissing(primary: string, legacy: string): void {
  const primaryValue = process.env[primary]?.trim();
  const legacyValue = process.env[legacy]?.trim();
  if (primaryValue && !legacyValue) {
    process.env[legacy] = process.env[primary];
    return;
  }
  if (legacyValue && !primaryValue) {
    process.env[primary] = process.env[legacy];
  }
}

export function normalizeWingsOfWorldEnvAliases(): void {
  for (const [primary, legacy] of WINGS_OF_WORLD_ENV_ALIASES) {
    copyEnvAliasIfMissing(primary, legacy);
  }
}

export function isTruthyEnvValue(value?: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  switch (value.trim().toLowerCase()) {
    case "1":
    case "on":
    case "true":
    case "yes":
      return true;
    default:
      return false;
  }
}

export function normalizeEnv(): void {
  normalizeZaiEnv();
  normalizeWingsOfWorldEnvAliases();
}
