import crypto from "crypto";
import { readJsonSafe, writeJsonSync } from "../lib/storage.js";

export interface WebhookConfig {
  id: string;
  name: string;
  secret: string;
  skillId?: string;
  forwardToPrompt?: string;
  createdAt: string;
}

export interface WebhookEvent {
  id: string;
  webhookId: string;
  receivedAt: string;
  signatureValid: boolean;
  payload: unknown;
  processedSummary?: string;
}

export const WEBHOOK_EVENT_RETENTION = 500;

export function makeWebhookId(): string {
  return `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeWebhookEventId(): string {
  return `whe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeWebhookSecret(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function loadWebhooks(filePath: string): WebhookConfig[] {
  const raw = readJsonSafe<unknown>(filePath, []);
  return Array.isArray(raw) ? (raw as WebhookConfig[]) : [];
}

export function saveWebhooks(filePath: string, hooks: WebhookConfig[]): void {
  writeJsonSync(filePath, hooks);
}

export function loadWebhookEvents(filePath: string): WebhookEvent[] {
  const raw = readJsonSafe<unknown>(filePath, []);
  return Array.isArray(raw) ? (raw as WebhookEvent[]) : [];
}

export function saveWebhookEvents(filePath: string, events: WebhookEvent[]): void {
  writeJsonSync(filePath, events.slice(-WEBHOOK_EVENT_RETENTION));
}

export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "…";
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

export function verifyWebhookSignature(secret: string, payload: string, signature: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const given = signature.replace(/^sha256=/i, "");
  if (expected.length !== given.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given, "hex"));
  } catch {
    return false;
  }
}

export function parseWebhookBody(raw: Buffer): unknown {
  const text = raw.toString("utf-8");
  try { return JSON.parse(text || "{}"); } catch { return text; }
}
