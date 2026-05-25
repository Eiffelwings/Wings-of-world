import { afterEach, describe, expect, it, vi } from "vitest";

type LoggerModule = typeof import("./logger.js");

const originalGetBuiltinModule = (
  process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }
).getBuiltinModule;

async function importBrowserSafeLogger(params?: {
  resolvePreferredWingsTmpDir?: ReturnType<typeof vi.fn>;
}): Promise<{
  module: LoggerModule;
  resolvePreferredWingsTmpDir: ReturnType<typeof vi.fn>;
}> {
  vi.resetModules();
  const resolvePreferredWingsTmpDir =
    params?.resolvePreferredWingsTmpDir ??
    vi.fn(() => {
      throw new Error("resolvePreferredWingsTmpDir should not run during browser-safe import");
    });

  vi.doMock("../infra/tmp-mechanical-wings-dir.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/tmp-mechanical-wings-dir.js")>(
      "../infra/tmp-mechanical-wings-dir.js",
    );
    return {
      ...actual,
      resolvePreferredWingsTmpDir,
    };
  });

  Object.defineProperty(process, "getBuiltinModule", {
    configurable: true,
    value: undefined,
  });

  const module = await import("./logger.js");
  return { module, resolvePreferredWingsTmpDir };
}

describe("logging/logger browser-safe import", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../infra/tmp-mechanical-wings-dir.js");
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: originalGetBuiltinModule,
    });
  });

  it("does not resolve the preferred temp dir at import time when node fs is unavailable", async () => {
    const { module, resolvePreferredWingsTmpDir } = await importBrowserSafeLogger();

    expect(resolvePreferredWingsTmpDir).not.toHaveBeenCalled();
    expect(module.DEFAULT_LOG_DIR).toBe("/tmp/mechanical-wings");
    expect(module.DEFAULT_LOG_FILE).toBe("/tmp/mechanical-wings/mechanical-wings.log");
  });

  it("disables file logging when imported in a browser-like environment", async () => {
    const { module, resolvePreferredWingsTmpDir } = await importBrowserSafeLogger();

    expect(module.getResolvedLoggerSettings()).toMatchObject({
      level: "silent",
      file: "/tmp/mechanical-wings/mechanical-wings.log",
    });
    expect(module.isFileLogLevelEnabled("info")).toBe(false);
    expect(() => module.getLogger().info("browser-safe")).not.toThrow();
    expect(resolvePreferredWingsTmpDir).not.toHaveBeenCalled();
  });
});
