// Pure helpers for workflow control-flow nodes. These wrap the sandbox so the
// runner stays small and the helpers can be unit-tested without booting the
// whole server module graph.

import { runUserCode, type SandboxOptions } from "./code-sandbox.js";

export interface BranchEdgeLike {
  source: string;
  target: string;
  branch?: "true" | "false";
}

/**
 * Filter incoming edges to a target node based on parent branch outcomes.
 * Edges with no `branch` field always fire; edges with a branch only fire
 * when their source node's recorded outcome matches.
 */
export function pickBranchEdges<E extends BranchEdgeLike>(
  edges: E[],
  branchOutcome: ReadonlyMap<string, "true" | "false">,
): E[] {
  return edges.filter((edge) => {
    if (!edge.branch) return true;
    return branchOutcome.get(edge.source) === edge.branch;
  });
}

/** Evaluate a predicate expression in the sandbox. */
export async function evaluateBranchOutcome(
  expression: string,
  bindings: { input: unknown; context?: unknown },
  options: SandboxOptions = {},
): Promise<{ outcome: "true" | "false"; error?: string }> {
  const result = await runUserCode<unknown>(`return Boolean(${expression});`, bindings, {
    timeoutMs: 500,
    memoryLimitMb: 16,
    ...options,
  });
  if (!result.ok) return { outcome: "false", error: result.error };
  return { outcome: result.value ? "true" : "false" };
}

export interface LoopItemsResult {
  items: unknown[];
  capped: boolean;
  originalCount: number;
  error?: string;
}

/**
 * Evaluate the items expression for a loop node. Returns the (capped) item
 * list, plus metadata for trace logging.
 */
export async function evaluateLoopItems(
  itemsExpr: string,
  bindings: { input: unknown; context?: unknown },
  maxIterations: number,
  options: SandboxOptions = {},
): Promise<LoopItemsResult> {
  const cap = Math.max(1, Math.min(500, maxIterations));
  const result = await runUserCode<unknown>(`return (${itemsExpr});`, bindings, {
    timeoutMs: 500,
    ...options,
  });
  if (!result.ok) {
    return { items: [], capped: false, originalCount: 0, error: result.error };
  }
  if (!Array.isArray(result.value)) {
    return {
      items: [],
      capped: false,
      originalCount: 0,
      error: `items expression must produce an array (got ${typeof result.value})`,
    };
  }
  const all = result.value as unknown[];
  const slice = all.slice(0, cap);
  return {
    items: slice,
    capped: all.length > cap,
    originalCount: all.length,
  };
}

export interface LoopBodyResult {
  results: unknown[];
  errors: number;
}

/** Execute the loop body once per item, collecting results and error counts. */
export async function runLoopBody(
  items: unknown[],
  bodyCode: string,
  baseBindings: { input: unknown; context?: Record<string, unknown> },
  options: SandboxOptions = {},
): Promise<LoopBodyResult> {
  const results: unknown[] = [];
  let errors = 0;
  for (let index = 0; index < items.length; index++) {
    const iter = await runUserCode<unknown>(bodyCode, {
      input: baseBindings.input,
      context: { ...(baseBindings.context ?? {}), item: items[index], index, total: items.length },
    }, { timeoutMs: 1500, memoryLimitMb: 32, ...options });
    if (iter.ok) {
      results.push(iter.value);
    } else {
      errors++;
      results.push(`Error: ${iter.error}`);
    }
  }
  return { results, errors };
}
