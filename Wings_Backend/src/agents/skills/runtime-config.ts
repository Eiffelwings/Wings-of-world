import { getRuntimeConfigSnapshot, type WingsConfig } from "../../config/config.js";

export function resolveSkillRuntimeConfig(config?: WingsConfig): WingsConfig | undefined {
  return getRuntimeConfigSnapshot() ?? config;
}
