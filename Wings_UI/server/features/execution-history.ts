import type Database from "better-sqlite3";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type ExecutionKind = "chat" | "workflow" | "tool";
export type ExecutionStatus = "success" | "error";

export interface ExecutionRecord {
  id: string;
  kind: ExecutionKind;
  status: ExecutionStatus;
  title: string;
  summary: string;
  inputPreview: string;
  outputPreview?: string;
  sessionId?: string;
  workflowId?: string;
  toolName?: string;
  model?: string;
  memoryCount: number;
  tokenUsage?: TokenUsage;
  costEstimateUsd?: number;
  durationMs?: number;
  createdAt: string;
}

export const DEFAULT_EXEC_LIMIT = 300;

export function makeExecutionId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface ExecRow {
  id: string;
  created_at: string;
  kind: string;
  status: string;
  title: string;
  summary: string;
  input_preview: string;
  output_preview: string | null;
  session_id: string | null;
  workflow_id: string | null;
  tool_name: string | null;
  model: string | null;
  memory_count: number;
  token_usage: string | null;
  cost_usd: number | null;
  duration_ms: number | null;
}

function rowToRecord(row: ExecRow): ExecutionRecord {
  let tokenUsage: TokenUsage | undefined;
  if (row.token_usage) {
    try { tokenUsage = JSON.parse(row.token_usage); } catch { /* ignore */ }
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind as ExecutionKind,
    status: row.status as ExecutionStatus,
    title: row.title,
    summary: row.summary,
    inputPreview: row.input_preview,
    outputPreview: row.output_preview ?? undefined,
    sessionId: row.session_id ?? undefined,
    workflowId: row.workflow_id ?? undefined,
    toolName: row.tool_name ?? undefined,
    model: row.model ?? undefined,
    memoryCount: row.memory_count,
    tokenUsage,
    costEstimateUsd: row.cost_usd ?? undefined,
    durationMs: row.duration_ms ?? undefined,
  };
}

export function insertExecutionRecord(db: Database.Database, record: ExecutionRecord): void {
  db.prepare(
    `INSERT OR REPLACE INTO execution_records (
       id, created_at, kind, status, title, summary, input_preview, output_preview,
       session_id, workflow_id, tool_name, model, memory_count, token_usage, cost_usd, duration_ms
     ) VALUES (
       @id, @created_at, @kind, @status, @title, @summary, @input_preview, @output_preview,
       @session_id, @workflow_id, @tool_name, @model, @memory_count, @token_usage, @cost_usd, @duration_ms
     )`,
  ).run({
    id: record.id,
    created_at: record.createdAt,
    kind: record.kind,
    status: record.status,
    title: record.title,
    summary: record.summary,
    input_preview: record.inputPreview,
    output_preview: record.outputPreview ?? null,
    session_id: record.sessionId ?? null,
    workflow_id: record.workflowId ?? null,
    tool_name: record.toolName ?? null,
    model: record.model ?? null,
    memory_count: record.memoryCount,
    token_usage: record.tokenUsage ? JSON.stringify(record.tokenUsage) : null,
    cost_usd: record.costEstimateUsd ?? null,
    duration_ms: record.durationMs ?? null,
  });
}

export function appendExecutionRecord(
  db: Database.Database,
  entry: Omit<ExecutionRecord, "id" | "createdAt">,
  retention = DEFAULT_EXEC_LIMIT,
): ExecutionRecord {
  const record: ExecutionRecord = {
    id: makeExecutionId(),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  insertExecutionRecord(db, record);
  pruneExecutionRecords(db, retention);
  return record;
}

export function listExecutionRecords(db: Database.Database, limit = DEFAULT_EXEC_LIMIT): ExecutionRecord[] {
  const rows = db
    .prepare(`SELECT * FROM execution_records ORDER BY created_at DESC, rowid DESC LIMIT ?`)
    .all(limit) as ExecRow[];
  return rows.map(rowToRecord);
}

export function pruneExecutionRecords(db: Database.Database, retention = DEFAULT_EXEC_LIMIT): number {
  const count = (db.prepare(`SELECT COUNT(*) as c FROM execution_records`).get() as { c: number }).c;
  if (count <= retention) return 0;
  const remove = count - retention;
  db.prepare(
    `DELETE FROM execution_records WHERE id IN (
       SELECT id FROM execution_records ORDER BY created_at ASC, rowid ASC LIMIT ?
     )`,
  ).run(remove);
  return remove;
}

export function migrateExecutionFromJson(db: Database.Database, records: ExecutionRecord[]): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO execution_records (
       id, created_at, kind, status, title, summary, input_preview, output_preview,
       session_id, workflow_id, tool_name, model, memory_count, token_usage, cost_usd, duration_ms
     ) VALUES (
       @id, @created_at, @kind, @status, @title, @summary, @input_preview, @output_preview,
       @session_id, @workflow_id, @tool_name, @model, @memory_count, @token_usage, @cost_usd, @duration_ms
     )`,
  );
  let inserted = 0;
  const tx = db.transaction((rows: ExecutionRecord[]) => {
    for (const row of rows) {
      const result = insert.run({
        id: row.id,
        created_at: row.createdAt,
        kind: row.kind,
        status: row.status,
        title: row.title,
        summary: row.summary,
        input_preview: row.inputPreview,
        output_preview: row.outputPreview ?? null,
        session_id: row.sessionId ?? null,
        workflow_id: row.workflowId ?? null,
        tool_name: row.toolName ?? null,
        model: row.model ?? null,
        memory_count: row.memoryCount ?? 0,
        token_usage: row.tokenUsage ? JSON.stringify(row.tokenUsage) : null,
        cost_usd: row.costEstimateUsd ?? null,
        duration_ms: row.durationMs ?? null,
      });
      if (result.changes > 0) inserted++;
    }
  });
  tx(records);
  return inserted;
}
