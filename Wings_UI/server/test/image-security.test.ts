import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  downloadGeneratedImageUrl,
  rejectRequestImageBaseUrl,
} from "../features/image-security.js";

const realFetch = globalThis.fetch;

function responseWithBody(body: Uint8Array, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

beforeEach(() => {
  globalThis.fetch = vi.fn() as any;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("image generation security", () => {
  it("rejects request-level baseURL overrides", () => {
    expect(() => rejectRequestImageBaseUrl("https://attacker.example/v1")).toThrow(/baseURL/);
    expect(() => rejectRequestImageBaseUrl("")).not.toThrow();
    expect(() => rejectRequestImageBaseUrl(undefined)).not.toThrow();
  });

  it("rejects private and loopback image URLs before fetching", async () => {
    for (const url of [
      "http://127.0.0.1/image.png",
      "http://localhost/image.png",
      "http://10.0.0.5/image.png",
      "http://192.168.1.10/image.png",
      "http://172.16.0.2/image.png",
      "http://169.254.169.254/latest/meta-data",
    ]) {
      await expect(downloadGeneratedImageUrl(url)).rejects.toThrow(/private\/loopback/);
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects non-image downloads", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      responseWithBody(new TextEncoder().encode("not an image"), "text/html"),
    );

    await expect(downloadGeneratedImageUrl("https://example.com/image")).rejects.toThrow(/content-type/);
  });

  it("rejects oversized image downloads", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      responseWithBody(new Uint8Array(8), "image/png"),
    );

    await expect(
      downloadGeneratedImageUrl("https://example.com/image.png", { maxBytes: 4 }),
    ).rejects.toThrow(/exceeds 4 bytes/);
  });

  it("returns image bytes for safe image URLs", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      responseWithBody(new Uint8Array([1, 2, 3]), "image/png; charset=binary"),
    );

    const result = await downloadGeneratedImageUrl("https://example.com/image.png");
    expect(result.mimeType).toBe("image/png");
    expect([...result.bytes]).toEqual([1, 2, 3]);
  });
});
