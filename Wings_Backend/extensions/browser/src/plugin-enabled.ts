import type { WingsConfig } from "mechanical-wings/plugin-sdk/browser-support";
import {
  normalizePluginsConfig,
  resolveEffectiveEnableState,
} from "mechanical-wings/plugin-sdk/browser-support";

export function isDefaultBrowserPluginEnabled(cfg: WingsConfig): boolean {
  return resolveEffectiveEnableState({
    id: "browser",
    origin: "bundled",
    config: normalizePluginsConfig(cfg.plugins),
    rootConfig: cfg,
    enabledByDefault: true,
  }).enabled;
}
