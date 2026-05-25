import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  hashEmbedding,
  searchVectorMemory,
  type VectorMemoryEntry,
} from "../features/vector-memory.js";

describe("vector-memory", () => {
  describe("cosineSimilarity", () => {
    it("returns 1 for identical vectors", () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    });

    it("returns 0 for orthogonal vectors", () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });

    it("returns -1 for opposite vectors", () => {
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    });

    it("returns 0 for length mismatch", () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });

    it("returns 0 when a vector is all zeros", () => {
      expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    });
  });

  describe("hashEmbedding", () => {
    it("produces a unit vector of the requested dimension", () => {
      const vec = hashEmbedding("hello world", 64);
      expect(vec).toHaveLength(64);
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1);
    });

    it("is deterministic for the same input", () => {
      expect(hashEmbedding("wings", 32)).toEqual(hashEmbedding("wings", 32));
    });

    it("produces different vectors for unrelated text", () => {
      const a = hashEmbedding("quantum physics research paper", 128);
      const b = hashEmbedding("pizza pepperoni mushrooms cheese", 128);
      expect(cosineSimilarity(a, b)).toBeLessThan(0.95);
    });
  });

  describe("searchVectorMemory", () => {
    const entries: VectorMemoryEntry[] = [
      { id: "1", text: "apple banana cherry", embedding: hashEmbedding("apple banana cherry"), createdAt: "" },
      { id: "2", text: "cat dog elephant", embedding: hashEmbedding("cat dog elephant"), createdAt: "" },
      { id: "3", text: "apple pie recipe", embedding: hashEmbedding("apple pie recipe"), createdAt: "" },
    ];

    it("returns top-K results sorted by score", () => {
      const q = hashEmbedding("apple fruit");
      const hits = searchVectorMemory(entries, q, { topK: 2 });
      expect(hits).toHaveLength(2);
      expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
      expect(["1", "3"]).toContain(hits[0].entry.id);
    });

    it("filters by minScore", () => {
      const q = hashEmbedding("apple fruit");
      const hits = searchVectorMemory(entries, q, { topK: 10, minScore: 0.99 });
      expect(hits.every((h) => h.score >= 0.99)).toBe(true);
    });
  });
});
