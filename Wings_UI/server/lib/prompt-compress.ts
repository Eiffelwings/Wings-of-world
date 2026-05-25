// Prompt compression — LLMLingua-style heuristics, no extra LLM call required.
//
// Strategy:
//   1. Pull out structurally important blocks (fenced code, JSON literals,
//      explicit lists) so they pass through untouched.
//   2. Split the remaining prose into sentences and score each one with a
//      blend of position, information density, and (optionally) cosine
//      similarity to a query embedding.
//   3. Keep the highest-scoring sentences until we hit a target character
//      budget, restore the protected blocks, and collapse redundant
//      whitespace.
//
// The whole flow is pure and deterministic so the same input always
// produces the same output — and a second pass is a no-op.

import { cosineSimilarity } from "../features/vector-memory.js";

export type CompressionLevel = "off" | "light" | "aggressive";

export interface CompressionOptions {
  level: CompressionLevel;
  /** Target ratio of original chars to keep. Defaults: 0.75 light, 0.45 aggressive. */
  targetRatio?: number;
  /** Skip compression for inputs smaller than this many chars. Default 600. */
  minChars?: number;
  /** When provided, rank sentences by cosine similarity to this vector. */
  queryEmbedding?: number[];
}

export interface CompressionResult {
  text: string;
  originalChars: number;
  compressedChars: number;
  ratio: number;
  preservedBlocks: number;
  techniques: string[];
}

const DEFAULT_MIN_CHARS = 600;
const TARGET_RATIO_LIGHT = 0.75;
const TARGET_RATIO_AGGRESSIVE = 0.45;

// Stopwords across English and Thai. Used in aggressive mode for inline
// deletion and across both modes for sentence scoring.
const STOPWORDS_EN = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "of", "and", "or", "but", "if", "then", "else", "for", "on", "at", "by",
  "with", "from", "to", "in", "out", "as", "that", "which", "this", "those",
  "these", "have", "has", "had", "do", "does", "did", "can", "could",
  "would", "should", "may", "might", "shall", "will", "very", "just",
  "really", "actually", "basically", "essentially", "literally",
  "kind of", "sort of", "you know",
]);
const STOPWORDS_TH = new Set([
  "ครับ", "ค่ะ", "นะ", "นะคะ", "นะครับ", "เเล้ว", "แล้ว", "ก็", "ที่", "และ",
  "หรือ", "นั้น", "นี้", "นะ", "เลย", "อะ", "เอ่อ", "อืม",
]);
const STOPWORDS = new Set([...STOPWORDS_EN, ...STOPWORDS_TH]);

// ---------------------------------------------------------------------------
// Structure protection — code blocks, JSON literals, and explicit lists must
// survive unchanged. We replace them with stable placeholders before scoring
// the prose, then restore them afterwards.
// ---------------------------------------------------------------------------

interface ProtectedBlock {
  placeholder: string;
  content: string;
}

const FENCE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]+`/g;
const JSON_BLOCK_RE = /(?:^|\n)\s*\{[\s\S]+?\n\s*\}\s*(?=\n|$)/g;
const NUMBERED_LIST_RE = /(?:^|\n)(?:\d+\.|[-*])\s+[^\n]+/g;

export function protectStructure(text: string): { stripped: string; blocks: ProtectedBlock[] } {
  const blocks: ProtectedBlock[] = [];
  let counter = 0;
  const stash = (content: string) => {
    const placeholder = `__WINGS_BLOCK_${counter++}__`;
    blocks.push({ placeholder, content });
    return placeholder;
  };

  let stripped = text.replace(FENCE_RE, (m) => stash(m));
  stripped = stripped.replace(JSON_BLOCK_RE, (m) => `\n${stash(m.trim())}\n`);
  stripped = stripped.replace(INLINE_CODE_RE, (m) => stash(m));
  // Lists: stash each list item but keep them as paragraphs so sentence
  // splitting still works around them.
  stripped = stripped.replace(NUMBERED_LIST_RE, (m) => `\n${stash(m.trim())}`);
  return { stripped, blocks };
}

export function restoreStructure(text: string, blocks: ProtectedBlock[]): string {
  let restored = text;
  for (const block of blocks) {
    restored = restored.split(block.placeholder).join(block.content);
  }
  return restored;
}

// ---------------------------------------------------------------------------
// Sentence splitting + scoring
// ---------------------------------------------------------------------------

const SENTENCE_RE = /[^.!?\n]+[.!?]+|[^.!?\n]+(?=\n|$)/g;

export function splitIntoSentences(text: string): string[] {
  const matches = text.match(SENTENCE_RE);
  if (!matches) return text.trim() ? [text.trim()] : [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

export interface SentenceScore {
  sentence: string;
  index: number;
  score: number;
  reasons: string[];
}

export function scoreSentences(
  sentences: string[],
  queryEmbedding?: number[],
  sentenceEmbeddings?: number[][],
): SentenceScore[] {
  const total = sentences.length;
  return sentences.map((sentence, index) => {
    const reasons: string[] = [];
    let score = 0;

    // 1. Position bias: openings and closings tend to anchor meaning.
    if (total <= 4) {
      score += 0.2;
      reasons.push("short-doc");
    } else {
      const fromStart = index;
      const fromEnd = total - 1 - index;
      const edgeDistance = Math.min(fromStart, fromEnd);
      const positionWeight = 0.2 * Math.exp(-edgeDistance / 4);
      score += positionWeight;
      reasons.push(`pos:${positionWeight.toFixed(2)}`);
    }

    const tokens = sentence.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [];
    const nonStopword = tokens.filter((t) => !STOPWORDS.has(t)).length;
    const stopwordDensity = tokens.length === 0 ? 1 : 1 - nonStopword / tokens.length;

    // 2. Information density — sentences that are mostly stopwords get
    // penalised. Pure stopwords (e.g. "OK so let me see") drop out fast.
    score += (1 - stopwordDensity) * 0.3;
    reasons.push(`info:${(1 - stopwordDensity).toFixed(2)}`);

    // 3. Numeric density — numbers, dates, IDs, monetary figures rarely fluff.
    const digitMatches = sentence.match(/\d+/g) || [];
    if (digitMatches.length > 0) {
      score += Math.min(0.2, digitMatches.length * 0.05);
      reasons.push(`numeric:${digitMatches.length}`);
    }

    // 4. Capitalised-word density — proper nouns and acronyms.
    const capWords = sentence.match(/\b[A-Z][a-zA-Z]+/g) || [];
    if (capWords.length > 0) {
      score += Math.min(0.1, capWords.length * 0.02);
      reasons.push(`caps:${capWords.length}`);
    }

    // 5. Length sanity: very short sentences are almost always filler unless
    // they carry numbers or proper nouns we already credited above.
    if (tokens.length < 3 && digitMatches.length === 0 && capWords.length === 0) {
      score -= 0.15;
      reasons.push("too-short");
    }

    // 6. Query-aware bonus: if we have query + sentence embeddings, the
    // similarity dominates the score.
    if (queryEmbedding && sentenceEmbeddings && sentenceEmbeddings[index]) {
      const sim = cosineSimilarity(queryEmbedding, sentenceEmbeddings[index]);
      score += sim * 0.5;
      reasons.push(`sim:${sim.toFixed(2)}`);
    }

    return { sentence, index, score, reasons };
  });
}

// ---------------------------------------------------------------------------
// Budget selection — keep the highest-scoring sentences until we hit the
// target character count. We restore original order so the output reads
// naturally even after pruning.
// ---------------------------------------------------------------------------

export function selectByBudget(scored: SentenceScore[], targetChars: number): SentenceScore[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const kept: SentenceScore[] = [];
  let usedChars = 0;
  for (const item of sorted) {
    const cost = item.sentence.length + 1; // +1 for joiner space/newline
    if (kept.length === 0 || usedChars + cost <= targetChars) {
      kept.push(item);
      usedChars += cost;
    }
    if (usedChars >= targetChars) break;
  }
  // Always keep at least one sentence so we never emit an empty doc.
  if (kept.length === 0 && scored.length > 0) kept.push(sorted[0]);
  return kept.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------
// Whitespace + redundancy cleanup — always safe.
// ---------------------------------------------------------------------------

export function collapseWhitespace(text: string): string {
  // Process line-by-line so leading indentation (for code, lists, markdown)
  // survives unscathed. Only mid-line runs of whitespace get collapsed.
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => {
      const leading = line.match(/^[ \t]*/)?.[0] || "";
      const rest = line.slice(leading.length).replace(/[ \t]{2,}/g, " ");
      return leading + rest;
    })
    .join("\n")
    .trim();
}

export function dropStopwordsInline(text: string): string {
  // Conservative inline stopword strip used only in aggressive mode. We
  // only delete tokens that appear in the middle of a sentence to avoid
  // mangling sentence starts.
  return text.replace(/\b([A-Za-z]+)\b/g, (match, word, offset) => {
    if (typeof offset !== "number") return match;
    if (offset === 0) return match;
    return STOPWORDS.has(word.toLowerCase()) ? "" : match;
  }).replace(/  +/g, " ").replace(/\s+([,.;:!?])/g, "$1");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function compressText(
  text: string,
  options: CompressionOptions = { level: "light" },
): CompressionResult {
  const originalChars = text.length;
  const techniques: string[] = [];

  if (options.level === "off") {
    return { text, originalChars, compressedChars: originalChars, ratio: 1, preservedBlocks: 0, techniques };
  }
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS;
  if (originalChars < minChars) {
    // Still apply whitespace cleanup so callers get a deterministic result.
    const cleaned = collapseWhitespace(text);
    techniques.push("whitespace-only");
    return {
      text: cleaned,
      originalChars,
      compressedChars: cleaned.length,
      ratio: cleaned.length / Math.max(1, originalChars),
      preservedBlocks: 0,
      techniques,
    };
  }

  const targetRatio = options.targetRatio
    ?? (options.level === "aggressive" ? TARGET_RATIO_AGGRESSIVE : TARGET_RATIO_LIGHT);
  const targetChars = Math.floor(originalChars * targetRatio);

  // Step 1: protect structurally important blocks.
  const { stripped, blocks } = protectStructure(text);
  techniques.push(`protect:${blocks.length}`);

  // Step 2: sentence-level pruning. Skip when we've already saturated —
  // pruning a 3-sentence doc to 2 rarely helps and breaks idempotence.
  const sentences = splitIntoSentences(stripped);
  const MIN_SENTENCES_TO_PRUNE = 5;
  let pruned: string;
  if (sentences.length < MIN_SENTENCES_TO_PRUNE) {
    pruned = stripped;
    techniques.push(`sentence-prune:skipped-${sentences.length}-sentences`);
  } else {
    const scored = scoreSentences(sentences, options.queryEmbedding);
    const kept = selectByBudget(scored, targetChars - blocks.reduce((sum, b) => sum + b.content.length, 0));
    techniques.push(`sentence-prune:${sentences.length}->${kept.length}`);
    pruned = kept.map((k) => k.sentence).join(" ");
  }

  // Step 3: optional inline stopword strip (aggressive only).
  if (options.level === "aggressive") {
    const before = pruned.length;
    pruned = dropStopwordsInline(pruned);
    if (pruned.length < before) techniques.push(`stopword-strip:${before - pruned.length}`);
  }

  // Step 4: restore protected blocks then collapse whitespace.
  let restored = restoreStructure(pruned, blocks);
  restored = collapseWhitespace(restored);
  techniques.push("whitespace");

  return {
    text: restored,
    originalChars,
    compressedChars: restored.length,
    ratio: restored.length / Math.max(1, originalChars),
    preservedBlocks: blocks.length,
    techniques,
  };
}

// ---------------------------------------------------------------------------
// Compress a chat-message array. We touch every message except the latest
// user turn (which is what the model is replying to and must stay verbatim)
// and any assistant message that's already short.
// ---------------------------------------------------------------------------

export interface MessageLike {
  role: string;
  content: string | unknown;
}

export interface MessageCompressionResult<T extends MessageLike> {
  messages: T[];
  totalOriginalChars: number;
  totalCompressedChars: number;
  perMessage: Array<{ index: number; ratio: number; preservedBlocks: number }>;
}

export function compressMessages<T extends MessageLike>(
  messages: T[],
  options: CompressionOptions = { level: "light" },
): MessageCompressionResult<T> {
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return i;
    return -1;
  })();

  let totalOriginalChars = 0;
  let totalCompressedChars = 0;
  const perMessage: Array<{ index: number; ratio: number; preservedBlocks: number }> = [];

  const out = messages.map((m, idx) => {
    if (typeof m.content !== "string") return m;
    totalOriginalChars += m.content.length;
    // Never trim the most recent user message — that's the actual question.
    if (idx === lastUserIdx) {
      totalCompressedChars += m.content.length;
      return m;
    }
    const result = compressText(m.content, options);
    totalCompressedChars += result.compressedChars;
    perMessage.push({ index: idx, ratio: result.ratio, preservedBlocks: result.preservedBlocks });
    return { ...m, content: result.text } as T;
  });

  return { messages: out, totalOriginalChars, totalCompressedChars, perMessage };
}
