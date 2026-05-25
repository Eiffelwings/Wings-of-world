// Cascade runtime — orchestrates the classify → pick → call → maybe-escalate
// flow. Takes the LLM caller via dependency injection so the unit tests can
// drive it with a fake without booting the real provider stack.

import {
  classifyComplexity,
  pickStartingTier,
  confidenceFromResponse,
  decideEscalation,
  type CascadeMode,
  type ComplexityResult,
  type ConfidenceResult,
  type ModelTarget,
  type Tier,
  type TierConfig,
} from "../lib/model-cascade.js";

export interface CascadeAttempt {
  tier: Tier;
  target: ModelTarget;
  content: string;
  confidence: ConfidenceResult;
  tokensTotal?: number;
  durationMs: number;
  escalated: boolean;
  escalationReason?: string;
}

export interface CascadeRecord {
  mode: CascadeMode;
  complexity: ComplexityResult;
  startingTier: Tier | null;
  finalTier: Tier | null;
  attempts: CascadeAttempt[];
  escalations: number;
  totalDurationMs: number;
}

export interface CascadeResult {
  content: string;
  finalTarget: ModelTarget | null;
  record: CascadeRecord;
}

export interface CascadeDeps {
  /** Generate a response with the given model target. */
  generate: (target: ModelTarget, options: { tier: Tier }) => Promise<{ content: string; tokensTotal?: number }>;
}

export interface CascadeOptions {
  /** Conversation messages to drive complexity classification. */
  messages: Array<{ role: string; content: string | unknown }>;
  /** User-configured tier targets. Tiers without a target are skipped. */
  tiers: TierConfig;
  mode: CascadeMode;
  /** Override confidence threshold for escalation. Defaults to 0.55. */
  escalationThreshold?: number;
  /** Cap how many escalations we allow. Defaults to 2 (so 3 total tries). */
  maxEscalations?: number;
}

const DEFAULT_MAX_ESCALATIONS = 2;

export async function runCascade(
  options: CascadeOptions,
  deps: CascadeDeps,
): Promise<CascadeResult> {
  const start = Date.now();
  const complexity = classifyComplexity(options.messages, {
    systemPromptIsLong:
      (options.messages.find((m) => m.role === "system")?.content?.toString().length ?? 0) > 500,
  });
  const startingTier = pickStartingTier(complexity.complexity, options.mode, options.tiers);
  const attempts: CascadeAttempt[] = [];

  if (!startingTier || options.mode === "off") {
    return {
      content: "",
      finalTarget: null,
      record: {
        mode: options.mode,
        complexity,
        startingTier: null,
        finalTier: null,
        attempts: [],
        escalations: 0,
        totalDurationMs: Date.now() - start,
      },
    };
  }

  const maxEscalations = options.maxEscalations ?? DEFAULT_MAX_ESCALATIONS;
  let currentTier: Tier = startingTier;
  let escalations = 0;
  let lastContent = "";
  let lastTarget: ModelTarget | null = null;

  while (true) {
    const target = options.tiers[currentTier]!;
    const attemptStart = Date.now();
    const { content, tokensTotal } = await deps.generate(target, { tier: currentTier });
    const confidence = confidenceFromResponse(content);
    const decision = decideEscalation({
      mode: options.mode,
      currentTier,
      tiers: options.tiers,
      complexity: complexity.complexity,
      confidence,
      threshold: options.escalationThreshold,
    });

    const attempt: CascadeAttempt = {
      tier: currentTier,
      target,
      content,
      confidence,
      tokensTotal,
      durationMs: Date.now() - attemptStart,
      escalated: decision.shouldEscalate && escalations < maxEscalations,
      escalationReason: decision.shouldEscalate ? decision.reason : undefined,
    };
    attempts.push(attempt);
    lastContent = content;
    lastTarget = target;

    if (!decision.shouldEscalate || !decision.nextTier || escalations >= maxEscalations) {
      break;
    }
    currentTier = decision.nextTier;
    escalations++;
  }

  return {
    content: lastContent,
    finalTarget: lastTarget,
    record: {
      mode: options.mode,
      complexity,
      startingTier,
      finalTier: attempts.length > 0 ? attempts[attempts.length - 1].tier : null,
      attempts,
      escalations,
      totalDurationMs: Date.now() - start,
    },
  };
}

// -----------------------------------------------------------------------------
// Default tier presets — used when the user hasn't configured anything yet.
// We pick targets that work with whatever provider Wings is currently set up
// with, so the cascade never silently falls back to "always large".
// -----------------------------------------------------------------------------

export const CASCADE_DEFAULT_TIERS_BY_PROVIDER: Record<string, TierConfig> = {
  anthropic: {
    small: { provider: "anthropic", model: "claude-haiku-4" },
    medium: { provider: "anthropic", model: "claude-sonnet-4-6" },
    large: { provider: "anthropic", model: "claude-opus-4" },
  },
  openai: {
    small: { provider: "openai", model: "gpt-4o-mini", baseURL: "https://api.openai.com/v1" },
    medium: { provider: "openai", model: "gpt-4o", baseURL: "https://api.openai.com/v1" },
    large: { provider: "openai", model: "gpt-5.4", baseURL: "https://api.openai.com/v1" },
  },
  // OpenRouter — single API key handles all three tiers.
  openrouter: {
    small: { provider: "custom", model: "openai/gpt-4o-mini", baseURL: "https://openrouter.ai/api/v1" },
    medium: { provider: "custom", model: "anthropic/claude-sonnet-4.6", baseURL: "https://openrouter.ai/api/v1" },
    large: { provider: "custom", model: "openai/gpt-5.4", baseURL: "https://openrouter.ai/api/v1" },
  },
};

export function defaultTiersFor(currentBaseURL: string, currentProvider: string): TierConfig {
  if (/openrouter\.ai/.test(currentBaseURL)) return CASCADE_DEFAULT_TIERS_BY_PROVIDER.openrouter;
  if (currentProvider === "anthropic") return CASCADE_DEFAULT_TIERS_BY_PROVIDER.anthropic;
  if (currentProvider === "openai") return CASCADE_DEFAULT_TIERS_BY_PROVIDER.openai;
  return {};
}
