// Narrow plugin-sdk surface for the bundled diffs plugin.
// Keep this list additive and scoped to symbols used under extensions/diffs.

export { definePluginEntry } from "./plugin-entry.js";
export type { WingsConfig } from "../config/config.js";
export { resolvePreferredWingsTmpDir } from "../infra/tmp-mechanical-wings-dir.js";
export type {
  AnyAgentTool,
  WingsPluginApi,
  WingsPluginConfigSchema,
  WingsPluginToolContext,
  PluginLogger,
} from "../plugins/types.js";
