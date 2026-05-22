import type Database from "better-sqlite3";

export type AuditArea = "chat" | "workflow" | "tool" | "memory" | "settings" | "system" | string;
export type AuditStatus = "success" | "error";

export interface AuditEntry {
  id: string;
  area: AuditArea;
  action: string;
  status: AuditStatus;
  summary: string;
  timestamp: string;
  targetId?: string;
}

export const DEFAULT_AUDIT_LIMIT = 300;

export function makeAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface AuditRow {
  id: string;
  timestamp: string;
  area: string;
  action: string;
  status: string;
  summary: string;
  target_id: string | null;
}

function rowToEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    area: row.area,
    action: row.action,
    status: row.status as AuditStatus,
    summary: row.summary,
    targetId: row.target_id ?? undefined,
  };
}

export function insertAuditEntry(db: Database.Database, entry: AuditEntry): void {
  db.prepare(
    `INSERT OR REPLACE INTO audit_entries (id, timestamp, area, action, status, summary, target_id)
     VALUES (@id, @timestamp, @area, @action, @status, @summary, @target_id)`,
  ).run({
    id: entry.id,
    timestamp: entry.timestamp,
    area: entry.area,
    action: entry.action,
    status: entry.status,
    summary: entry.summary,
    target_id: entry.targetId ?? null,
  });
}

export function appendAuditEntry(
  db: Database.Database,
  entry: Omit<AuditEntry, "id" | "timestamp">,
  retention = DEFAULT_AUDIT_LIMIT,
): AuditEntry {
  const record: AuditEntry = {
    id: makeAuditId(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  insertAuditEntry(db, record);
  pruneAuditEntries(db, retention);
  return record;
}

export function listAuditEntries(db: Database.Database, limit = DEFAULT_AUDIT_LIMIT): AuditEntry[] {
  const rows = db
    .prepare(`SELECT * FROM audit_entries ORDER BY timestamp DESC, rowid DESC LIMIT ?`)
    .all(limit) as AuditRow[];
  return rows.map(rowToEntry);
}

export function pruneAuditEntries(db: Database.Database, retention = DEFAULT_AUDIT_LIMIT): number {
  const count = (db.prepare(`SELECT COUNT(*) as c FROM audit_entries`).get() as { c: number }).c;
  if (count <= retention) return 0;
  const remove = count - retention;
  db.prepare(
    `DELETE FROM audit_entries WHERE id IN (
       SELECT id FROM audit_entries ORDER BY timestamp ASC, rowid ASC LIMIT ?
     )`,
  ).run(remove);
  return remove;
}

export function migrateAuditFromJson(db: Database.Database, entries: AuditEntry[]): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO audit_entries (id, timestamp, area, action, status, summary, target_id)
     VALUES (@id, @timestamp, @area, @action, @status, @summary, @target_id)`,
  );
  let inserted = 0;
  const tx = db.transaction((rows: AuditEntry[]) => {
    for (const row of rows) {
      const result = insert.run({
        id: row.id,
        timestamp: row.timestamp,
        area: row.area,
        action: row.action,
        status: row.status,
        summary: row.summary,
        target_id: row.targetId ?? null,
      });
      if (result.changes > 0) inserted++;
    }
  });
  tx(entries);
  return inserted;
}
