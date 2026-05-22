import type { PluginRuntime } from "mechanical-wings/plugin-sdk/plugin-runtime";
import { createPluginRuntimeStore } from "mechanical-wings/plugin-sdk/runtime-store";

const { setRuntime: setTlonRuntime, getRuntime: getTlonRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Tlon runtime not initialized");
export { getTlonRuntime, setTlonRuntime };
