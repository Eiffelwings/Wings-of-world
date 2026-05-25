import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

let dbInstance: Database.Database | null = null;
let dbPath: string | null = null;

export function initDb(filePath: string): Database.Database {
  if (dbInstance && dbPath === filePath) return dbInstance;
  if (dbInstance) {
    try { dbInstance.close(); } catch { /* ignore */ }
    dbInstance = null;
  }
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = OFF"); // 🔥 Ultimate speed
  db.pragma("temp_store = MEMORY"); // Use RAM for temp tables
  db.pragma("mmap_size = 2000000000"); // 2GB Memory mapping for speed
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_entries (
      id          TEXT PRIMARY KEY,
      timestamp   TEXT NOT NULL,
      area        TEXT NOT NULL,
      action      TEXT NOT NULL,
      status      TEXT NOT NULL,
      summary     TEXT NOT NULL,
      target_id   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_entries (timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_area ON audit_entries (area);

    CREATE TABLE IF NOT EXISTS execution_records (
      id              TEXT PRIMARY KEY,
      created_at      TEXT NOT NULL,
      kind            TEXT NOT NULL,
      status          TEXT NOT NULL,
      title           TEXT NOT NULL,
      summary         TEXT NOT NULL,
      input_preview   TEXT NOT NULL,
      output_preview  TEXT,
      session_id      TEXT,
      workflow_id     TEXT,
      tool_name       TEXT,
      model           TEXT,
      memory_count    INTEGER NOT NULL DEFAULT 0,
      token_usage     TEXT,
      cost_usd        REAL,
      duration_ms     INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_exec_created ON execution_records (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_exec_kind ON execution_records (kind);
    CREATE INDEX IF NOT EXISTS idx_exec_session ON execution_records (session_id);
  `);
  dbInstance = db;
  dbPath = filePath;
  return db;
}

export function getDb(): Database.Database {
  if (!dbInstance) throw new Error("DB not initialized — call initDb() first");
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    try { dbInstance.close(); } catch { /* ignore */ }
    dbInstance = null;
    dbPath = null;
  }
}
