// Smart model cascade — classifies a request's complexity, picks the
// cheapest tier that should plausibly handle it, and (in aggressive mode)
// rates the response and escalates to a stronger tier when the smaller
// model looks uncertain. Pure logic only — the runtime piece lives in
// features/cascade-runtime.ts.

export type Complexity = "easy" | "medium" | "hard";
export type CascadeMode = "off" | "balanced" | "aggressive";
export type Tier = "small" | "medium" | "large";

export interface ModelTarget {
  provider: string;
  model: string;
  baseURL?: string;
}

export type TierConfig = Partial<Record<Tier, ModelTarget>>;

export interface ComplexityInput {
  role: string;
  content: string | unknown;
}

export interface ComplexityResult {
  complexity: Complexity;
  signals: string[];
  charCount: number;
  hasCode: boolean;
}

const TIER_ORDER: readonly Tier[] = ["small", "medium", "large"] as const;

const HARD_KEYWORDS = [
  "step by step", "step-by-step",
  "deep analysis", "detailed analysis",
  "prove ", "proof", "theorem",
  "refactor", "rewrite",
  "architect", "architecture",
  "comprehensive", "thoroughly",
  "explain in depth", "explain in detail",
  "วิเคราะห์เชิงลึก", "อธิบายโดยละเอียด", "พิสูจน์",
];

const EASY_GREETINGS = [
  "hi", "hello", "hey", "hola", "ok", "okay", "thanks", "thank you", "thx",
  "bye", "goodbye", "yes", "no", "yep", "nope",
  "สวัสดี", "ขอบคุณ", "ใช่", "ไม่", "โอเค", "ครับ", "ค่ะ",
];

const REFUSAL_MARKERS = [
  "i don't know",
  "i'm not sure",
  "i am not sure",
  "i cannot",
  "i can't help",
  "as an ai",
  "i'm sorry, but",
  "no information",
  "ไม่ทราบ",
  "ไม่เเน่ใจ",
  "ไม่สามารถ",
];

const UNCERTAINTY_MARKERS = [
  "might be", "could be", "perhaps",
  "i think", "i believe", "probably",
  "not entirely sure", "to my knowledge",
  "อาจจะ", "น่าจะ", "คิดว่า",
];

// ----------------------------------------------------------------------------
// Classification
// ----------------------------------------------------------------------------

export function classifyComplexity(
  messages: ComplexityInput[],
  options: { systemPromptIsLong?: boolean } = {},
): ComplexityResult {
  const lastUser = [...messages]
    .reverse()
    .find((m) => m.role === "user" && typeof m.content === "string");
  const text = typeof lastUser?.content === "string" ? lastUser.content.trim() : "";
  const lower = text.toLowerCase();
  const signals: string[] = [];
  const charCount = text.length;

  const hasCode = /```|\bclass\s|\bfunction\s|\bdef\s|\bSELECT\s|=>\s*\{|impl\s+\w/i.test(text);
  if (hasCode) signals.push("code");

  const codeLineCount = hasCode ? (text.match(/\n/g) || []).length : 0;
  const longCode = codeLineCount > 80;
  if (longCode) signals.push("long-code");

  const hasMath = /\$.+\$|\\(int|sum|frac|sqrt)|\^[2-9]|\\[a-z]+\{/.test(text);
  if (hasMath) signals.push("math");

  const hasMultipleQuestions = (text.match(/\?/g) || []).length >= 3;
  if (hasMultipleQuestions) signals.push("multi-question");

  const hasHardKeyword = HARD_KEYWORDS.some((kw) => lower.includes(kw));
  if (hasHardKeyword) signals.push("hard-keyword");

  const trimmedLower = lower.replace(/[!?.,\s]+$/g, "");
  const isPureGreeting =
    charCount > 0 && charCount < 80 &&
    EASY_GREETINGS.some((g) => trimmedLower === g || trimmedLower.startsWith(`${g} `));
  if (isPureGreeting) signals.push("greeting");

  const conversationLength = messages.filter((m) => m.role !== "system").length;
  const longConversation = conversationLength >= 12;
  if (longConversation) signals.push("long-conversation");

  if (options.systemPromptIsLong) signals.push("long-system-prompt");

  // Decide the bucket.
  let complexity: Complexity;
  if (charCount === 0) {
    complexity = "easy";
  } else if (isPureGreeting && !hasCode && !hasMath && !hasHardKeyword) {
    complexity = "easy";
  } else if (hasHardKeyword || longCode || hasMath || charCount > 2000 || longConversation) {
    complexity = "hard";
  } else if (charCount < 100 && !hasCode && !hasMultipleQuestions) {
    // Tight bar for "easy" — under 100 chars catches greetings, lookups,
    // and one-line clarifications. Anything longer almost always benefits
    // from a medium-tier model.
    complexity = "easy";
  } else {
    complexity = "medium";
  }

  return { complexity, signals, charCount, hasCode };
}

// ----------------------------------------------------------------------------
// Tier picker
// ----------------------------------------------------------------------------

/**
 * Resolve the actual tier to start from. In `balanced` mode we pick the
 * tier that matches the complexity. In `aggressive` mode we always start one
 * tier below complexity and escalate if needed.
 */
export function pickStartingTier(
  complexity: Complexity,
  mode: CascadeMode,
  tiers: TierConfig,
): Tier | null {
  if (mode === "off") return null;

  // The tier we'd ideally use given pure complexity.
  const idealForComplexity: Record<Complexity, Tier> = {
    easy: "small",
    medium: "medium",
    hard: "large",
  };
  const ideal = idealForComplexity[complexity];

  if (mode === "aggressive") {
    // Aggressive: try to push everyone down a tier. Hard requests still get
    // the large tier — there's no point trying medium on a 4000-char proof.
    const aggressive: Record<Complexity, Tier> = {
      easy: "small",
      medium: "small",
      hard: "large",
    };
    return ensureAvailable(aggressive[complexity], tiers) ?? ensureAvailable(ideal, tiers);
  }

  // Balanced: ideal tier; if it's missing, fall back to a configured one.
  return ensureAvailable(ideal, tiers);
}

/** Return the next tier above the given one, or null if there isn't one. */
export function nextEscalationTier(current: Tier, tiers: TierConfig): Tier | null {
  const idx = TIER_ORDER.indexOf(current);
  for (let i = idx + 1; i < TIER_ORDER.length; i++) {
    if (tiers[TIER_ORDER[i]]) return TIER_ORDER[i];
  }
  return null;
}

function ensureAvailable(tier: Tier, tiers: TierConfig): Tier | null {
  if (tiers[tier]) return tier;
  // Walk up first, then down, returning the first configured tier.
  const idx = TIER_ORDER.indexOf(tier);
  for (let i = idx + 1; i < TIER_ORDER.length; i++) if (tiers[TIER_ORDER[i]]) return TIER_ORDER[i];
  for (let i = idx - 1; i >= 0; i--) if (tiers[TIER_ORDER[i]]) return TIER_ORDER[i];
  return null;
}

// ----------------------------------------------------------------------------
// Confidence scoring
// ----------------------------------------------------------------------------

export interface ConfidenceResult {
  /** 0 (low) — 1 (high). */
  score: number;
  reasons: string[];
}

/**
 * Heuristic confidence score based purely on the response text. Cheap —
 * runs without an extra LLM call. Used to decide whether to escalate.
 */
export function confidenceFromResponse(text: string): ConfidenceResult {
  const reasons: string[] = [];
  if (!text || !text.trim()) {
    return { score: 0, reasons: ["empty-response"] };
  }
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  let score = 0.85;

  for (const marker of REFUSAL_MARKERS) {
    if (lower.includes(marker)) {
      score -= 0.4;
      reasons.push(`refusal:${marker}`);
      break;
    }
  }

  let uncertaintyHits = 0;
  for (const marker of UNCERTAINTY_MARKERS) {
    if (lower.includes(marker)) uncertaintyHits++;
  }
  if (uncertaintyHits > 0) {
    score -= Math.min(0.3, uncertaintyHits * 0.1);
    reasons.push(`uncertainty:${uncertaintyHits}`);
  }

  // Very short responses are suspicious for non-trivial questions.
  if (trimmed.length < 20) {
    score -= 0.25;
    reasons.push("very-short");
  }

  // Hallucination tell: model says it doesn't have access to something it
  // should have, like the file the user just pasted.
  if (/i don't have access to|cannot see the/i.test(trimmed)) {
    score -= 0.3;
    reasons.push("denies-access");
  }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}

// ----------------------------------------------------------------------------
// Escalation policy
// ----------------------------------------------------------------------------

export interface EscalationDecision {
  shouldEscalate: boolean;
  reason: string;
  nextTier: Tier | null;
}

export function decideEscalation(args: {
  mode: CascadeMode;
  currentTier: Tier;
  tiers: TierConfig;
  complexity: Complexity;
  confidence: ConfidenceResult;
  threshold?: number;
}): EscalationDecision {
  const { mode, currentTier, tiers, confidence } = args;
  const threshold = args.threshold ?? 0.55;

  if (mode !== "aggressive") {
    return { shouldEscalate: false, reason: "non-aggressive-mode", nextTier: null };
  }
  const next = nextEscalationTier(currentTier, tiers);
  if (!next) {
    return { shouldEscalate: false, reason: "no-higher-tier", nextTier: null };
  }
  if (confidence.score < threshold) {
    return { shouldEscalate: true, reason: `confidence ${confidence.score.toFixed(2)} < ${threshold}`, nextTier: next };
  }
  return { shouldEscalate: false, reason: `confidence ${confidence.score.toFixed(2)} ok`, nextTier: null };
}

// ----------------------------------------------------------------------------
// Saving estimator (telemetry helper)
// ----------------------------------------------------------------------------

/**
 * Given the actual tier used and the cost-rate function, estimate how many
 * dollars were saved versus always-large.
 */
export function estimateTierSaving(args: {
  actualTier: Tier;
  largeRate: number;
  actualRate: number;
  totalTokens: number;
}): number {
  if (args.actualTier === "large") return 0;
  const baseline = (args.totalTokens / 1000) * args.largeRate;
  const actual = (args.totalTokens / 1000) * args.actualRate;
  const saved = Math.max(0, baseline - actual);
  return Number(saved.toFixed(6));
}
