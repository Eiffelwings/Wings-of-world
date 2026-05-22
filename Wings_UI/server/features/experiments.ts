// A/B experiment routing. Each experiment has named arms, each arm a model
// (and optionally a system-prompt override) and a weight. Assignments are
// sticky per-key (sessionId or hashed user) so a single user sees one arm.

import type Database from "better-sqlite3";
import crypto from "crypto";

export interface ExperimentArm {
  name: string;
  model: string;
  systemPromptOverride?: string;
  weight: number;
}

export interface Experiment {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "running" | "paused" | "complete";
  arms: ExperimentArm[];
  createdAt: string;
  updatedAt: string;
}

interface ExperimentRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  arms: string;
  created_at: string;
  updated_at: string;
}

export function ensureExperimentSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiments (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      description  TEXT,
      status       TEXT NOT NULL DEFAULT 'draft',
      arms         TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS experiment_observations (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id   TEXT NOT NULL,
      arm             TEXT NOT NULL,
      session_id      TEXT,
      timestamp       TEXT NOT NULL,
      tokens_total    INTEGER NOT NULL DEFAULT 0,
      cost_usd        REAL NOT NULL DEFAULT 0,
      duration_ms     INTEGER NOT NULL DEFAULT 0,
      success         INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_obs_exp ON experiment_observations (experiment_id, arm);
  `);
}

export function makeExperimentId() {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function rowToExperiment(row: ExperimentRow): Experiment {
  let arms: ExperimentArm[] = [];
  try { arms = JSON.parse(row.arms); } catch { /* ignore */ }
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status as Experiment["status"],
    arms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createExperiment(
  db: Database.Database,
  input: { name: string; description?: string; arms: ExperimentArm[] },
): Experiment {
  if (!input.arms || input.arms.length < 2) throw new Error("An experiment needs at least two arms");
  const totalWeight = input.arms.reduce((s, a) => s + Math.max(0, a.weight), 0);
  if (totalWeight <= 0) throw new Error("At least one arm must have a positive weight");
  const id = makeExperimentId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO experiments (id, name, description, status, arms, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
  ).run(id, input.name, input.description ?? null, JSON.stringify(input.arms), now, now);
  return { id, name: input.name, description: input.description, status: "draft", arms: input.arms, createdAt: now, updatedAt: now };
}

export function listExperiments(db: Database.Database): Experiment[] {
  const rows = db.prepare(`SELECT * FROM experiments ORDER BY created_at DESC`).all() as ExperimentRow[];
  return rows.map(rowToExperiment);
}

export function getExperiment(db: Database.Database, id: string): Experiment | null {
  const row = db.prepare(`SELECT * FROM experiments WHERE id = ?`).get(id) as ExperimentRow | undefined;
  return row ? rowToExperiment(row) : null;
}

export function setExperimentStatus(db: Database.Database, id: string, status: Experiment["status"]): void {
  db.prepare(`UPDATE experiments SET status = ?, updated_at = ? WHERE id = ?`)
    .run(status, new Date().toISOString(), id);
}

export function deleteExperiment(db: Database.Database, id: string): boolean {
  return db.prepare(`DELETE FROM experiments WHERE id = ?`).run(id).changes > 0;
}

/** Deterministic arm assignment by hashing the routing key into [0, totalWeight). */
export function pickArm(experiment: Experiment, key: string): ExperimentArm {
  if (experiment.arms.length === 0) throw new Error(`Experiment ${experiment.id} has no arms`);
  const totalWeight = experiment.arms.reduce((s, a) => s + Math.max(0, a.weight), 0);
  if (totalWeight <= 0) return experiment.arms[0];
  const digest = crypto.createHash("sha256").update(`${experiment.id}::${key}`).digest();
  // Treat first 4 bytes as an unsigned 32-bit int and modulo totalWeight.
  const bucket = digest.readUInt32BE(0) % Math.max(1, Math.floor(totalWeight));
  let acc = 0;
  for (const arm of experiment.arms) {
    acc += Math.max(0, arm.weight);
    if (bucket < acc) return arm;
  }
  return experiment.arms[experiment.arms.length - 1];
}

export function recordObservation(
  db: Database.Database,
  obs: {
    experimentId: string;
    arm: string;
    sessionId?: string;
    tokensTotal?: number;
    costUsd?: number;
    durationMs?: number;
    success?: boolean;
  },
): void {
  db.prepare(
    `INSERT INTO experiment_observations
       (experiment_id, arm, session_id, timestamp, tokens_total, cost_usd, duration_ms, success)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    obs.experimentId,
    obs.arm,
    obs.sessionId ?? null,
    new Date().toISOString(),
    obs.tokensTotal ?? 0,
    obs.costUsd ?? 0,
    obs.durationMs ?? 0,
    obs.success === false ? 0 : 1,
  );
}

export interface ArmStats {
  arm: string;
  observations: number;
  successRate: number;
  avgDurationMs: number;
  avgTokens: number;
  totalCostUsd: number;
}

export function getExperimentStats(db: Database.Database, experimentId: string): ArmStats[] {
  const rows = db.prepare(
    `SELECT arm,
            COUNT(*) AS n,
            AVG(success) AS success_rate,
            AVG(duration_ms) AS avg_duration,
            AVG(tokens_total) AS avg_tokens,
            SUM(cost_usd) AS total_cost
     FROM experiment_observations
     WHERE experiment_id = ?
     GROUP BY arm
     ORDER BY arm ASC`,
  ).all(experimentId) as Array<{
    arm: string;
    n: number;
    success_rate: number | null;
    avg_duration: number | null;
    avg_tokens: number | null;
    total_cost: number | null;
  }>;
  return rows.map((r) => ({
    arm: r.arm,
    observations: r.n,
    successRate: r.success_rate ?? 0,
    avgDurationMs: Math.round(r.avg_duration ?? 0),
    avgTokens: Math.round(r.avg_tokens ?? 0),
    totalCostUsd: Number((r.total_cost ?? 0).toFixed(6)),
  }));
}
