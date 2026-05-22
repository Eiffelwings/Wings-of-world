import type { WingsConfig } from "../config/config.js";
import { loadWingsPlugins } from "./loader.js";
import { getMemoryRuntime } from "./memory-state.js";

function ensureMemoryRuntime(cfg?: WingsConfig) {
  const current = getMemoryRuntime();
  if (current || !cfg) {
    return current;
  }
  loadWingsPlugins({ config: cfg });
  return getMemoryRuntime();
}

export async function getActiveMemorySearchManager(params: {
  cfg: WingsConfig;
  agentId: string;
  purpose?: "default" | "status";
}) {
  const runtime = ensureMemoryRuntime(params.cfg);
  if (!runtime) {
    return { manager: null, error: "memory plugin unavailable" };
  }
  return await runtime.getMemorySearchManager(params);
}

export function resolveActiveMemoryBackendConfig(params: { cfg: WingsConfig; agentId: string }) {
  return ensureMemoryRuntime(params.cfg)?.resolveMemoryBackendConfig(params) ?? null;
}

export async function closeActiveMemorySearchManagers(cfg?: WingsConfig): Promise<void> {
  const runtime = ensureMemoryRuntime(cfg);
  await runtime?.closeAllMemorySearchManagers?.();
}
