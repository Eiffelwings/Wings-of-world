import { useEffect, useMemo, useState } from "react";
import { api, type OpenRouterModelCatalogEntry, type ProviderHealth, type PublicSettings } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Network,
  Route,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type ProviderProfile = {
  key: string;
  label: string;
  provider: "openai" | "azure" | "custom" | "codex_local" | "anthropic";
  baseURL: string;
  models: string[];
  apiKeyRequired: boolean;
  hint: string;
};

const PROFILES: ProviderProfile[] = [
  {
    key: "anthropic",
    label: "Anthropic (Claude)",
    provider: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    models: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001", "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022"],
    apiKeyRequired: true,
    hint: "Use your Anthropic API key (sk-ant-...) to run Claude models directly. No proxy needed.",
  },
  {
    key: "openai",
    label: "OpenAI",
    provider: "openai",
    baseURL: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
    apiKeyRequired: true,
    hint: "Use for standard OpenAI-hosted chat and reasoning models.",
  },
  {
    key: "codex",
    label: "OpenAI Codex",
    provider: "openai",
    baseURL: "https://api.openai.com/v1",
    models: ["gpt-5-codex", "gpt-5.2-codex", "gpt-5.1-codex", "gpt-5.1-codex-max"],
    apiKeyRequired: true,
    hint: "Use for Codex-optimized OpenAI models. Wings Of World currently sends Chat Completions requests against the standard OpenAI endpoint.",
  },
  {
    key: "codex-local",
    label: "Codex Local Login",
    provider: "codex_local",
    baseURL: "codex://local",
    models: ["gpt-5.5", "gpt-5.4"],
    apiKeyRequired: false,
    hint: "Use the Codex CLI session already logged in on this machine. No separate OpenAI API key required inside Wings Of World.",
  },
  {
    key: "azure",
    label: "Azure OpenAI",
    provider: "azure",
    baseURL: "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT",
    models: ["gpt-4o", "gpt-4o-mini"],
    apiKeyRequired: true,
    hint: "Base URL must include the deployment path.",
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    provider: "custom",
    baseURL: "https://openrouter.ai/api/v1",
    models: [
      "openrouter/auto",
      "openai/gpt-5.4",
      "openai/gpt-5.4-chat",
      "openai/gpt-5.4-mini",
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
      "openai/gpt-5-chat",
      "openai/gpt-4.1",
      "openai/gpt-4.1-mini",
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "openai/o3",
      "openai/o3-mini",
      "openai/o4-mini",
      "openai/gpt-5-image",
      "openai/gpt-5-image-mini",
      "openai/gpt-5.4-image-2",
      "anthropic/claude-opus-4.7",
      "anthropic/claude-opus-4.6",
      "anthropic/claude-opus-4.6-fast",
      "anthropic/claude-opus-4.5",
      "anthropic/claude-opus-4.1",
      "anthropic/claude-opus-4",
      "anthropic/claude-sonnet-4.6",
      "anthropic/claude-sonnet-4.5",
      "anthropic/claude-sonnet-4",
      "anthropic/claude-3.7-sonnet",
      "anthropic/claude-3.7-sonnet:thinking",
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-haiku-4.5",
      "anthropic/claude-3.5-haiku",
      "google/gemini-3.1-pro-preview",
      "google/gemini-3.1-flash-lite-preview",
      "google/gemini-3-flash-preview",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-pro-preview",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-flash-lite",
      "google/gemini-2.0-flash-001",
      "google/gemini-2.0-flash-lite-001",
      "google/gemini-2.5-flash-image",
      "google/gemini-3.1-flash-image-preview",
      "google/gemini-3-pro-image-preview",
      "google/gemma-4-26b-a4b-it",
      "google/gemma-4-26b-a4b-it:free",
      "meta-llama/llama-4-maverick",
      "meta-llama/llama-4-scout",
      "meta-llama/llama-4-maverick:free",
      "meta-llama/llama-4-scout:free",
      "meta-llama/llama-3.3-70b-instruct",
      "meta-llama/llama-3.1-405b-instruct",
      "meta-llama/llama-3.1-70b-instruct",
      "meta-llama/llama-3.1-8b-instruct",
      "mistralai/mistral-large-2411",
      "mistralai/mistral-large-2407",
      "mistralai/mistral-medium-3",
      "mistralai/mistral-small-3.2-24b-instruct",
      "mistralai/mistral-small-3.1-24b-instruct",
      "mistralai/codestral-2501",
      "mistralai/codestral-2405",
      "mistralai/mixtral-8x22b-instruct",
      "mistralai/mixtral-8x7b-instruct",
      "deepseek/deepseek-v4-pro",
      "deepseek/deepseek-v4-flash",
      "deepseek/deepseek-r1",
      "deepseek/deepseek-r1:free",
      "deepseek/deepseek-r1-0528",
      "deepseek/deepseek-r1-0528:free",
      "deepseek/deepseek-chat",
      "deepseek/deepseek-chat-v3-0324",
      "deepseek/deepseek-chat-v3-0324:free",
      "x-ai/grok-4.3",
      "x-ai/grok-4.20",
      "x-ai/grok-4.20-multi-agent",
      "x-ai/grok-4.1-fast",
      "x-ai/grok-4-fast",
      "x-ai/grok-4",
      "x-ai/grok-3",
      "x-ai/grok-3-beta",
      "x-ai/grok-3-mini",
      "x-ai/grok-3-mini-beta",
      "x-ai/grok-code-fast-1",
      "qwen/qwen3.6-plus",
      "qwen/qwen3-max",
      "qwen/qwen3-coder-plus",
      "qwen/qwen3-235b-a22b",
      "qwen/qwen3-30b-a3b",
      "qwen/qwen3-32b",
      "qwen/qwen3-14b",
      "qwen/qwen2.5-72b-instruct",
      "qwen/qwen2.5-vl-72b-instruct",
      "qwen/qwen2.5-coder-32b-instruct",
      "z-ai/glm-5.1",
      "z-ai/glm-5-turbo",
      "z-ai/glm-5v-turbo",
      "z-ai/glm-5",
      "z-ai/glm-4.7",
      "z-ai/glm-4.7-flash",
      "z-ai/glm-4.6",
      "z-ai/glm-4.6v",
      "z-ai/glm-4.5",
      "z-ai/glm-4.5-air",
      "z-ai/glm-4.5v",
      "moonshotai/kimi-k2.6",
      "moonshotai/kimi-k2",
      "moonshotai/kimi-dev-72b",
      "moonshotai/kimi-latest",
      "amazon/nova-2-lite-v1",
      "amazon/nova-lite-v1",
      "amazon/nova-pro-v1",
      "amazon/nova-premier-v1",
      "bytedance-seed/seed-1.6",
      "bytedance-seed/seed-1.6-flash",
      "bytedance-seed/seed-2.0-lite",
      "bytedance-seed/seed-2.0-mini",
      "perplexity/sonar",
      "perplexity/sonar-pro",
      "perplexity/sonar-reasoning",
      "perplexity/sonar-reasoning-pro",
      "cohere/command-a",
      "cohere/command-r-plus",
      "cohere/command-r",
      "nvidia/llama-3.1-nemotron-70b-instruct",
      "nousresearch/hermes-3-llama-3.1-405b",
    ],
    apiKeyRequired: true,
    hint: "OpenRouter routes to 200+ models via one OpenAI-compatible endpoint. Get your key at openrouter.ai/keys.",
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    provider: "custom",
    baseURL: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash", "deepseek-v4-pro"],
    apiKeyRequired: true,
    hint: "DeepSeek uses an OpenAI-compatible API. Get your key at platform.deepseek.com.",
  },
  {
    key: "groq",
    label: "Groq",
    provider: "custom",
    baseURL: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    apiKeyRequired: true,
    hint: "Groq provides ultra-fast inference via an OpenAI-compatible API. Get your key at console.groq.com.",
  },
  {
    key: "gemini",
    label: "Google Gemini",
    provider: "custom",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.5-pro-preview-05-06", "gemini-2.0-flash-001", "gemini-1.5-pro-latest", "gemini-1.5-flash-latest"],
    apiKeyRequired: true,
    hint: "Google Gemini via OpenAI-compatible endpoint. Get your key at aistudio.google.com.",
  },
  {
    key: "zai",
    label: "Z.ai (GLM)",
    provider: "custom",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-5.1", "glm-4.6", "glm-4.5", "glm-4-plus"],
    apiKeyRequired: true,
    hint: "Z.ai (Zhipu AI) GLM family via OpenAI-compatible endpoint. Get your key at open.bigmodel.cn.",
  },
  {
    key: "xai",
    label: "xAI Grok",
    provider: "custom",
    baseURL: "https://api.x.ai/v1",
    models: ["grok-3-beta", "grok-3-mini-beta", "grok-2-1212", "grok-2-vision-1212"],
    apiKeyRequired: true,
    hint: "xAI Grok via OpenAI-compatible endpoint. Get your key at console.x.ai.",
  },
  {
    key: "moonshot",
    label: "Moonshot Kimi",
    provider: "custom",
    baseURL: "https://api.moonshot.ai/v1",
    models: ["kimi-k2.6", "kimi-k2", "moonshot-v1-128k", "moonshot-v1-32k"],
    apiKeyRequired: true,
    hint: "Moonshot AI Kimi family. Get your key at platform.moonshot.ai.",
  },
  {
    key: "qwen",
    label: "Qwen (DashScope)",
    provider: "custom",
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    models: ["qwen3.6-plus", "qwen3-max", "qwen3-coder-plus", "qwen2.5-72b-instruct"],
    apiKeyRequired: true,
    hint: "Alibaba DashScope (Qwen) OpenAI-compatible endpoint. Get your key at dashscope.aliyuncs.com.",
  },
  {
    key: "ollama",
    label: "Ollama",
    provider: "custom",
    baseURL: "http://127.0.0.1:11434/v1",
    models: ["llama3.1", "qwen2.5-coder", "mistral"],
    apiKeyRequired: false,
    hint: "Local Ollama endpoints usually do not require an API key.",
  },
  {
    key: "lmstudio",
    label: "LM Studio",
    provider: "custom",
    baseURL: "http://127.0.0.1:1234/v1",
    models: ["local-model"],
    apiKeyRequired: false,
    hint: "Use when LM Studio exposes an OpenAI-compatible local server.",
  },
  {
    key: "custom",
    label: "Custom",
    provider: "custom",
    baseURL: "",
    models: [],
    apiKeyRequired: true,
    hint: "Any OpenAI-compatible provider. Override the URL and model directly.",
  },
];

const PRICING_PRESETS: Array<{ key: string; label: string; values: Record<string, number> }> = [
  {
    key: "anthropic-default",
    label: "Anthropic Default",
    values: {
      "claude-opus-4-7": 0.075,
      "claude-sonnet-4-6": 0.015,
      "claude-haiku-4-5-20251001": 0.0008,
      "claude-3-7-sonnet-20250219": 0.015,
      "claude-3-5-sonnet-20241022": 0.015,
    },
  },
  {
    key: "openai-default",
    label: "OpenAI Default",
    values: {
      "gpt-5.4": 0.012,
      "gpt-5-codex": 0.015,
      "gpt-5.2-codex": 0.015,
      "gpt-5.1-codex": 0.015,
      "gpt-5.1-codex-max": 0.015,
      "gpt-4o": 0.01,
      "gpt-4o-mini": 0.0009,
    },
  },
  {
    key: "local-zero",
    label: "Local Models Free",
    values: {
      "llama3.1": 0,
      "qwen2.5-coder": 0,
      "mistral": 0,
      "local-model": 0,
      "gpt-5.4": 0,
    },
  },
];

// Group OpenRouter models by provider prefix (e.g. "anthropic/..." -> "Anthropic")
const OPENROUTER_GROUPS: Array<{ label: string; prefix: string }> = [
  { label: "Anthropic", prefix: "anthropic/" },
  { label: "OpenAI", prefix: "openai/" },
  { label: "Google", prefix: "google/" },
  { label: "Meta", prefix: "meta-llama/" },
  { label: "Mistral", prefix: "mistralai/" },
  { label: "DeepSeek", prefix: "deepseek/" },
  { label: "xAI", prefix: "x-ai/" },
  { label: "Qwen", prefix: "qwen/" },
];

function formatOpenRouterModelLabel(modelId: string, catalog?: OpenRouterModelCatalogEntry) {
  if (!catalog) return modelId;
  const tags = [
    catalog.capabilities.includes("vision") ? "vision" : "",
    catalog.capabilities.includes("video_understanding") ? "video in" : "",
    catalog.capabilities.includes("image_generation") ? "image out" : "",
    catalog.capabilities.includes("video_generation") ? "video out" : "",
    catalog.reasoning ? "reasoning" : "",
  ].filter(Boolean);
  return tags.length > 0 ? `${modelId} (${tags.join(", ")})` : modelId;
}

function ModelSelectItems({ models, profileKey, currentModel, catalogById }: {
  models: string[];
  profileKey: string;
  currentModel: string;
  catalogById?: Map<string, OpenRouterModelCatalogEntry>;
}) {
  if (profileKey !== "openrouter") {
    return (
      <>
        {models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        {!models.includes(currentModel) && (
          <SelectItem value={currentModel}>{currentModel} (current)</SelectItem>
        )}
      </>
    );
  }

  const grouped = OPENROUTER_GROUPS.map((g) => ({
    ...g,
    items: models.filter((m) => m.startsWith(g.prefix)),
  })).filter((g) => g.items.length > 0);

  const ungrouped = models.filter(
    (m) => !OPENROUTER_GROUPS.some((g) => m.startsWith(g.prefix)),
  );

  return (
    <>
      {grouped.map((g, i) => (
        <SelectGroup key={g.prefix}>
          {i > 0 && <SelectSeparator />}
          <SelectLabel>{g.label}</SelectLabel>
            {g.items.map((m) => (
              <SelectItem key={m} value={m}>
                {formatOpenRouterModelLabel(m.replace(g.prefix, ""), catalogById?.get(m))}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        {ungrouped.length > 0 && (
          <SelectGroup>
            <SelectSeparator />
            <SelectLabel>Other</SelectLabel>
            {ungrouped.map((m) => (
              <SelectItem key={m} value={m}>
                {formatOpenRouterModelLabel(m, catalogById?.get(m))}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      {!models.includes(currentModel) && (
        <SelectItem value={currentModel}>{currentModel} (current)</SelectItem>
      )}
    </>
  );
}

function findProfile(settings: PublicSettings | null) {
  if (!settings) return PROFILES[0];
  const model = settings.model.trim().toLowerCase();
  if (settings.provider === "codex_local") {
    return PROFILES.find((profile) => profile.key === "codex-local") || PROFILES[0];
  }
  if (settings.provider === "openai" && model.includes("codex")) {
    return PROFILES.find((profile) => profile.key === "codex") || PROFILES[0];
  }
  return (
    PROFILES.find(
      (profile) =>
        profile.provider === settings.provider &&
        profile.baseURL === settings.baseURL,
    ) ||
    PROFILES.find((profile) => profile.provider === settings.provider) ||
    PROFILES[0]
  );
}

function validateDraft(args: {
  profile: ProviderProfile;
  baseURL: string;
  model: string;
  apiKey: string;
  settings: { hasApiKey?: boolean } | null;
}) {
  const baseURL = args.baseURL.trim();
  const model = args.model.trim();
  const effectiveHasKey = Boolean(args.apiKey.trim()) || Boolean(args.settings?.hasApiKey);
  if (!baseURL) return "Base URL is required.";
  if (args.profile.provider === "codex_local") {
    if (baseURL !== "codex://local") {
      return "Codex Local profile should use codex://local.";
    }
    if (!model) return "Model is required.";
    return null;
  }
  try {
    const parsed = new URL(baseURL);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Base URL must use http or https.";
    }
    if (args.profile.provider === "openai" && parsed.hostname !== "api.openai.com") {
      return "OpenAI profile should use https://api.openai.com/v1.";
    }
    if (
      args.profile.provider === "azure" &&
      !/\/openai\/deployments\/[^/]+/i.test(parsed.pathname)
    ) {
      return "Azure OpenAI URL must include /openai/deployments/YOUR-DEPLOYMENT.";
    }
  } catch {
    return "Base URL must be a valid absolute URL.";
  }
  if (!model) return "Model is required.";
  if (args.profile.apiKeyRequired && !effectiveHasKey) {
    return "API key is required for this provider profile.";
  }
  return null;
}

export default function SettingsPage() {
  const auth = useAuth();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [openrouterModels, setOpenrouterModels] = useState<OpenRouterModelCatalogEntry[]>([]);
  const [profileKey, setProfileKey] = useState("openai");
  const [provider, setProvider] = useState<"openai" | "azure" | "custom" | "codex_local" | "anthropic">("openai");
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState(PROFILES[0].baseURL);
  const [model, setModel] = useState(PROFILES[0].models[0]);
  const [fallbackEnabled, setFallbackEnabled] = useState(false);
  const [fallbackProfileKey, setFallbackProfileKey] = useState("ollama");
  const [fallbackProvider, setFallbackProvider] = useState<"openai" | "azure" | "custom" | "codex_local" | "anthropic">("custom");
  const [fallbackApiKey, setFallbackApiKey] = useState("");
  const [fallbackBaseURL, setFallbackBaseURL] = useState("http://127.0.0.1:11434/v1");
  const [fallbackModel, setFallbackModel] = useState("llama3.1");
  const [braveApiKey, setBraveApiKey] = useState("");
  const [pricingOverridesText, setPricingOverridesText] = useState("{}");
  const [saving, setSaving] = useState(false);
  const [clearingKey, setClearingKey] = useState(false);
  const [clearingFallbackKey, setClearingFallbackKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);
  const [newAppPassword, setNewAppPassword] = useState("");
  const [confirmAppPassword, setConfirmAppPassword] = useState("");
  const [currentAppPassword, setCurrentAppPassword] = useState("");
  const [changingAppPassword, setChangingAppPassword] = useState(false);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getSystemHealth()])
      .then(([s, healthData]) => {
        const profile = findProfile(s);
        const fallbackProfile = findProfile(
          s.fallback.enabled
            ? {
                ...s,
                provider: s.fallback.provider,
                baseURL: s.fallback.baseURL,
                model: s.fallback.model,
              }
            : null,
        );
        setSettings(s);
        setHealth(healthData.provider);
        setProfileKey(profile.key);
        setProvider(s.provider);
        setBaseURL(s.baseURL);
        setModel(s.model);
        setFallbackEnabled(s.fallback.enabled);
        setFallbackProfileKey(fallbackProfile.key);
        setFallbackProvider(s.fallback.provider);
        setFallbackBaseURL(s.fallback.baseURL);
        setFallbackModel(s.fallback.model);
        setPricingOverridesText(JSON.stringify(s.pricingOverrides || {}, null, 2));
      })
      .catch((e) => toast.error(`Load settings failed: ${e.message}`));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getOpenRouterModels()
      .then(({ models }) => {
        if (cancelled) {
          return;
        }
        const deduped = Array.from(
          new Map(
            models
              .filter((item) => item?.id?.trim())
              .map((item) => [item.id.trim(), item] as const),
          ).values(),
        ).sort((a, b) => {
          const provider = a.provider.localeCompare(b.provider);
          if (provider !== 0) {
            return provider;
          }
          const name = a.name.localeCompare(b.name);
          if (name !== 0) {
            return name;
          }
          return a.id.localeCompare(b.id);
        });
        setOpenrouterModels(deduped);
      })
      .catch(() => {
        if (!cancelled) {
          setOpenrouterModels([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const profile = useMemo(
    () => PROFILES.find((item) => item.key === profileKey) || PROFILES[0],
    [profileKey],
  );
  const fallbackProfile = useMemo(
    () => PROFILES.find((item) => item.key === fallbackProfileKey) || PROFILES[0],
    [fallbackProfileKey],
  );
  const validationError = validateDraft({ profile, baseURL, model, apiKey, settings });
  const fallbackValidationError = fallbackEnabled
    ? validateDraft({
        profile: fallbackProfile,
        baseURL: fallbackBaseURL,
        model: fallbackModel,
        apiKey: fallbackApiKey,
        settings: settings?.fallback || null,
      })
    : null;
  let pricingOverridesError: string | null = null;
  let parsedPricingOverrides: Record<string, number> = {};
  try {
    const parsed = JSON.parse(pricingOverridesText || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      pricingOverridesError = "Pricing overrides must be a JSON object of model -> rate per 1K tokens.";
    } else {
      parsedPricingOverrides = Object.fromEntries(
        Object.entries(parsed)
          .map(([key, value]) => [key.trim(), Number(value)] as const)
          .filter(([key, value]) => key && Number.isFinite(value) && value >= 0),
      );
    }
  } catch {
    pricingOverridesError = "Pricing overrides must be valid JSON.";
  }

  const applyProfile = (nextKey: string) => {
    const nextProfile = PROFILES.find((item) => item.key === nextKey) || PROFILES[0];
    setProfileKey(nextProfile.key);
    setProvider(nextProfile.provider);
    setBaseURL(nextProfile.baseURL);
    if (nextProfile.models[0]) {
      setModel(nextProfile.models[0]);
    }
    setTestResult(null);
  };

  const applyFallbackProfile = (nextKey: string) => {
    const nextProfile = PROFILES.find((item) => item.key === nextKey) || PROFILES[0];
    setFallbackProfileKey(nextProfile.key);
    setFallbackProvider(nextProfile.provider);
    setFallbackBaseURL(nextProfile.baseURL);
    if (nextProfile.models[0]) {
      setFallbackModel(nextProfile.models[0]);
    }
    setTestResult(null);
  };

  const applyPricingPreset = (presetKey: string) => {
    const preset = PRICING_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;
    setPricingOverridesText(JSON.stringify(preset.values, null, 2));
    setTestResult(null);
  };

  const mergePricingPreset = (presetKey: string) => {
    const preset = PRICING_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;
    const current =
      pricingOverridesError || !pricingOverridesText.trim()
        ? {}
        : parsedPricingOverrides;
    setPricingOverridesText(
      JSON.stringify({ ...current, ...preset.values }, null, 2),
    );
    setTestResult(null);
  };

  const save = async () => {
    if (validationError || fallbackValidationError || pricingOverridesError) {
      toast.error(validationError || fallbackValidationError || pricingOverridesError || "Validation failed");
      return;
    }
    setSaving(true);
    try {
      const s = await api.saveSettings({
        provider,
        apiKey: apiKey || undefined,
        baseURL,
        model,
        fallbackEnabled,
        fallbackProvider,
        fallbackApiKey: fallbackApiKey || undefined,
        fallbackBaseURL,
        fallbackModel,
        braveApiKey: braveApiKey || undefined,
        pricingOverrides: parsedPricingOverrides,
      });
      setSettings(s);
      setApiKey("");
      setFallbackApiKey("");
      const healthData = await api.getSystemHealth();
      setHealth(healthData.provider);
      toast.success("Settings saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const clearStoredKey = async () => {
    setClearingKey(true);
    try {
      const s = await api.saveSettings({
        provider,
        baseURL,
        model,
        clearApiKey: true,
        fallbackEnabled,
        fallbackProvider,
        fallbackBaseURL,
        fallbackModel,
      });
      setSettings(s);
      setApiKey("");
      setTestResult(null);
      toast.success("Stored API key cleared");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setClearingKey(false);
    }
  };

  const clearFallbackStoredKey = async () => {
    setClearingFallbackKey(true);
    try {
      const s = await api.saveSettings({
        provider,
        baseURL,
        model,
        fallbackEnabled,
        fallbackProvider,
        fallbackBaseURL,
        fallbackModel,
        clearFallbackApiKey: true,
      });
      setSettings(s);
      setFallbackApiKey("");
      setTestResult(null);
      toast.success("Stored fallback API key cleared");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setClearingFallbackKey(false);
    }
  };

  const test = async () => {
    if (validationError || fallbackValidationError || pricingOverridesError) {
      setTestResult({ ok: false, msg: validationError || fallbackValidationError || pricingOverridesError || "Validation failed" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.testSettings({
        provider,
        apiKey: apiKey || undefined,
        baseURL,
        model,
        fallbackEnabled,
        fallbackProvider,
        fallbackApiKey: fallbackApiKey || undefined,
        fallbackBaseURL,
        fallbackModel,
        braveApiKey: braveApiKey || undefined,
        pricingOverrides: parsedPricingOverrides,
      });
      if (r.ok) setTestResult({ ok: true, msg: `Reply: ${r.reply}${r.providerMeta ? ` via ${r.providerMeta.provider}${r.providerMeta.usedFallback ? " fallback" : ""}` : ""}` });
      else {
        const lines: string[] = [];
        if (r.errorClass === "rate_limit") {
          lines.push("Provider rate-limited (429)");
          if (r.upstreamProvider) lines.push(`Upstream: ${r.upstreamProvider}`);
          if (r.retryAfterSeconds) lines.push(`Retry after ~${r.retryAfterSeconds}s`);
          lines.push(r.hint || "Wait a moment then retry, or add your own provider key for personal quota.");
        } else if (r.errorClass === "auth") {
          lines.push("Provider rejected the API key - double-check it.");
        } else if (r.errorClass === "server") {
          lines.push("Provider had a transient server error. Wings Of World retried; try once more or switch model.");
        } else {
          lines.push(r.error || "unknown");
        }
        setTestResult({ ok: false, msg: lines.join("\n") });
      }
      const healthData = await api.getSystemHealth();
      setHealth(healthData.provider);
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  };

  const profileModels =
    profile.key === "openrouter" && openrouterModels.length > 0
      ? Array.from(new Set([...profile.models, ...openrouterModels.map((item) => item.id)]))
      : profile.models;
  const openrouterCatalogById = useMemo(
    () => new Map(openrouterModels.map((item) => [item.id, item] as const)),
    [openrouterModels],
  );
  const openrouterSummary = useMemo(
    () => ({
      total: openrouterModels.length,
      vision: openrouterModels.filter((item) => item.capabilities.includes("vision")).length,
      videoIn: openrouterModels.filter((item) =>
        item.capabilities.includes("video_understanding"),
      ).length,
      image: openrouterModels.filter((item) =>
        item.capabilities.includes("image_generation"),
      ).length,
      video: openrouterModels.filter((item) =>
        item.capabilities.includes("video_generation"),
      ).length,
    }),
    [openrouterModels],
  );
  const testDisabled =
    testing ||
    Boolean(validationError) ||
    Boolean(fallbackValidationError) ||
    Boolean(pricingOverridesError) ||
    (profile.apiKeyRequired && !apiKey.trim() && !settings?.hasApiKey) ||
    (fallbackEnabled &&
      fallbackProfile.apiKeyRequired &&
      !fallbackApiKey.trim() &&
      !settings?.fallback?.hasApiKey);
  const configured = settings ? (!settings.apiKeyRequired || settings.hasApiKey) : false;
  const fallbackConfigured = settings?.fallback
    ? (!settings.fallback.apiKeyRequired || settings.fallback.hasApiKey) && settings.fallback.configured
    : false;
  const primaryWarnings = health?.warnings || [];
  const topWarning = validationError || fallbackValidationError || pricingOverridesError || primaryWarnings[0] || null;
  const providerSummary = configured ? `${settings?.provider} / ${settings?.model}` : "Needs setup";
  const fallbackSummary = settings?.fallback?.enabled
    ? fallbackConfigured
      ? `${settings.fallback.provider} / ${settings.fallback.model}`
      : "Fallback incomplete"
    : "Disabled";
  const authSummary = auth.status?.enabled ? "Protected" : "Open";

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <section className="rounded-[2rem] border bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(29,78,216,0.08),rgba(8,145,178,0.08))] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-full border bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Runtime and security
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Configure provider routing, fallback behavior, local access control, and pricing assumptions. This page should make it obvious what is safe, what is ready, and what still needs intervention.
              </p>
            </div>
          </div>
          <Badge variant={configured ? "secondary" : "destructive"} className="rounded-full px-3 py-1">
            {configured ? "provider ready" : "provider incomplete"}
          </Badge>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SettingsMetric
            title="Access Control"
            value={authSummary}
            detail={auth.status?.enabled ? "Local app password enabled" : "Turn on app password before shared use"}
            icon={auth.status?.enabled ? ShieldCheck : KeyRound}
            tone={auth.status?.enabled ? "ready" : "warning"}
          />
          <SettingsMetric
            title="Primary Provider"
            value={providerSummary}
            detail={configured ? health?.primary.apiMode || "Configured" : "Missing valid connection details"}
            icon={Network}
            tone={configured ? "ready" : "warning"}
          />
          <SettingsMetric
            title="Fallback"
            value={fallbackSummary}
            detail={settings?.fallback?.enabled ? (fallbackConfigured ? "Automatic standby ready" : "Enabled but not complete") : "Optional but recommended"}
            icon={Route}
            tone={settings?.fallback?.enabled && !fallbackConfigured ? "warning" : "ready"}
          />
          <SettingsMetric
            title="Pricing"
            value={`${Object.keys(settings?.pricingOverrides || {}).length}`}
            detail="Custom model pricing overrides"
            icon={Wallet}
            tone="ready"
          />
        </div>
      </section>

      {topWarning ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
            <div className="space-y-1">
              <div className="font-semibold">Priority issue</div>
              <div className="text-sm text-muted-foreground">{topWarning}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>App Access Control</CardTitle>
          <CardDescription>
            Lock the local Wings Of World web UI and API behind a password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Status: <code>{auth.status?.enabled ? "enabled" : "disabled"}</code>
            {auth.status?.enabled && auth.status.sessionExpiresAt ? (
              <> | Session expires: <code>{new Date(auth.status.sessionExpiresAt).toLocaleString()}</code></>
            ) : null}
          </div>
          {!auth.status?.enabled ? (
            <>
              <div className="grid gap-2">
                <Label>New app password</Label>
                <Input
                  type="password"
                  value={newAppPassword}
                  onChange={(e) => setNewAppPassword(e.target.value)}
                  placeholder="At least 10 characters"
                />
              </div>
              <div className="grid gap-2">
                <Label>Confirm password</Label>
                <Input
                  type="password"
                  value={confirmAppPassword}
                  onChange={(e) => setConfirmAppPassword(e.target.value)}
                  placeholder="Repeat password"
                />
              </div>
              <Button
                onClick={async () => {
                  if (newAppPassword !== confirmAppPassword) {
                    toast.error("Passwords do not match");
                    return;
                  }
                  setChangingAppPassword(true);
                  try {
                    await auth.bootstrap(newAppPassword);
                    setSettings((current) => (current ? { ...current, authEnabled: true } : current));
                    setNewAppPassword("");
                    setConfirmAppPassword("");
                    toast.success("Local app authentication enabled");
                  } catch (e: any) {
                    toast.error(e.message);
                  } finally {
                    setChangingAppPassword(false);
                  }
                }}
                disabled={changingAppPassword || !newAppPassword || !confirmAppPassword}
              >
                {changingAppPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enable app password
              </Button>
            </>
          ) : (
            <>
              <div className="grid gap-2">
                <Label>Current password</Label>
                <Input
                  type="password"
                  value={currentAppPassword}
                  onChange={(e) => setCurrentAppPassword(e.target.value)}
                  placeholder="Current password"
                />
              </div>
              <div className="grid gap-2">
                <Label>New password</Label>
                <Input
                  type="password"
                  value={newAppPassword}
                  onChange={(e) => setNewAppPassword(e.target.value)}
                  placeholder="New password"
                />
              </div>
              <div className="grid gap-2">
                <Label>Confirm new password</Label>
                <Input
                  type="password"
                  value={confirmAppPassword}
                  onChange={(e) => setConfirmAppPassword(e.target.value)}
                  placeholder="Repeat new password"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    if (newAppPassword !== confirmAppPassword) {
                      toast.error("Passwords do not match");
                      return;
                    }
                    setChangingAppPassword(true);
                    try {
                      await auth.changePassword(currentAppPassword, newAppPassword);
                      setCurrentAppPassword("");
                      setNewAppPassword("");
                      setConfirmAppPassword("");
                      toast.success("App password updated");
                    } catch (e: any) {
                      toast.error(e.message);
                    } finally {
                      setChangingAppPassword(false);
                    }
                  }}
                  disabled={
                    changingAppPassword ||
                    !currentAppPassword ||
                    !newAppPassword ||
                    !confirmAppPassword
                  }
                >
                  {changingAppPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Change password
                </Button>
                <Button variant="outline" onClick={() => void auth.logout()}>
                  Lock now
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provider Profile</CardTitle>
          <CardDescription>Choose a starting profile, then override URL or model if needed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {PROFILES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => applyProfile(item.key)}
              className={`rounded-lg border p-4 text-left ${profile.key === item.key ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}
            >
              <div className="font-medium">{item.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{item.hint}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                {item.apiKeyRequired ? "API key required" : "No key required by default"}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            Active profile: <code>{profile.label}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">API mode</div>
              <div className="mt-1 text-lg font-semibold">{health?.primary.apiMode || "-"}</div>
              <div className="mt-1 text-xs text-muted-foreground">How Wings Of World will call the active provider.</div>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Stored key</div>
              <div className="mt-1 text-lg font-semibold">{settings?.hasApiKey ? "Present" : "Missing"}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {settings?.hasApiKey ? settings.apiKeyMasked : "No saved credential yet"}
              </div>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Connection state</div>
              <div className="mt-1 text-lg font-semibold">{configured ? "Ready" : "Partial"}</div>
              <div className="mt-1 text-xs text-muted-foreground">Use Test connection after any endpoint change.</div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Base URL</Label>
            <Input
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder={profile.provider === "codex_local" ? "codex://local" : "https://api.openai.com/v1"}
            />
          </div>

          <div className="grid gap-2">
            <Label>Default Model</Label>
            {profile.key === "openrouter" && (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="rounded-full">all {openrouterSummary.total}</Badge>
                <Badge variant="outline" className="rounded-full">vision {openrouterSummary.vision}</Badge>
                <Badge variant="outline" className="rounded-full">video in {openrouterSummary.videoIn}</Badge>
                <Badge variant="outline" className="rounded-full">image out {openrouterSummary.image}</Badge>
                <Badge variant="outline" className="rounded-full">video out {openrouterSummary.video}</Badge>
              </div>
            )}
            {profileModels.length > 0 ? (
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <ModelSelectItems
                    models={profileModels}
                    profileKey={profileKey}
                    currentModel={model}
                    catalogById={openrouterCatalogById}
                  />
                </SelectContent>
              </Select>
            ) : (
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
            )}
          </div>

          <div className="grid gap-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                profile.apiKeyRequired
                  ? settings?.hasApiKey
                    ? `current: ${settings.apiKeyMasked} (leave blank to keep)`
                    : "sk-..."
                  : profile.provider === "codex_local"
                    ? "Uses the Codex login already active on this machine"
                    : "Optional for this profile"
              }
              disabled={profile.provider === "codex_local"}
            />
            <p className="text-xs text-muted-foreground">
              {profile.provider === "codex_local"
                ? "This profile calls the local Codex CLI and uses the ChatGPT login already stored on the machine."
                : profile.apiKeyRequired
                ? "This profile requires an API key unless your provider overrides auth upstream."
                : "This profile can work without a key when running on a local OpenAI-compatible server."}
            </p>
          </div>

          {validationError && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900">
              {validationError}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving || Boolean(validationError)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            <Button variant="secondary" onClick={test} disabled={testDisabled}>
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test connection
            </Button>
            <Button
              variant="outline"
              onClick={clearStoredKey}
              disabled={clearingKey || !settings?.hasApiKey}
            >
              {clearingKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Clear stored key
            </Button>
          </div>

          {testResult && (
            <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${testResult.ok ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"}`}>
              {testResult.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" />
              )}
              <div className="whitespace-pre-line break-all">{testResult.msg}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fallback Provider</CardTitle>
          <CardDescription>
            Use a standby provider automatically when the primary provider hits quota or upstream failures.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="font-medium">Enable fallback routing</div>
              <div className="text-sm text-muted-foreground">
                Recommended for Telegram and unattended runs.
              </div>
            </div>
            <Switch checked={fallbackEnabled} onCheckedChange={setFallbackEnabled} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">State</div>
              <div className="mt-1 text-lg font-semibold">{fallbackEnabled ? "Enabled" : "Disabled"}</div>
              <div className="mt-1 text-xs text-muted-foreground">Fallback only activates on upstream failure or quota trouble.</div>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Configured</div>
              <div className="mt-1 text-lg font-semibold">{fallbackConfigured ? "Ready" : fallbackEnabled ? "Partial" : "Standby"}</div>
              <div className="mt-1 text-xs text-muted-foreground">{settings?.fallback?.model || "No fallback model selected yet"}</div>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Runtime</div>
              <div className="mt-1 text-lg font-semibold">{health?.fallback.enabled ? health?.fallback.apiMode : "-"}</div>
              <div className="mt-1 text-xs text-muted-foreground">Fallback call path when it is used.</div>
            </div>
          </div>

          {fallbackEnabled && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {PROFILES.map((item) => (
                  <button
                    key={`fallback-${item.key}`}
                    type="button"
                    onClick={() => applyFallbackProfile(item.key)}
                    className={`rounded-lg border p-4 text-left ${fallbackProfile.key === item.key ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}
                  >
                    <div className="font-medium">{item.label}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{item.hint}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {item.apiKeyRequired ? "API key required" : "No key required by default"}
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid gap-2">
                <Label>Fallback Base URL</Label>
                <Input
                  value={fallbackBaseURL}
                  onChange={(e) => setFallbackBaseURL(e.target.value)}
                  placeholder={fallbackProfile.provider === "codex_local" ? "codex://local" : "https://api.openai.com/v1"}
                />
              </div>

              <div className="grid gap-2">
                <Label>Fallback Model</Label>
                {fallbackProfile.models.length > 0 ? (
                  <Select value={fallbackModel} onValueChange={setFallbackModel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <ModelSelectItems models={fallbackProfile.models} profileKey={fallbackProfileKey} currentModel={fallbackModel} />
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={fallbackModel} onChange={(e) => setFallbackModel(e.target.value)} placeholder="llama3.1" />
                )}
              </div>

              <div className="grid gap-2">
                <Label>Fallback API Key</Label>
                <Input
                  type="password"
                  value={fallbackApiKey}
                  onChange={(e) => setFallbackApiKey(e.target.value)}
                  placeholder={
                    fallbackProfile.apiKeyRequired
                      ? settings?.fallback?.hasApiKey
                        ? `current: ${settings?.fallback?.apiKeyMasked} (leave blank to keep)`
                        : "sk-..."
                      : fallbackProfile.provider === "codex_local"
                        ? "Uses the Codex login already active on this machine"
                        : "Optional for this profile"
                  }
                  disabled={fallbackProfile.provider === "codex_local"}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={clearFallbackStoredKey}
                    disabled={clearingFallbackKey || !settings?.fallback?.hasApiKey}
                  >
                    {clearingFallbackKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Clear fallback key
                  </Button>
                </div>
              </div>

              {fallbackValidationError && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900">
                  {fallbackValidationError}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search Tools</CardTitle>
          <CardDescription>
            Web search is available as a tool in Chat and Workflows. DuckDuckGo works without a key; Brave requires one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
              DuckDuckGo - active, no key required
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Use the <code className="rounded bg-muted px-1">web_search</code> tool in any Chat session.</p>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Brave Search API Key
              {settings?.hasBraveApiKey && !braveApiKey && (
                <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">configured</Badge>
              )}
            </Label>
            <Input
              type="password"
              placeholder={settings?.hasBraveApiKey ? "Enter new key to replace stored key" : "BSA..."}
              value={braveApiKey}
              onChange={(e) => setBraveApiKey(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Enables the <code className="rounded bg-muted px-1">brave_search</code> tool with country and time filters.{" "}
              Get your key at{" "}
              <a href="https://brave.com/search/api/" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                brave.com/search/api/
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing Overrides</CardTitle>
          <CardDescription>
            Optional JSON map of model name to USD rate per 1K tokens. Used for cost estimation in Chat, Workflow, History, and Console.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRICING_PRESETS.map((preset) => (
              <div key={preset.key} className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPricingPreset(preset.key)}
                >
                  Replace: {preset.label}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => mergePricingPreset(preset.key)}
                >
                  Merge: {preset.label}
                </Button>
              </div>
            ))}
          </div>
          <Textarea
            value={pricingOverridesText}
            onChange={(e) => setPricingOverridesText(e.target.value)}
            className="min-h-[180px] font-mono text-xs"
            placeholder={`{\n  "gpt-5.4": 0.012,\n  "llama3.1": 0\n}`}
          />
          {pricingOverridesError && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900">
              {pricingOverridesError}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[1.5rem]">
        <CardHeader>
          <CardTitle>Current state</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <StateRow label="Provider" value={settings?.provider || "-"} />
          <StateRow label="Configured" value={configured ? "ready" : "partial"} />
          <StateRow label="Base URL" value={settings?.baseURL || "-"} breakAll />
          <StateRow label="Model" value={settings?.model || "-"} />
          <StateRow
            label="Key"
            value={settings?.hasApiKey ? settings.apiKeyMasked : profile.apiKeyRequired ? "(not set)" : "(optional)"}
          />
          <StateRow label="Fallback enabled" value={settings?.fallback?.enabled ? "yes" : "no"} />
          <StateRow label="Fallback provider" value={settings?.fallback?.provider || "-"} />
          <StateRow
            label="Fallback configured"
            value={fallbackConfigured ? "ready" : settings?.fallback?.enabled ? "partial" : "disabled"}
          />
          <StateRow label="Fallback model" value={settings?.fallback?.model || "-"} />
          <StateRow label="Pricing overrides" value={String(Object.keys(settings?.pricingOverrides || {}).length)} />
          <StateRow label="Brave API key" value={settings?.hasBraveApiKey ? "configured" : "not set"} />
          <StateRow label="App auth" value={settings?.authEnabled ? "enabled" : "disabled"} />
          <StateRow label="Updated" value={settings?.updatedAt || "-"} />
          <div className="md:col-span-2">
            <StateRow label="Data dir" value={settings?.dataDir || "-"} breakAll />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[1.5rem]">
        <CardHeader>
          <CardTitle>Provider Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <StateRow label="Primary runtime" value={`${health?.primary.provider || "-"} / ${health?.primary.model || "-"}`} />
            <StateRow label="Primary API mode" value={health?.primary.apiMode || "-"} />
            <StateRow label="Fallback runtime" value={health?.fallback.enabled ? `${health?.fallback.provider} / ${health?.fallback.model}` : "disabled"} />
            <StateRow label="Active issue" value={health?.lastIssue?.summary || "-"} breakAll />
            <div className="md:col-span-2">
              <StateRow label="Last issue seen" value={health?.lastIssueHistory?.summary || "-"} breakAll />
            </div>
          </div>
          {health?.warnings?.length ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900">
              {health.warnings.map((warning, index) => (
                <div key={`${warning}-${index}`}>{warning}</div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operational notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div>OpenAI: use the standard public endpoint and an OpenAI API key.</div>
          <div>OpenAI Codex: pick the Codex profile when you want coding-tuned OpenAI models such as <code>gpt-5-codex</code> or <code>gpt-5.2-codex</code>.</div>
          <div>Codex Local Login: uses the <code>codex</code> CLI already logged in on this machine and does not require storing another API key in Wings Of World.</div>
          <div>Fallback provider: use a local model such as Ollama or LM Studio if you want Telegram and automations to keep running during upstream quota limits.</div>
          <div>Wings Of World now uses OpenAI <code>Responses API</code> automatically for the official OpenAI endpoint, while Azure and custom OpenAI-compatible servers stay on the existing compatibility path.</div>
          <div>Azure OpenAI: the URL must include the deployment path, not only the resource host.</div>
          <div>OpenRouter: models usually include vendor prefixes such as <code>openai/gpt-4o-mini</code>.</div>
          <div>Ollama / LM Studio: local endpoints usually work without an API key when they expose an OpenAI-compatible server.</div>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsMetric({
  title,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "ready" | "warning";
}) {
  return (
    <div className="rounded-[1.5rem] border bg-card/85 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${
            tone === "ready" ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${
            tone === "ready" ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"
          }`}
        >
          {tone}
        </span>
      </div>
      <div className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="mt-2 text-sm leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}

function StateRow({
  label,
  value,
  breakAll = false,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-muted/15 p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`mt-2 font-mono text-sm ${breakAll ? "break-all" : ""}`}>{value}</div>
    </div>
  );
}
