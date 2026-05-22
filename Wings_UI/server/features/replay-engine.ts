// Replay engine. Given a dataset and a target model, run each item through
// the model, judge the output with one or more guardrail evals, and write
// per-item results back to the runs table. Caller passes the LLM call fn so
// this module stays decoupled from any specific provider.

import type Database from "better-sqlite3";
import {
  type DatasetItem,
  type ReplayResult,
  type ReplayRun,
  createRun,
  finalizeRun,
  listDatasetItems,
  makeResultId,
  recordResult,
  tallyRun,
} from "./eval-datasets.js";
import { runEvals, type JudgeFn } from "./guardrails/engine.js";

export interface ReplayDeps {
  /** Generate a model response for a single dataset item. */
  generate: (input: { input: string; context?: string; metadata?: Record<string, unknown> }, model: string) => Promise<{ output: string; durationMs: number }>;
  /** LLM-as-judge for guardrail evals. */
  judge: JudgeFn;
}

export interface ReplayOptions {
  datasetId: string;
  model: string;
  evalIds: string[];
  /** Run replay items in parallel up to this concurrency (default 3). */
  concurrency?: number;
  /** Optional callback invoked after each item finishes. */
  onProgress?: (done: number, total: number, lastResult: ReplayResult) => void;
}

export async function runReplay(
  db: Database.Database,
  options: ReplayOptions,
  deps: ReplayDeps,
): Promise<ReplayRun> {
  const items = listDatasetItems(db, options.datasetId);
  if (items.length === 0) throw new Error(`Dataset is empty: ${options.datasetId}`);

  const run = createRun(db, {
    datasetId: options.datasetId,
    model: options.model,
    evalIds: options.evalIds,
    itemCount: items.length,
  });

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 8));
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      const item = items[idx];
      const result = await processItem(run.id, item, options, deps);
      recordResult(db, result);
      const verdictsPassed = result.verdicts.length > 0 && result.verdicts.every((v) => v.passed === true);
      const verdictsFailed = result.verdicts.some((v) => v.passed === false);
      if (result.error) {
        tallyRun(db, run.id, { error: 1 });
      } else if (verdictsFailed) {
        tallyRun(db, run.id, { fail: 1 });
      } else if (verdictsPassed) {
        tallyRun(db, run.id, { pass: 1 });
      } else {
        // No conclusive verdict — treat as error/ambiguous so the dashboard
        // shows it explicitly rather than miscounting it as a pass.
        tallyRun(db, run.id, { error: 1 });
      }
      done++;
      options.onProgress?.(done, items.length, result);
    }
  }

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    finalizeRun(db, run.id, "complete");
  } catch (err) {
    finalizeRun(db, run.id, "error");
    throw err;
  }

  // Re-read the run from DB to pick up the final tallies.
  return readRunOrThrow(db, run.id);
}

async function processItem(
  runId: string,
  item: DatasetItem,
  options: ReplayOptions,
  deps: ReplayDeps,
): Promise<ReplayResult> {
  const start = Date.now();
  try {
    const generation = await deps.generate(
      { input: item.input, context: item.context, metadata: item.metadata },
      options.model,
    );
    const verdicts = options.evalIds.length === 0
      ? []
      : await runEvals(
          options.evalIds,
          {
            values: {
              input: item.input,
              output: generation.output,
              context: item.context || "",
              expected_output: item.expectedOutput || "",
              expected_response: item.expectedOutput || "",
            },
          },
          deps.judge,
        );
    return {
      id: makeResultId(),
      runId,
      itemId: item.id,
      output: generation.output,
      verdicts: verdicts.map((v) => ({ evalId: v.evalId, passed: v.passed, reasoning: v.reasoning })),
      durationMs: generation.durationMs || Date.now() - start,
    };
  } catch (err: any) {
    return {
      id: makeResultId(),
      runId,
      itemId: item.id,
      output: "",
      verdicts: [],
      durationMs: Date.now() - start,
      error: err?.message || String(err),
    };
  }
}

function readRunOrThrow(db: Database.Database, runId: string): ReplayRun {
  const row = db.prepare(`SELECT * FROM eval_replay_runs WHERE id = ?`).get(runId) as any;
  if (!row) throw new Error(`Run not found: ${runId}`);
  return {
    id: row.id,
    datasetId: row.dataset_id,
    model: row.model,
    evalIds: JSON.parse(row.eval_ids),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    passCount: row.pass_count,
    failCount: row.fail_count,
    errorCount: row.error_count,
    itemCount: row.item_count,
    status: row.status,
  };
}
