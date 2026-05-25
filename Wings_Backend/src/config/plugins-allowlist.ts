import type { WingsConfig } from "./config.js";

export function ensurePluginAllowlisted(cfg: WingsConfig, pluginId: string): WingsConfig {
  const allow = cfg.plugins?.allow;
  if (!Array.isArray(allow) || allow.includes(pluginId)) {
    return cfg;
  }
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      allow: [...allow, pluginId],
    },
  };
}
