import type { WingsConfig } from "../config/config.js";
import { loadWingsPlugins } from "../plugins/loader.js";
import { getActivePluginRegistryKey } from "../plugins/runtime.js";
import { resolveUserPath } from "../utils.js";

export function ensureRuntimePluginsLoaded(params: {
  config?: WingsConfig;
  workspaceDir?: string | null;
  allowGatewaySubagentBinding?: boolean;
}): void {
  if (getActivePluginRegistryKey()) {
    return;
  }

  const workspaceDir =
    typeof params.workspaceDir === "string" && params.workspaceDir.trim()
      ? resolveUserPath(params.workspaceDir)
      : undefined;

  loadWingsPlugins({
    config: params.config,
    workspaceDir,
    runtimeOptions: params.allowGatewaySubagentBinding
      ? {
          allowGatewaySubagentBinding: true,
        }
      : undefined,
  });
}
