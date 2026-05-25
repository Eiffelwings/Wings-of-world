import { describe, it, expect } from "vitest";
import {
  DEFAULT_TELEGRAM_MODEL_PRESETS,
  buildTelegramModelKeyboard,
  parseModelCallback,
  findModelPresetIndex,
  filterPresetsByCategory,
  findPresetCategory,
  TELEGRAM_MODEL_BUTTONS_PER_PAGE,
  OPENROUTER_BASE_URL,
} from "../features/telegram-models.js";

describe("telegram model picker", () => {
  describe("preset catalogue", () => {
    it("includes the user-requested models", () => {
      const ids = DEFAULT_TELEGRAM_MODEL_PRESETS.map((p) => p.model);
      expect(ids).toContain("deepseek-v4-pro");
      expect(ids).toContain("deepseek-v4-flash");
      expect(ids).toContain("glm-5.1");
      expect(ids).toContain("google/gemma-4-26b-a4b-it:free");
      expect(ids).toContain("qwen3.6-plus");
      expect(ids).toContain("kimi-k2.6");
    });

    it("every preset has a label and a provider", () => {
      for (const preset of DEFAULT_TELEGRAM_MODEL_PRESETS) {
        expect(preset.label.length).toBeGreaterThan(0);
        expect(preset.provider).toBeDefined();
        expect(preset.model.length).toBeGreaterThan(0);
      }
    });

    it("preset labels stay under Telegram's 64-byte button limit", () => {
      for (const preset of DEFAULT_TELEGRAM_MODEL_PRESETS) {
        const tier = preset.tier ? `${preset.tier} ` : "";
        const text = `✅ ${tier}${preset.label}`;
        // Telegram caps callback button text at 64 bytes (UTF-8).
        expect(Buffer.byteLength(text, "utf-8")).toBeLessThanOrEqual(64);
      }
    });
  });

  describe("findModelPresetIndex", () => {
    it("returns the index of a matching preset", () => {
      const idx = findModelPresetIndex(DEFAULT_TELEGRAM_MODEL_PRESETS, "anthropic", "claude-sonnet-4-6");
      expect(idx).toBeGreaterThanOrEqual(0);
    });

    it("returns -1 when no preset matches", () => {
      expect(findModelPresetIndex(DEFAULT_TELEGRAM_MODEL_PRESETS, "openai", "gpt-imaginary"))
        .toBe(-1);
    });
  });

  describe("buildTelegramModelKeyboard", () => {
    it("renders model rows of at most two buttons each", () => {
      const kb = buildTelegramModelKeyboard({ page: 0 });
      // Filter to rows that contain only model:set:* buttons — skip the tab
      // toggle row (which can hold 2-3 buttons depending on tab count) and
      // the navigation/footer rows.
      const modelRows = kb.inline_keyboard.filter(
        (row) => row.length > 0 && row.every((b) => (b.callback_data || "").startsWith("model:set:")),
      );
      expect(modelRows.length).toBeGreaterThan(0);
      for (const row of modelRows) {
        expect(row.length).toBeLessThanOrEqual(2);
        for (const btn of row) {
          expect(btn.callback_data).toMatch(/^model:set:\d+$/);
          expect(Buffer.byteLength(btn.callback_data!, "utf-8")).toBeLessThanOrEqual(64);
        }
      }
    });

    it("renders pagination when there are more presets than fit on one page", () => {
      // Force a small page size so paging activates regardless of catalogue size.
      const kb = buildTelegramModelKeyboard({ pageSize: 2, page: 0 });
      const callbackTexts = kb.inline_keyboard.flat().map((b) => b.callback_data || "");
      // Page navigation now carries the tab in the callback (model:nav:TAB:N).
      expect(callbackTexts.some((c) => /^model:nav:[a-z_]+:\d+$/.test(c))).toBe(true);
      expect(callbackTexts.some((c) => c === "model:close")).toBe(true);
    });

    it("marks the active model with a check mark", () => {
      // Pick the first preset whose category is "direct" so the default tab
      // ("direct") actually contains the active row.
      const active = DEFAULT_TELEGRAM_MODEL_PRESETS.find((p) => (p.category ?? "direct") === "direct")!;
      const kb = buildTelegramModelKeyboard({
        tab: "direct",
        active: { provider: active.provider, model: active.model },
      });
      const flat = kb.inline_keyboard.flat();
      const checked = flat.find((btn) => btn.text.startsWith("✅"));
      expect(checked).toBeDefined();
      expect(checked?.text).toContain(active.label);
    });

    it("clamps page to the available range", () => {
      const kb = buildTelegramModelKeyboard({ page: 999 });
      // A clamped page should still produce a valid keyboard with at least the footer row.
      expect(kb.inline_keyboard.length).toBeGreaterThan(0);
    });

    it("does not render pagination row when everything fits", () => {
      // Use the first 2 direct presets and request the direct tab so all of
      // them appear together with no pagination.
      const small = DEFAULT_TELEGRAM_MODEL_PRESETS.slice(0, 2);
      const kb = buildTelegramModelKeyboard({ presets: small, tab: "direct" });
      const flat = kb.inline_keyboard.flat().map((b) => b.callback_data || "");
      // No "Page X/Y" indicator when everything fits.
      expect(flat.some((c) => c === "model:noop")).toBe(false);
    });
  });

  describe("OpenRouter tab", () => {
    it("ships OpenRouter-routed presets pointing at openrouter.ai", () => {
      const ors = filterPresetsByCategory(DEFAULT_TELEGRAM_MODEL_PRESETS, "openrouter");
      expect(ors.length).toBeGreaterThanOrEqual(10);
      for (const preset of ors) {
        expect(preset.baseURL).toBe(OPENROUTER_BASE_URL);
        // OpenRouter model ids use a vendor/model slash format.
        expect(preset.model).toMatch(/.+\/.+/);
      }
    });

    it("includes the user-requested OpenRouter rows", () => {
      const ors = filterPresetsByCategory(DEFAULT_TELEGRAM_MODEL_PRESETS, "openrouter");
      const ids = ors.map((p) => p.model);
      expect(ids).toContain("deepseek/deepseek-v4-pro");
      expect(ids).toContain("z-ai/glm-5.1");
      expect(ids).toContain("google/gemma-4-26b-a4b-it:free");
      expect(ids).toContain("qwen/qwen3.6-plus");
      expect(ids).toContain("moonshotai/kimi-k2.6");
    });

    it("renders a tab toggle row covering every present category", () => {
      const kb = buildTelegramModelKeyboard({ tab: "direct" });
      const tabRow = kb.inline_keyboard[0];
      const callbacks = tabRow.map((b) => b.callback_data || "");
      expect(callbacks).toContain("model:tab:direct");
      expect(callbacks).toContain("model:tab:openrouter");
      // Local tab appears whenever any preset is tagged "local" (Ollama).
      expect(callbacks).toContain("model:tab:local");
    });

    it("the local tab only shows ollama / local presets", () => {
      const local = filterPresetsByCategory(DEFAULT_TELEGRAM_MODEL_PRESETS, "local");
      expect(local.length).toBeGreaterThan(0);
      for (const preset of local) {
        // Local presets should never point at a remote provider URL.
        expect(preset.baseURL || "").toMatch(/(localhost|127\.0\.0\.1)/);
      }
    });

    it("only shows presets from the active tab", () => {
      const kb = buildTelegramModelKeyboard({ tab: "openrouter", page: 0 });
      const flat = kb.inline_keyboard.flat();
      const setButtons = flat.filter((b) => (b.callback_data || "").startsWith("model:set:"));
      const indices = setButtons.map((b) => Number((b.callback_data || "").split(":")[2]));
      // Every shown index should belong to the openrouter category.
      for (const idx of indices) {
        expect(findPresetCategory(DEFAULT_TELEGRAM_MODEL_PRESETS, idx)).toBe("openrouter");
      }
    });

    it("nav callbacks carry the active tab so pagination stays sticky", () => {
      const kb = buildTelegramModelKeyboard({ tab: "openrouter", pageSize: 2 });
      const flat = kb.inline_keyboard.flat();
      const navButtons = flat.filter((b) => (b.callback_data || "").startsWith("model:nav:"));
      expect(navButtons.length).toBeGreaterThan(0);
      for (const btn of navButtons) {
        expect(btn.callback_data).toMatch(/^model:nav:openrouter:\d+$/);
      }
    });

    it("hides the tab toggle when only one category is present", () => {
      const direct = filterPresetsByCategory(DEFAULT_TELEGRAM_MODEL_PRESETS, "direct");
      const kb = buildTelegramModelKeyboard({ presets: direct, tab: "direct" });
      const flat = kb.inline_keyboard.flat();
      const tabButtons = flat.filter((b) => (b.callback_data || "").startsWith("model:tab:"));
      expect(tabButtons).toHaveLength(0);
    });
  });

  describe("parseModelCallback", () => {
    it("parses model:noop", () => {
      expect(parseModelCallback("model:noop")).toEqual({ type: "noop" });
    });

    it("parses model:close", () => {
      expect(parseModelCallback("model:close")).toEqual({ type: "close" });
    });

    it("parses model:page:N (legacy)", () => {
      expect(parseModelCallback("model:page:2")).toEqual({ type: "page", page: 2 });
    });

    it("parses model:nav:TAB:N with tab context", () => {
      expect(parseModelCallback("model:nav:openrouter:3"))
        .toEqual({ type: "nav", tab: "openrouter", page: 3 });
      expect(parseModelCallback("model:nav:direct:0"))
        .toEqual({ type: "nav", tab: "direct", page: 0 });
    });

    it("parses model:tab:NAME for every supported category", () => {
      expect(parseModelCallback("model:tab:openrouter"))
        .toEqual({ type: "tab", tab: "openrouter" });
      expect(parseModelCallback("model:tab:direct"))
        .toEqual({ type: "tab", tab: "direct" });
      expect(parseModelCallback("model:tab:local"))
        .toEqual({ type: "tab", tab: "local" });
    });

    it("returns 'unknown' for an invalid tab name", () => {
      expect(parseModelCallback("model:tab:bogus").type).toBe("unknown");
      expect(parseModelCallback("model:nav:bogus:0").type).toBe("unknown");
    });

    it("parses model:set:N and resolves the preset", () => {
      const result = parseModelCallback("model:set:0");
      expect(result.type).toBe("set");
      if (result.type === "set") {
        expect(result.index).toBe(0);
        expect(result.preset).toEqual(DEFAULT_TELEGRAM_MODEL_PRESETS[0]);
      }
    });

    it("returns 'unknown' for set with an out-of-range index", () => {
      const result = parseModelCallback("model:set:99999");
      expect(result.type).toBe("unknown");
    });

    it("returns 'unknown' for unrelated payloads", () => {
      expect(parseModelCallback("not:a:model:thing").type).toBe("unknown");
    });
  });

  describe("page size constant", () => {
    it("uses an even page size so rows pair up cleanly", () => {
      expect(TELEGRAM_MODEL_BUTTONS_PER_PAGE % 2).toBe(0);
    });
  });
});
