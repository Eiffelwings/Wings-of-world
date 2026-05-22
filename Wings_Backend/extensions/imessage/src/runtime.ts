import type { PluginRuntime } from "mechanical-wings/plugin-sdk/core";
import { createPluginRuntimeStore } from "mechanical-wings/plugin-sdk/runtime-store";

const { setRuntime: setIMessageRuntime, getRuntime: getIMessageRuntime } =
  createPluginRuntimeStore<PluginRuntime>("iMessage runtime not initialized");
export { getIMessageRuntime, setIMessageRuntime };
