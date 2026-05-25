import fs from "fs";
import path from "path";
import crypto from "crypto";

const writeQueues = new Map<string, Promise<void>>();

export function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface WriteOptions {
  mode?: number;
}

function atomicWriteSync(filePath: string, data: string, options: WriteOptions = {}): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, data, { encoding: "utf-8", ...(options.mode ? { mode: options.mode } : {}) });
  try {
    fs.renameSync(tmp, filePath);
    if (options.mode) {
      try { fs.chmodSync(filePath, options.mode); } catch { /* platform may not support */ }
    }
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

export function writeJsonSync(filePath: string, value: unknown, options: WriteOptions = {}): void {
  atomicWriteSync(filePath, JSON.stringify(value, null, 2), options);
}

export function writeJsonQueued(filePath: string, value: unknown, options: WriteOptions = {}): Promise<void> {
  const serialized = JSON.stringify(value, null, 2);
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const next = previous
    .catch(() => { /* swallow to keep queue alive */ })
    .then(() => new Promise<void>((resolve, reject) => {
      try {
        atomicWriteSync(filePath, serialized, options);
        resolve();
      } catch (err) {
        reject(err);
      }
    }))
    .finally(() => {
      if (writeQueues.get(filePath) === next) writeQueues.delete(filePath);
    });
  writeQueues.set(filePath, next);
  return next;
}

export async function flushWriteQueue(filePath?: string): Promise<void> {
  if (filePath) {
    const q = writeQueues.get(filePath);
    if (q) await q.catch(() => { /* ignore */ });
    return;
  }
  const all = Array.from(writeQueues.values());
  await Promise.all(all.map((p) => p.catch(() => { /* ignore */ })));
}
