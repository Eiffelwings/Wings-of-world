import { loadGeneratedBundledPluginEntries } from "../generated/bundled-plugin-entries.generated.js";
import type { WingsPluginDefinition } from "./types.js";

type BundledRegistrablePlugin = WingsPluginDefinition & {
  id: string;
  register: NonNullable<WingsPluginDefinition["register"]>;
};

export const BUNDLED_PLUGIN_ENTRIES =
  (await loadGeneratedBundledPluginEntries()) as unknown as readonly BundledRegistrablePlugin[];
