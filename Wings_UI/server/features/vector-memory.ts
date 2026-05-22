import crypto from "crypto";
import { readJsonSafe, writeJsonSync } from "../lib/storage.js";

export interface VectorMemoryEntry {
  id: string;
  text: string;
  embedding: number[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export function makeVectorMemoryId(): string {
  return `vmem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadVectorMemory(filePath: string): VectorMemoryEntry[] {
  const raw = readJsonSafe<unknown>(filePath, []);
  return Array.isArray(raw) ? (raw as VectorMemoryEntry[]) : [];
}

export function saveVectorMemory(filePath: string, entries: VectorMemoryEntry[]): void {
  writeJsonSync(filePath, entries);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function hashEmbedding(text: string, dims = 256): number[] {
  const vec = new Array(dims).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const tok of tokens) {
    const h = crypto.createHash("sha256").update(tok).digest();
    for (let i = 0; i < dims; i++) {
      vec[i] += (h[i % h.length] - 128) / 128;
    }
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export interface EmbeddingProviderConfig {
  provider: string;
  baseURL: string;
  apiKey?: string;
}

export async function embedText(cfg: EmbeddingProviderConfig, text: string): Promise<number[]> {
  const trimmed = text.slice(0, 8000);
  if (cfg.provider === "anthropic") return hashEmbedding(trimmed);
  const modelCandidates = cfg.provider === "gemini"
    ? ["text-embedding-004", "embedding-001"]
    : ["text-embedding-3-small", "text-embedding-ada-002"];
  const url = `${cfg.baseURL.replace(/\/$/, "")}/embeddings`;
  for (const model of modelCandidates) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({ model, input: trimmed }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const vec = data?.data?.[0]?.embedding;
      if (Array.isArray(vec) && vec.length > 0) return vec.map((v: any) => Number(v));
    } catch { /* try next model */ }
  }
  return hashEmbedding(trimmed);
}

export function searchVectorMemory(
  entries: VectorMemoryEntry[],
  queryVec: number[],
  options: { topK?: number; minScore?: number } = {},
): Array<{ entry: VectorMemoryEntry; score: number }> {
  const { topK = 5, minScore = 0 } = options;
  return entries
    .map((entry) => ({ entry, score: cosineSimilarity(queryVec, entry.embedding) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
