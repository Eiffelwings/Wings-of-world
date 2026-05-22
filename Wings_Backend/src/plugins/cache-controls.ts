export const DEFAULT_PLUGIN_DISCOVERY_CACHE_MS = 1000;
export const DEFAULT_PLUGIN_MANIFEST_CACHE_MS = 1000;

export function shouldUsePluginSnapshotCache(env: NodeJS.ProcessEnv): boolean {
  if (env.OPENCLAW_DISABLE_PLUGIN_DISCOVERY_CACHE?.trim()) {
    return false;
  }
  if (env.OPENCLAW_DISABLE_PLUGIN_MANIFEST_CACHE?.trim()) {
    return false;
  }
  const discoveryCacheMs = env.OPENCLAW_PLUGIN_DISCOVERY_CACHE_MS?.trim();
  if (discoveryCacheMs === "0") {
    return false;
  }
  const manifestCacheMs = env.OPENCLAW_PLUGIN_MANIFEST_CACHE_MS?.trim();
  if (manifestCacheMs === "0") {
    return false;
  }
  return true;
}

export function resolvePluginCacheMs(rawValue: string | undefined, defaultMs: number): number {
  const raw = rawValue?.trim();
  if (raw === "" || raw === "0") {
    return 0;
  }
  if (!raw) {
    return defaultMs;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return defaultMs;
  }
  return Math.max(0, parsed);
}

export function resolvePluginSnapshotCacheTtlMs(env: NodeJS.ProcessEnv): number {
  const discoveryCacheMs = resolvePluginCacheMs(
    env.OPENCLAW_PLUGIN_DISCOVERY_CACHE_MS,
    DEFAULT_PLUGIN_DISCOVERY_CACHE_MS,
  );
  const manifestCacheMs = resolvePluginCacheMs(
    env.OPENCLAW_PLUGIN_MANIFEST_CACHE_MS,
    DEFAULT_PLUGIN_MANIFEST_CACHE_MS,
  );
  return Math.min(discoveryCacheMs, manifestCacheMs);
}

export function buildPluginSnapshotCacheEnvKey(
  env: NodeJS.ProcessEnv,
  options: { includeProcessVitestFallback?: boolean } = {},
) {
  return {
    WINGS_OF_WORLD_BACKEND_BUNDLED_PLUGINS_DIR:
      env.WINGS_OF_WORLD_BACKEND_BUNDLED_PLUGINS_DIR ?? "",
    WINGS_OF_WORLD_BUNDLED_PLUGINS_DIR: env.WINGS_OF_WORLD_BUNDLED_PLUGINS_DIR ?? "",
    OPENCLAW_BUNDLED_PLUGINS_DIR: env.OPENCLAW_BUNDLED_PLUGINS_DIR ?? "",
    OPENCLAW_DISABLE_PLUGIN_DISCOVERY_CACHE: env.OPENCLAW_DISABLE_PLUGIN_DISCOVERY_CACHE ?? "",
    OPENCLAW_DISABLE_PLUGIN_MANIFEST_CACHE: env.OPENCLAW_DISABLE_PLUGIN_MANIFEST_CACHE ?? "",
    OPENCLAW_PLUGIN_DISCOVERY_CACHE_MS: env.OPENCLAW_PLUGIN_DISCOVERY_CACHE_MS ?? "",
    OPENCLAW_PLUGIN_MANIFEST_CACHE_MS: env.OPENCLAW_PLUGIN_MANIFEST_CACHE_MS ?? "",
    WINGS_OF_WORLD_BACKEND_HOME: env.WINGS_OF_WORLD_BACKEND_HOME ?? "",
    WINGS_OF_WORLD_BACKEND_STATE_DIR: env.WINGS_OF_WORLD_BACKEND_STATE_DIR ?? "",
    WINGS_OF_WORLD_BACKEND_CONFIG_PATH: env.WINGS_OF_WORLD_BACKEND_CONFIG_PATH ?? "",
    WINGS_OF_WORLD_HOME: env.WINGS_OF_WORLD_HOME ?? "",
    WINGS_OF_WORLD_STATE_DIR: env.WINGS_OF_WORLD_STATE_DIR ?? "",
    WINGS_OF_WORLD_CONFIG_PATH: env.WINGS_OF_WORLD_CONFIG_PATH ?? "",
    OPENCLAW_HOME: env.OPENCLAW_HOME ?? "",
    OPENCLAW_STATE_DIR: env.OPENCLAW_STATE_DIR ?? "",
    OPENCLAW_CONFIG_PATH: env.OPENCLAW_CONFIG_PATH ?? "",
    HOME: env.HOME ?? "",
    USERPROFILE: env.USERPROFILE ?? "",
    VITEST: options.includeProcessVitestFallback
      ? (env.VITEST ?? process.env.VITEST ?? "")
      : (env.VITEST ?? ""),
  };
}
