import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WingsConfig } from "../config/config.js";
import * as imageGenerationRuntime from "../image-generation/runtime.js";
import { createWingsTools } from "./mechanical-wings-tools.js";

vi.mock("../plugins/tools.js", () => ({
  resolvePluginTools: () => [],
}));

function asConfig(value: unknown): WingsConfig {
  return value as WingsConfig;
}

function stubImageGenerationProviders() {
  vi.spyOn(imageGenerationRuntime, "listRuntimeImageGenerationProviders").mockReturnValue([
    {
      id: "openai",
      defaultModel: "gpt-image-1",
      models: ["gpt-image-1"],
      capabilities: {
        generate: {
          supportsSize: true,
        },
        edit: {
          enabled: false,
        },
        geometry: {
          sizes: ["1024x1024"],
        },
      },
      generateImage: vi.fn(async () => {
        throw new Error("not used");
      }),
    },
  ]);
}

describe("mechanical-wings tools image generation registration", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEYS", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEYS", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("registers image_generate when image-generation config is present", () => {
    const tools = createWingsTools({
      config: asConfig({
        agents: {
          defaults: {
            imageGenerationModel: {
              primary: "openai/gpt-image-1",
            },
          },
        },
      }),
      agentDir: "/tmp/mechanical-wings-agent-main",
    });

    expect(tools.map((tool) => tool.name)).toContain("image_generate");
  });

  it("registers image_generate when a compatible provider has env-backed auth", () => {
    stubImageGenerationProviders();
    vi.stubEnv("OPENAI_API_KEY", "openai-test");

    const tools = createWingsTools({
      config: asConfig({}),
      agentDir: "/tmp/mechanical-wings-agent-main",
    });

    expect(tools.map((tool) => tool.name)).toContain("image_generate");
  });

  it("omits image_generate when config is absent and no compatible provider auth exists", () => {
    stubImageGenerationProviders();

    const tools = createWingsTools({
      config: asConfig({}),
      agentDir: "/tmp/mechanical-wings-agent-main",
    });

    expect(tools.map((tool) => tool.name)).not.toContain("image_generate");
  });
});
