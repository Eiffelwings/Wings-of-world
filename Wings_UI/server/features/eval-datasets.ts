// Eval datasets: golden Q&A pairs you can replay against any prompt/model
// combination and aggregate pass-rate per eval (toxicity, hallucination, etc.).
// This is the regression-testing loop that turns ad-hoc tweaking into
// data-driven improvement.

import type Database from "better-sqlite3";

export interface DatasetItem {
  id: string;
  datasetId: string;
  input: string;
  expectedOutput?: string;
  context?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Dataset {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  itemCount: number;
}

export interface ReplayRun {
  id: string;
  datasetId: string;
  model: string;
  evalIds: string[];
  startedAt: string;
  finishedAt?: string;
  passCount: number;
  failCount: number;
  errorCount: number;
  itemCount: number;
  status: "running" | "complete" | "error";
}

export interface ReplayResult {
  id: string;
  runId: string;
  itemId: string;
  output: string;
  verdicts: Array<{ evalId: string; passed: boolean | null; reasoning?: string }>;
  durationMs: number;
  error?: string;
}

export function ensureDatasetSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS eval_datasets (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      description  TEXT,
      created_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS eval_dataset_items (
      id              TEXT PRIMARY KEY,
      dataset_id      TEXT NOT NULL,
      input           TEXT NOT NULL,
      expected_output TEXT,
      context         TEXT,
      metadata        TEXT,
      created_at      TEXT NOT NULL,
      FOREIGN KEY (dataset_id) REFERENCES eval_datasets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_dataset_items_ds ON eval_dataset_items (dataset_id);

    CREATE TABLE IF NOT EXISTS eval_replay_runs (
      id           TEXT PRIMARY KEY,
      dataset_id   TEXT NOT NULL,
      model        TEXT NOT NULL,
      eval_ids     TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      finished_at  TEXT,
      pass_count   INTEGER NOT NULL DEFAULT 0,
      fail_count   INTEGER NOT NULL DEFAULT 0,
      error_count  INTEGER NOT NULL DEFAULT 0,
      item_count   INTEGER NOT NULL,
      status       TEXT NOT NULL DEFAULT 'running'
    );
    CREATE INDEX IF NOT EXISTS idx_replay_runs_ds ON eval_replay_runs (dataset_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS eval_replay_results (
      id           TEXT PRIMARY KEY,
      run_id       TEXT NOT NULL,
      item_id      TEXT NOT NULL,
      output       TEXT NOT NULL,
      verdicts     TEXT NOT NULL,
      duration_ms  INTEGER,
      error        TEXT,
      FOREIGN KEY (run_id) REFERENCES eval_replay_runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_replay_results_run ON eval_replay_results (run_id);
  `);
}

export function makeDatasetId() { return `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
export function makeItemId() { return `dsi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
export function makeRunId() { return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
export function makeResultId() { return `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

export function createDataset(db: Database.Database, input: { name: string; description?: string }): Dataset {
  const id = makeDatasetId();
  const createdAt = new Date().toISOString();
  db.prepare(`INSERT INTO eval_datasets (id, name, description, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, input.name, input.description ?? null, createdAt);
  return { id, name: input.name, description: input.description, createdAt, itemCount: 0 };
}

export function listDatasets(db: Database.Database): Dataset[] {
  const rows = db.prepare(
    `SELECT d.*, COUNT(i.id) AS item_count
     FROM eval_datasets d
     LEFT JOIN eval_dataset_items i ON i.dataset_id = d.id
     GROUP BY d.id
     ORDER BY d.created_at DESC`,
  ).all() as Array<{ id: string; name: string; description: string | null; created_at: string; item_count: number }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    createdAt: r.created_at,
    itemCount: r.item_count,
  }));
}

export function deleteDataset(db: Database.Database, id: string): boolean {
  return db.prepare(`DELETE FROM eval_datasets WHERE id = ?`).run(id).changes > 0;
}

export function addDatasetItem(
  db: Database.Database,
  datasetId: string,
  input: { input: string; expectedOutput?: string; context?: string; metadata?: Record<string, unknown> },
): DatasetItem {
  const id = makeItemId();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO eval_dataset_items (id, dataset_id, input, expected_output, context, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    datasetId,
    input.input,
    input.expectedOutput ?? null,
    input.context ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt,
  );
  return {
    id,
    datasetId,
    input: input.input,
    expectedOutput: input.expectedOutput,
    context: input.context,
    metadata: input.metadata,
    createdAt,
  };
}

export function listDatasetItems(db: Database.Database, datasetId: string): DatasetItem[] {
  const rows = db.prepare(
    `SELECT * FROM eval_dataset_items WHERE dataset_id = ? ORDER BY created_at ASC`,
  ).all(datasetId) as Array<{
    id: string;
    dataset_id: string;
    input: string;
    expected_output: string | null;
    context: string | null;
    metadata: string | null;
    created_at: string;
  }>;
  return rows.map((r) => {
    let metadata: Record<string, unknown> | undefined;
    if (r.metadata) {
      try { metadata = JSON.parse(r.metadata); } catch { /* ignore */ }
    }
    return {
      id: r.id,
      datasetId: r.dataset_id,
      input: r.input,
      expectedOutput: r.expected_output ?? undefined,
      context: r.context ?? undefined,
      metadata,
      createdAt: r.created_at,
    };
  });
}

export function deleteDatasetItem(db: Database.Database, id: string): boolean {
  return db.prepare(`DELETE FROM eval_dataset_items WHERE id = ?`).run(id).changes > 0;
}

export function createRun(
  db: Database.Database,
  input: { datasetId: string; model: string; evalIds: string[]; itemCount: number },
): ReplayRun {
  const id = makeRunId();
  const startedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO eval_replay_runs (id, dataset_id, model, eval_ids, started_at, item_count, status)
     VALUES (?, ?, ?, ?, ?, ?, 'running')`,
  ).run(id, input.datasetId, input.model, JSON.stringify(input.evalIds), startedAt, input.itemCount);
  return {
    id,
    datasetId: input.datasetId,
    model: input.model,
    evalIds: input.evalIds,
    startedAt,
    passCount: 0,
    failCount: 0,
    errorCount: 0,
    itemCount: input.itemCount,
    status: "running",
  };
}

export function recordResult(db: Database.Database, result: ReplayResult): void {
  db.prepare(
    `INSERT INTO eval_replay_results (id, run_id, item_id, output, verdicts, duration_ms, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    result.id,
    result.runId,
    result.itemId,
    result.output,
    JSON.stringify(result.verdicts),
    result.durationMs,
    result.error ?? null,
  );
}

export function tallyRun(
  db: Database.Database,
  runId: string,
  delta: { pass?: number; fail?: number; error?: number },
): void {
  db.prepare(
    `UPDATE eval_replay_runs
     SET pass_count = pass_count + ?,
         fail_count = fail_count + ?,
         error_count = error_count + ?
     WHERE id = ?`,
  ).run(delta.pass ?? 0, delta.fail ?? 0, delta.error ?? 0, runId);
}

export function finalizeRun(db: Database.Database, runId: string, status: "complete" | "error"): void {
  db.prepare(`UPDATE eval_replay_runs SET status = ?, finished_at = ? WHERE id = ?`)
    .run(status, new Date().toISOString(), runId);
}

export function getRun(db: Database.Database, runId: string): ReplayRun | null {
  const row = db.prepare(`SELECT * FROM eval_replay_runs WHERE id = ?`).get(runId) as any;
  if (!row) return null;
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

export function listRuns(db: Database.Database, datasetId?: string): ReplayRun[] {
  const where = datasetId ? `WHERE dataset_id = ?` : "";
  const args = datasetId ? [datasetId] : [];
  const rows = db.prepare(`SELECT * FROM eval_replay_runs ${where} ORDER BY started_at DESC LIMIT 100`)
    .all(...args) as any[];
  return rows.map((row) => ({
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
  }));
}

export function getRunResults(db: Database.Database, runId: string): ReplayResult[] {
  const rows = db.prepare(`SELECT * FROM eval_replay_results WHERE run_id = ?`).all(runId) as any[];
  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    itemId: row.item_id,
    output: row.output,
    verdicts: JSON.parse(row.verdicts),
    durationMs: row.duration_ms,
    error: row.error ?? undefined,
  }));
}

export function passRate(run: ReplayRun): number {
  const total = run.passCount + run.failCount + run.errorCount;
  if (total === 0) return 0;
  return run.passCount / total;
}
