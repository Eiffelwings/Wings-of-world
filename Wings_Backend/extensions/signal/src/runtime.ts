import type { PluginRuntime } from "mechanical-wings/plugin-sdk/core";
import { createPluginRuntimeStore } from "mechanical-wings/plugin-sdk/runtime-store";

const { setRuntime: setSignalRuntime, getRuntime: getSignalRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Signal runtime not initialized");
export { getSignalRuntime, setSignalRuntime };
