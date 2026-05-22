// Guardrails / evals engine — ports the Future AGI system_evals.yaml catalog.
// Each eval is an LLM-as-judge prompt with mustache-style {{key}} variables.
// We render the prompt with caller-provided inputs, send it to an LLM, and
// parse a Pass/Fail (or scored) verdict.
//
// Source: https://github.com/future-agi/future-agi  (Apache 2.0)
// Catalog file: server/features/guardrails/evals.yaml

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type EvalType = "agent" | "llm" | "code";
export type EvalOutput = "Pass/Fail" | "score" | string;

export interface EvalDefinition {
  id: string;
  evalType: EvalType;
  output: EvalOutput;
  requiredKeys: string[];
  description?: string;
  tags?: string[];
  rulePrompt: string;
}

export interface EvalRunInput {
  values: Record<string, string>;
}

export interface EvalVerdict {
  evalId: string;
  passed: boolean | null;
  score?: number;
  rawResponse: string;
  reasoning?: string;
  durationMs: number;
  error?: string;
}

export interface JudgeFn {
  (prompt: string): Promise<{ content: string; durationMs: number }>;
}

let cachedCatalog: Map<string, EvalDefinition> | null = null;

function locateCatalog(): string {
  const candidates = [
    // Dev: alongside the engine source file.
    path.resolve(__dirname, "evals.yaml"),
    // Prod (bundled): scripts/bundle-assets.mjs copies the YAML next to dist/index.js.
    path.resolve(__dirname, "guardrails/evals.yaml"),
    path.resolve(__dirname, "../guardrails/evals.yaml"),
    // Last-resort: from CWD.
    path.resolve(process.cwd(), "server/features/guardrails/evals.yaml"),
    path.resolve(process.cwd(), "dist/guardrails/evals.yaml"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(`Could not locate guardrails evals.yaml. Tried: ${candidates.join(", ")}`);
}

function normalizeKey(key: unknown): string[] {
  if (Array.isArray(key)) return key.map(String);
  if (typeof key === "string") return [key];
  return [];
}

export function loadCatalog(filePath?: string): Map<string, EvalDefinition> {
  if (!filePath && cachedCatalog) return cachedCatalog;
  const target = filePath || locateCatalog();
  const raw = fs.readFileSync(target, "utf-8");
  const parsed = YAML.parse(raw) as Record<string, any>;
  const catalog = new Map<string, EvalDefinition>();
  for (const [id, body] of Object.entries(parsed || {})) {
    if (!body || typeof body !== "object") continue;
    const evalType = (body.eval_type as EvalType) || "agent";
    const output = body.output || "Pass/Fail";
    const requiredKeys = normalizeKey(body.required_keys);
    const rulePrompt = typeof body.rule_prompt === "string" ? body.rule_prompt : "";
    if (!rulePrompt) continue;
    catalog.set(id, {
      id,
      evalType,
      output,
      requiredKeys,
      description: body.description,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
      rulePrompt,
    });
  }
  if (!filePath) cachedCatalog = catalog;
  return catalog;
}

export function getEvalDefinition(id: string): EvalDefinition | null {
  return loadCatalog().get(id) || null;
}

export function listEvals(): EvalDefinition[] {
  return [...loadCatalog().values()];
}

const VAR_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function renderPrompt(template: string, values: Record<string, string>): string {
  return template.replace(VAR_PATTERN, (_match, key) => {
    const v = values[key];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}

const PASS_PATTERNS = /(^|\b)(passed|pass|true|safe|grounded|consistent|aligned|appropriate|compliant|ok)(\b|$)/i;
const FAIL_PATTERNS = /(^|\b)(failed|fail|false|unsafe|hallucination|hallucinated|ungrounded|inconsistent|misaligned|inappropriate|non[- ]?compliant)(\b|$)/i;
const VERDICT_LINE = /(?:verdict|result|status|score)\s*[:=]\s*([^\n]+)/i;

export function parseVerdict(raw: string, output: EvalOutput): { passed: boolean | null; score?: number; reasoning?: string } {
  if (!raw) return { passed: null };
  const trimmed = raw.trim();

  // Try parsing JSON first — many judges return structured output
  try {
    const parsed = JSON.parse(trimmed);
    const score = typeof parsed?.score === "number" ? parsed.score : undefined;
    const verdict = String(parsed?.verdict || parsed?.result || parsed?.status || "").toLowerCase();
    const reasoning = parsed?.reasoning || parsed?.explanation;
    if (verdict.includes("pass") || verdict === "true") return { passed: true, score, reasoning };
    if (verdict.includes("fail") || verdict === "false") return { passed: false, score, reasoning };
    if (typeof score === "number") return { passed: score >= 0.5, score, reasoning };
  } catch { /* not JSON, fall through */ }

  const verdictMatch = trimmed.match(VERDICT_LINE);
  const target = verdictMatch ? verdictMatch[1] : trimmed.slice(-200);

  // For Pass/Fail outputs, prefer matching at the end (judges typically
  // explain first, then conclude). Test fail before pass because some text
  // contains both ("did not fail" etc) — but anti-pattern handling is good
  // enough for first-pass triage.
  const failMatch = target.match(FAIL_PATTERNS);
  const passMatch = target.match(PASS_PATTERNS);

  if (failMatch && !passMatch) return { passed: false, reasoning: trimmed };
  if (passMatch && !failMatch) return { passed: true, reasoning: trimmed };

  // Both matched or neither matched — use last-occurrence to break ties.
  if (failMatch && passMatch) {
    const passIdx = target.lastIndexOf(passMatch[0]);
    const failIdx = target.lastIndexOf(failMatch[0]);
    return { passed: passIdx > failIdx, reasoning: trimmed };
  }

  // Fallback: numeric score in [0,1]
  const scoreMatch = trimmed.match(/(\d+\.\d+|\d+)\s*\/\s*(\d+)/);
  if (scoreMatch) {
    const score = parseFloat(scoreMatch[1]) / parseFloat(scoreMatch[2]);
    return { passed: score >= 0.5, score, reasoning: trimmed };
  }

  return { passed: null, reasoning: trimmed };
}

export function validateInput(definition: EvalDefinition, values: Record<string, string>): string | null {
  for (const key of definition.requiredKeys) {
    const v = values[key];
    if (v === undefined || v === null || v === "") {
      return `Missing required key: ${key}`;
    }
  }
  return null;
}

export async function runEval(
  definition: EvalDefinition,
  input: EvalRunInput,
  judge: JudgeFn,
): Promise<EvalVerdict> {
  const start = Date.now();
  const validation = validateInput(definition, input.values);
  if (validation) {
    return {
      evalId: definition.id,
      passed: null,
      rawResponse: "",
      durationMs: 0,
      error: validation,
    };
  }
  const prompt = renderPrompt(definition.rulePrompt, input.values);
  try {
    const { content, durationMs } = await judge(prompt);
    const parsed = parseVerdict(content, definition.output);
    return {
      evalId: definition.id,
      passed: parsed.passed,
      score: parsed.score,
      rawResponse: content,
      reasoning: parsed.reasoning,
      durationMs,
    };
  } catch (err: any) {
    return {
      evalId: definition.id,
      passed: null,
      rawResponse: "",
      durationMs: Date.now() - start,
      error: err?.message || String(err),
    };
  }
}

export async function runEvals(
  ids: string[],
  input: EvalRunInput,
  judge: JudgeFn,
): Promise<EvalVerdict[]> {
  const results: EvalVerdict[] = [];
  for (const id of ids) {
    const def = getEvalDefinition(id);
    if (!def) {
      results.push({
        evalId: id,
        passed: null,
        rawResponse: "",
        durationMs: 0,
        error: `Unknown eval id: ${id}`,
      });
      continue;
    }
    results.push(await runEval(def, input, judge));
  }
  return results;
}

// Default judge — uses an internal Wings caller. Implementations should pass
// their own judge to integrate with the actual provider.
export function makeJudge(callLLM: (prompt: string) => Promise<string>): JudgeFn {
  return async (prompt: string) => {
    const start = Date.now();
    const content = await callLLM(prompt);
    return { content, durationMs: Date.now() - start };
  };
}
