import {
  buildDeepSeekModelDefinition,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL_CATALOG,
} from "mechanical-wings/plugin-sdk/provider-models";
import {
  applyAgentDefaultModelPrimary,
  applyProviderConfigWithModelCatalog,
  type WingsConfig,
} from "mechanical-wings/plugin-sdk/provider-onboard";

export const DEEPSEEK_DEFAULT_MODEL_REF = "deepseek/deepseek-chat";

export function applyDeepSeekProviderConfig(cfg: WingsConfig): WingsConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[DEEPSEEK_DEFAULT_MODEL_REF] = {
    ...models[DEEPSEEK_DEFAULT_MODEL_REF],
    alias: models[DEEPSEEK_DEFAULT_MODEL_REF]?.alias ?? "DeepSeek",
  };

  return applyProviderConfigWithModelCatalog(cfg, {
    agentModels: models,
    providerId: "deepseek",
    api: "openai-completions",
    baseUrl: DEEPSEEK_BASE_URL,
    catalogModels: DEEPSEEK_MODEL_CATALOG.map(buildDeepSeekModelDefinition),
  });
}

export function applyDeepSeekConfig(cfg: WingsConfig): WingsConfig {
  return applyAgentDefaultModelPrimary(
    applyDeepSeekProviderConfig(cfg),
    DEEPSEEK_DEFAULT_MODEL_REF,
  );
}
