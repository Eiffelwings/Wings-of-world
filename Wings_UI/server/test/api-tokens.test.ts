import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import request from "supertest";
import { initDb, closeDb, getDb } from "../lib/db.js";
import {
  ensureTokensSchema,
  createToken,
  listTokens,
  revokeToken,
  verifyToken,
  tokenHasScope,
  makeTokenAuthMiddleware,
  requireScope,
} from "../features/api-tokens.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wings-tokens-"));
  initDb(path.join(tmpDir, "tokens.db"));
  ensureTokensSchema(getDb());
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("api-tokens", () => {
  it("creates a token with a one-time secret and verifies it", () => {
    const { token, secret } = createToken(getDb(), { name: "ci", scopes: ["chat:write"] });
    expect(secret).toMatch(/^wings_pk_/);
    expect(token.scopes).toEqual(["chat:write"]);

    const result = verifyToken(getDb(), secret);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.token.id).toBe(token.id);
  });

  it("rejects an unknown secret", () => {
    const result = verifyToken(getDb(), "wings_pk_obviously_not_real_secret_xyz123");
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed secret", () => {
    expect(verifyToken(getDb(), "bearer_xyz").ok).toBe(false);
    expect(verifyToken(getDb(), "").ok).toBe(false);
  });

  it("revokes a token so subsequent verifications fail", () => {
    const { token, secret } = createToken(getDb(), { name: "tmp", scopes: ["admin"] });
    expect(verifyToken(getDb(), secret).ok).toBe(true);
    expect(revokeToken(getDb(), token.id)).toBe(true);
    const after = verifyToken(getDb(), secret);
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.reason).toBe("revoked");
  });

  it("admin scope grants any other scope", () => {
    const { token } = createToken(getDb(), { name: "boss", scopes: ["admin"] });
    expect(tokenHasScope(token, "chat:write")).toBe(true);
    expect(tokenHasScope(token, "tools:execute")).toBe(true);
  });

  it("scope-less tokens are denied via requireScope middleware", async () => {
    const { secret } = createToken(getDb(), { name: "limited", scopes: ["chat:read"] });
    const app = express();
    app.use(makeTokenAuthMiddleware(getDb()));
    app.get("/secure", requireScope("chat:write"), (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get("/secure")
      .set("Authorization", `Bearer ${secret}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("scope");
  });

  it("requireScope passes through when token has the scope", async () => {
    const { secret } = createToken(getDb(), { name: "writer", scopes: ["chat:write"] });
    const app = express();
    app.use(makeTokenAuthMiddleware(getDb()));
    app.get("/secure", requireScope("chat:write"), (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get("/secure")
      .set("Authorization", `Bearer ${secret}`);
    expect(res.status).toBe(200);
  });

  it("listTokens shows usage counters that increment on verify", () => {
    const { token, secret } = createToken(getDb(), { name: "counter", scopes: ["chat:write"] });
    verifyToken(getDb(), secret);
    verifyToken(getDb(), secret);
    const refreshed = listTokens(getDb()).find((t) => t.id === token.id)!;
    expect(refreshed.usageCount).toBe(2);
    expect(refreshed.lastUsedAt).toBeDefined();
  });

  it("expired tokens are rejected", () => {
    const { secret } = createToken(getDb(), { name: "ttl", scopes: ["chat:write"] });
    // Force expiry by editing the row.
    getDb().prepare(`UPDATE api_tokens SET expires_at = ? WHERE prefix = ?`)
      .run("2000-01-01T00:00:00Z", secret.slice(0, 16));
    const result = verifyToken(getDb(), secret);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });
});
