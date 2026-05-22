import { KILOCODE_BASE_URL, KILOCODE_DEFAULT_MODEL_REF } from "mechanical-wings/plugin-sdk/provider-models";
import {
  createModelCatalogPresetAppliers,
  type WingsConfig,
} from "mechanical-wings/plugin-sdk/provider-onboard";
import { buildKilocodeProvider } from "./provider-catalog.js";

export { KILOCODE_BASE_URL, KILOCODE_DEFAULT_MODEL_REF };

const kilocodePresetAppliers = createModelCatalogPresetAppliers({
  primaryModelRef: KILOCODE_DEFAULT_MODEL_REF,
  resolveParams: (_cfg: WingsConfig) => ({
    providerId: "kilocode",
    api: "openai-completions",
    baseUrl: KILOCODE_BASE_URL,
    catalogModels: buildKilocodeProvider().models ?? [],
    aliases: [{ modelRef: KILOCODE_DEFAULT_MODEL_REF, alias: "Kilo Gateway" }],
  }),
});

export function applyKilocodeProviderConfig(cfg: WingsConfig): WingsConfig {
  return kilocodePresetAppliers.applyProviderConfig(cfg);
}

export function applyKilocodeConfig(cfg: WingsConfig): WingsConfig {
  return kilocodePresetAppliers.applyConfig(cfg);
}
