import type { WingsPluginApi } from "mechanical-wings/plugin-sdk/core";
import { registerSandboxBackend } from "mechanical-wings/plugin-sdk/sandbox";
import {
  createOpenShellSandboxBackendFactory,
  createOpenShellSandboxBackendManager,
} from "./src/backend.js";
import { createOpenShellPluginConfigSchema, resolveOpenShellPluginConfig } from "./src/config.js";

const plugin = {
  id: "openshell",
  name: "OpenShell Sandbox",
  description: "OpenShell-backed sandbox runtime for agent exec and file tools.",
  configSchema: createOpenShellPluginConfigSchema(),
  register(api: WingsPluginApi) {
    if (api.registrationMode !== "full") {
      return;
    }
    const pluginConfig = resolveOpenShellPluginConfig(api.pluginConfig);
    registerSandboxBackend("openshell", {
      factory: createOpenShellSandboxBackendFactory({
        pluginConfig,
      }),
      manager: createOpenShellSandboxBackendManager({
        pluginConfig,
      }),
    });
  },
};

export default plugin;
