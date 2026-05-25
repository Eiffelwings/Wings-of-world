// API tokens with scopes. Tokens are issued as opaque random strings,
// stored as bcrypt-style scrypt hashes, and presented as `Authorization:
// Bearer <token>`. Scopes are simple namespaced strings; routes declare a
// required scope and the middleware enforces it.

import crypto, { scryptSync, timingSafeEqual } from "crypto";
import type Database from "better-sqlite3";
import type { Request, Response, NextFunction } from "express";

export type Scope =
  | "chat:read"
  | "chat:write"
  | "agent:execute"
  | "tools:read"
  | "tools:execute"
  | "memory:read"
  | "memory:write"
  | "tasks:read"
  | "tasks:write"
  | "webhooks:write"
  | "evals:run"
  | "admin";

export const ALL_SCOPES: Scope[] = [
  "chat:read",
  "chat:write",
  "agent:execute",
  "tools:read",
  "tools:execute",
  "memory:read",
  "memory:write",
  "tasks:read",
  "tasks:write",
  "webhooks:write",
  "evals:run",
  "admin",
];

export interface ApiToken {
  id: string;
  name: string;
  scopes: Scope[];
  prefix: string;       // first 8 chars of token, shown for identification
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string | null;
  usageCount: number;
  revokedAt?: string | null;
}

interface TokenRow {
  id: string;
  name: string;
  scopes: string;
  prefix: string;
  hash: string;
  salt: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  usage_count: number;
  revoked_at: string | null;
}

export function ensureTokensSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      scopes        TEXT NOT NULL,
      prefix        TEXT NOT NULL,
      hash          TEXT NOT NULL,
      salt          TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      last_used_at  TEXT,
      expires_at    TEXT,
      usage_count   INTEGER NOT NULL DEFAULT 0,
      revoked_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tokens_prefix ON api_tokens (prefix);
  `);
}

export function makeTokenId(): string {
  return `tok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateTokenSecret(): { token: string; prefix: string } {
  // 256 bits of entropy. Prefix `wings_pk_` so leaked tokens are easy to grep
  // for in incident response, similar to GitHub PAT format.
  const raw = crypto.randomBytes(32).toString("base64url");
  const token = `wings_pk_${raw}`;
  const prefix = token.slice(0, 16);
  return { token, prefix };
}

function hashSecret(secret: string, salt: string): string {
  return scryptSync(secret, salt, 64).toString("hex");
}

export interface CreateTokenInput {
  name: string;
  scopes: Scope[];
  expiresInDays?: number;
}

export interface CreateTokenResult {
  token: ApiToken;
  secret: string; // shown ONCE
}

export function createToken(db: Database.Database, input: CreateTokenInput): CreateTokenResult {
  const id = makeTokenId();
  const { token: secret, prefix } = generateTokenSecret();
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashSecret(secret, salt);
  const createdAt = new Date().toISOString();
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
    : null;
  const scopes = [...new Set(input.scopes)];

  db.prepare(
    `INSERT INTO api_tokens (id, name, scopes, prefix, hash, salt, created_at, expires_at, usage_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(id, input.name, JSON.stringify(scopes), prefix, hash, salt, createdAt, expiresAt);

  return {
    token: { id, name: input.name, scopes, prefix, createdAt, expiresAt, usageCount: 0 },
    secret,
  };
}

export function listTokens(db: Database.Database): ApiToken[] {
  const rows = db
    .prepare(`SELECT * FROM api_tokens ORDER BY created_at DESC`)
    .all() as TokenRow[];
  return rows.map(rowToToken);
}

export function revokeToken(db: Database.Database, id: string): boolean {
  const result = db
    .prepare(`UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`)
    .run(new Date().toISOString(), id);
  return result.changes > 0;
}

export function deleteToken(db: Database.Database, id: string): boolean {
  return db.prepare(`DELETE FROM api_tokens WHERE id = ?`).run(id).changes > 0;
}

function rowToToken(row: TokenRow): ApiToken {
  let scopes: Scope[] = [];
  try { scopes = JSON.parse(row.scopes); } catch { /* ignore */ }
  return {
    id: row.id,
    name: row.name,
    scopes,
    prefix: row.prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    usageCount: row.usage_count,
    revokedAt: row.revoked_at ?? undefined,
  };
}

export interface VerifiedToken {
  ok: true;
  token: ApiToken;
}

export interface VerificationFailure {
  ok: false;
  reason: "missing" | "malformed" | "unknown" | "revoked" | "expired" | "scope";
}

export type VerificationResult = VerifiedToken | VerificationFailure;

export function verifyToken(db: Database.Database, secret: string): VerificationResult {
  if (!secret) return { ok: false, reason: "missing" };
  if (!secret.startsWith("wings_pk_")) return { ok: false, reason: "malformed" };
  const prefix = secret.slice(0, 16);
  const candidates = db
    .prepare(`SELECT * FROM api_tokens WHERE prefix = ?`)
    .all(prefix) as TokenRow[];
  for (const row of candidates) {
    const computed = hashSecret(secret, row.salt);
    let match = false;
    try {
      match = timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(row.hash, "hex"));
    } catch { match = false; }
    if (!match) continue;
    if (row.revoked_at) return { ok: false, reason: "revoked" };
    if (row.expires_at && row.expires_at < new Date().toISOString()) {
      return { ok: false, reason: "expired" };
    }
    db.prepare(
      `UPDATE api_tokens SET last_used_at = ?, usage_count = usage_count + 1 WHERE id = ?`,
    ).run(new Date().toISOString(), row.id);
    return { ok: true, token: rowToToken(row) };
  }
  return { ok: false, reason: "unknown" };
}

export function tokenHasScope(token: ApiToken, scope: Scope): boolean {
  if (token.scopes.includes("admin")) return true;
  return token.scopes.includes(scope);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiToken?: ApiToken;
    }
  }
}

export function makeTokenAuthMiddleware(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.header("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return next();
    const result = verifyToken(db, m[1].trim());
    if (result.ok) req.apiToken = result.token;
    next();
  };
}

export function requireScope(scope: Scope) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.apiToken;
    if (!token) {
      // Fall through — caller can still rely on app password / loopback auth.
      return next();
    }
    if (!tokenHasScope(token, scope)) {
      return res.status(403).json({ error: `Missing required scope: ${scope}` });
    }
    next();
  };
}
