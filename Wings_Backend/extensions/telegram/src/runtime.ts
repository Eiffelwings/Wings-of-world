import type { PluginRuntime } from "mechanical-wings/plugin-sdk/core";
import { createPluginRuntimeStore } from "mechanical-wings/plugin-sdk/runtime-store";

const { setRuntime: setTelegramRuntime, getRuntime: getTelegramRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Telegram runtime not initialized");
export { getTelegramRuntime, setTelegramRuntime };
