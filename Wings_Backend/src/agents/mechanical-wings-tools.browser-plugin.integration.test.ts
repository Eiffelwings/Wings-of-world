import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WingsConfig } from "../config/config.js";
import { clearPluginLoaderCache } from "../plugins/loader.js";
import { clearPluginManifestRegistryCache } from "../plugins/manifest-registry.js";
import { resetPluginRuntimeStateForTest } from "../plugins/runtime.js";
import { createWingsTools } from "./mechanical-wings-tools.js";

function resetPluginState() {
  clearPluginLoaderCache();
  clearPluginManifestRegistryCache();
  resetPluginRuntimeStateForTest();
}

describe("createWingsTools browser plugin integration", () => {
  beforeEach(() => {
    resetPluginState();
  });

  afterEach(() => {
    resetPluginState();
  });

  it("loads the bundled browser plugin through normal plugin resolution", () => {
    const tools = createWingsTools({
      config: {
        plugins: {
          allow: ["browser"],
        },
      } as WingsConfig,
    });

    expect(tools.map((tool) => tool.name)).toContain("browser");
  });

  it("omits the browser tool when the bundled browser plugin is disabled", () => {
    const tools = createWingsTools({
      config: {
        plugins: {
          allow: ["browser"],
          entries: {
            browser: {
              enabled: false,
            },
          },
        },
      } as WingsConfig,
    });

    expect(tools.map((tool) => tool.name)).not.toContain("browser");
  });
});
