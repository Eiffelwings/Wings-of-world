// Telegram model picker — pure logic for the inline keyboard menu.
// index.ts wires this into the actual Telegram API; the keyboard builder
// and callback dispatcher are pulled out here so they're unit-testable
// without booting the whole server.

export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineButton[][];
}

export type ModelCategory = "direct" | "openrouter" | "local";

export interface TelegramModelPreset {
  /** Short label shown on the button. */
  label: string;
  /** Tier emoji prepended to the label. */
  tier?: string;
  /** Provider key matching AppConfig.provider. */
  provider: "openai" | "anthropic" | "custom" | "codex" | "codex_local" | "ollama";
  /** Model identifier sent to the provider. */
  model: string;
  /** Provider baseURL override. */
  baseURL?: string;
  /**
   * Source of the model. "direct" = provider's native API, "openrouter" =
   * routed through openrouter.ai. Categories show up as tabs in the picker.
   */
  category?: ModelCategory;
}

export const TELEGRAM_MODEL_BUTTONS_PER_PAGE = 8;
export const DEFAULT_MODEL_CATEGORY: ModelCategory = "direct";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const directPresets: TelegramModelPreset[] = [
  // Local AI (Ollama)
  { label: "Ollama · Llama 3", tier: "🏠", provider: "ollama", model: "llama3", baseURL: "http://localhost:11434/v1", category: "local" },
  { label: "Ollama · Mistral", tier: "🏠", provider: "ollama", model: "mistral", baseURL: "http://localhost:11434/v1", category: "local" },
  // OpenAI
  { label: "OpenAI · GPT-5", tier: "🥇", provider: "openai", model: "gpt-5", baseURL: "https://api.openai.com/v1", category: "direct" },
  { label: "OpenAI · GPT-4o", tier: "🥈", provider: "openai", model: "gpt-4o", baseURL: "https://api.openai.com/v1", category: "direct" },
  { label: "OpenAI · 4o mini", tier: "💸", provider: "openai", model: "gpt-4o-mini", baseURL: "https://api.openai.com/v1", category: "direct" },
  // Anthropic
  { label: "Claude Opus 4", tier: "🥇", provider: "anthropic", model: "claude-opus-4", category: "direct" },
  { label: "Claude Sonnet 4.6", tier: "🥈", provider: "anthropic", model: "claude-sonnet-4-6", category: "direct" },
  { label: "Claude Haiku 4", tier: "💸", provider: "anthropic", model: "claude-haiku-4", category: "direct" },
  // DeepSeek
  { label: "DeepSeek v4 Pro", tier: "🥇", provider: "custom", model: "deepseek-v4-pro", baseURL: "https://api.deepseek.com/v1", category: "direct" },
  { label: "DeepSeek v4 Flash", tier: "💸", provider: "custom", model: "deepseek-v4-flash", baseURL: "https://api.deepseek.com/v1", category: "direct" },
  // Z.ai
  { label: "Z.ai GLM-5.1", tier: "🥈", provider: "custom", model: "glm-5.1", baseURL: "https://open.bigmodel.cn/api/paas/v4", category: "direct" },
  // Gemini (Google AI Studio)
  { label: "Gemini 2.5 Pro", tier: "🥇", provider: "custom", model: "gemini-2.5-pro-preview-05-06", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", category: "direct" },
  // Qwen
  { label: "Qwen 3.6 Plus", tier: "🥈", provider: "custom", model: "qwen3.6-plus", baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", category: "direct" },
  // Moonshot
  { label: "Kimi k2.6", tier: "🥈", provider: "custom", model: "kimi-k2.6", baseURL: "https://api.moonshot.ai/v1", category: "direct" },
  // Groq (fast)
  { label: "Groq Llama 3.3 70B", tier: "⚡", provider: "custom", model: "llama-3.3-70b-versatile", baseURL: "https://api.groq.com/openai/v1", category: "direct" },
];

// OpenRouter routes 200+ models through one OAI-compatible endpoint with one
// API key. Curated subset spanning premium / free / specialty so the user can
// pick by use case. The `:free` variants are always nice for Telegram chat.
const openRouterPresets: TelegramModelPreset[] = [
  // Premium reasoning
  { label: "OR · GPT-5", tier: "🥇", provider: "custom", model: "openai/gpt-5", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · Claude Opus 4", tier: "🥇", provider: "custom", model: "anthropic/claude-opus-4", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · Sonnet 4.6", tier: "🥈", provider: "custom", model: "anthropic/claude-sonnet-4.6", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · Gemini 2.5 Pro", tier: "🥇", provider: "custom", model: "google/gemini-2.5-pro-preview", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  // Open-weight flagship
  { label: "OR · DeepSeek v4 Pro", tier: "🥇", provider: "custom", model: "deepseek/deepseek-v4-pro", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · DeepSeek v4 Flash", tier: "💸", provider: "custom", model: "deepseek/deepseek-v4-flash", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · Qwen 3.6 Plus", tier: "🥈", provider: "custom", model: "qwen/qwen3.6-plus", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · Kimi k2.6", tier: "🥈", provider: "custom", model: "moonshotai/kimi-k2.6", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · GLM-5.1", tier: "🥈", provider: "custom", model: "z-ai/glm-5.1", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · Llama 4 Maverick", tier: "🥈", provider: "custom", model: "meta-llama/llama-4-maverick", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · Llama 4 Scout", tier: "💸", provider: "custom", model: "meta-llama/llama-4-scout", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · Mistral Large", tier: "🥈", provider: "custom", model: "mistralai/mistral-large-2411", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · Grok 3 mini", tier: "💸", provider: "custom", model: "x-ai/grok-3-mini-beta", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  // Coding-focused
  { label: "OR · Qwen3 Coder", tier: "💻", provider: "custom", model: "qwen/qwen3-coder-plus", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · Codestral", tier: "💻", provider: "custom", model: "mistralai/codestral-2501", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  // Free tier (great for Telegram)
  { label: "OR · Gemma 4-26b free", tier: "🆓", provider: "custom", model: "google/gemma-4-26b-a4b-it:free", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · DeepSeek R1 free", tier: "🆓", provider: "custom", model: "deepseek/deepseek-r1:free", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
  { label: "OR · Llama 4 Scout free", tier: "🆓", provider: "custom", model: "meta-llama/llama-4-scout:free", baseURL: OPENROUTER_BASE_URL, category: "openrouter" },
];

export const DEFAULT_TELEGRAM_MODEL_PRESETS: TelegramModelPreset[] = [
  ...directPresets,
  ...openRouterPresets,
];

export function filterPresetsByCategory(
  presets: TelegramModelPreset[],
  category: ModelCategory,
): TelegramModelPreset[] {
  return presets.filter((p) => (p.category ?? DEFAULT_MODEL_CATEGORY) === category);
}

/** When given a global preset index, return its position within its tab. */
export function findPresetCategory(
  presets: TelegramModelPreset[],
  index: number,
): ModelCategory {
  const preset = presets[index];
  return preset?.category ?? DEFAULT_MODEL_CATEGORY;
}

export function findModelPresetIndex(
  presets: TelegramModelPreset[],
  provider: string,
  model: string,
): number {
  return presets.findIndex((p) => p.provider === provider && p.model === model);
}

export interface KeyboardOptions {
  presets?: TelegramModelPreset[];
  pageSize?: number;
  page?: number;
  /**
   * Which tab is currently active. The keyboard only shows presets whose
   * `category` matches this tab; a header row toggles between tabs.
   */
  tab?: ModelCategory;
  active?: { provider: string; model: string };
}

const TAB_ORDER: ModelCategory[] = ["direct", "openrouter", "local"];
const TAB_LABEL: Record<ModelCategory, string> = {
  direct: "Direct API",
  openrouter: "OpenRouter",
  local: "Local AI",
};

export function buildTelegramModelKeyboard(options: KeyboardOptions = {}): TelegramInlineKeyboardMarkup {
  const allPresets = options.presets ?? DEFAULT_TELEGRAM_MODEL_PRESETS;
  const pageSize = options.pageSize ?? TELEGRAM_MODEL_BUTTONS_PER_PAGE;
  const tab = options.tab ?? DEFAULT_MODEL_CATEGORY;

  // Detect available tabs from the preset set (so a smaller catalogue used
  // in tests still hides empty tabs).
  const presentTabs = TAB_ORDER.filter((cat) =>
    allPresets.some((p) => (p.category ?? DEFAULT_MODEL_CATEGORY) === cat),
  );
  const showTabs = presentTabs.length > 1;

  // Filter to the active tab and remember the original global index for
  // each preset so callback payloads stay stable across tab switches.
  const indexed = allPresets
    .map((preset, globalIndex) => ({ preset, globalIndex }))
    .filter(({ preset }) => (preset.category ?? DEFAULT_MODEL_CATEGORY) === tab);

  const totalPages = Math.max(1, Math.ceil(indexed.length / pageSize));
  const safePage = Math.max(0, Math.min(options.page ?? 0, totalPages - 1));
  const start = safePage * pageSize;
  const slice = indexed.slice(start, start + pageSize);

  const activeGlobalIdx = options.active
    ? findModelPresetIndex(allPresets, options.active.provider, options.active.model)
    : -1;

  const rows: TelegramInlineButton[][] = [];

  // Tab toggle row.
  if (showTabs) {
    rows.push(
      presentTabs.map((cat) => {
        const isActive = cat === tab;
        return {
          text: `${isActive ? "▣" : "▢"} ${TAB_LABEL[cat]}`,
          callback_data: `model:tab:${cat}`,
        };
      }),
    );
  }

  // Model buttons (2 per row).
  for (let i = 0; i < slice.length; i += 2) {
    const row: TelegramInlineButton[] = [];
    for (const offset of [0, 1]) {
      const entry = slice[i + offset];
      if (!entry) continue;
      const tier = entry.preset.tier ? `${entry.preset.tier} ` : "";
      const active = entry.globalIndex === activeGlobalIdx ? "✅ " : "";
      row.push({
        text: `${active}${tier}${entry.preset.label}`,
        callback_data: `model:set:${entry.globalIndex}`,
      });
    }
    if (row.length > 0) rows.push(row);
  }

  if (totalPages > 1) {
    const prevPage = (safePage - 1 + totalPages) % totalPages;
    const nextPage = (safePage + 1) % totalPages;
    rows.push([
      { text: "◀︎ Prev", callback_data: `model:nav:${tab}:${prevPage}` },
      { text: `Page ${safePage + 1}/${totalPages}`, callback_data: `model:noop` },
      { text: "Next ▶︎", callback_data: `model:nav:${tab}:${nextPage}` },
    ]);
  }

  rows.push([
    { text: "🔄 Refresh", callback_data: `model:nav:${tab}:${safePage}` },
    { text: "❌ Close", callback_data: `model:close` },
  ]);
  return { inline_keyboard: rows };
}

export type ModelCallbackAction =
  | { type: "noop" }
  | { type: "close" }
  | { type: "page"; page: number }
  | { type: "nav"; tab: ModelCategory; page: number }
  | { type: "tab"; tab: ModelCategory }
  | { type: "set"; index: number; preset: TelegramModelPreset }
  | { type: "unknown"; data: string };

const VALID_TABS: ReadonlySet<ModelCategory> = new Set<ModelCategory>(["direct", "openrouter", "local"]);

export function parseModelCallback(
  data: string,
  presets: TelegramModelPreset[] = DEFAULT_TELEGRAM_MODEL_PRESETS,
): ModelCallbackAction {
  if (data === "model:noop") return { type: "noop" };
  if (data === "model:close") return { type: "close" };
  // New nav format carries both tab and page so navigation never drops the
  // user into a different tab from the one they're browsing.
  const nav = data.match(/^model:nav:([a-z_]+):(\d+)$/);
  if (nav) {
    const tabValue = nav[1] as ModelCategory;
    if (VALID_TABS.has(tabValue)) {
      return { type: "nav", tab: tabValue, page: Number(nav[2]) };
    }
    return { type: "unknown", data };
  }
  // Legacy single-page action — kept for backwards compatibility with
  // older keyboards still rendered in chat history.
  const page = data.match(/^model:page:(\d+)$/);
  if (page) return { type: "page", page: Number(page[1]) };
  const tab = data.match(/^model:tab:([a-z_]+)$/);
  if (tab) {
    const value = tab[1] as ModelCategory;
    if (VALID_TABS.has(value)) return { type: "tab", tab: value };
    return { type: "unknown", data };
  }
  const set = data.match(/^model:set:(\d+)$/);
  if (set) {
    const index = Number(set[1]);
    const preset = presets[index];
    if (!preset) return { type: "unknown", data };
    return { type: "set", index, preset };
  }
  return { type: "unknown", data };
}
