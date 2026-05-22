import type { PluginRuntime } from "mechanical-wings/plugin-sdk/core";
import { createPluginRuntimeStore } from "mechanical-wings/plugin-sdk/runtime-store";

const { setRuntime: setSynologyRuntime, getRuntime: getSynologyRuntime } =
  createPluginRuntimeStore<PluginRuntime>(
    "Synology Chat runtime not initialized - plugin not registered",
  );
export { getSynologyRuntime, setSynologyRuntime };
