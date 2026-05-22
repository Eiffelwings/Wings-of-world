import { parsePublicHttpUrl, readResponseBufferWithLimit } from "../lib/network-safety.js";

export const MAX_GENERATED_IMAGE_DOWNLOAD_BYTES = 12 * 1024 * 1024;

export function rejectRequestImageBaseUrl(value: unknown): void {
  if (typeof value === "string" && value.trim()) {
    throw new Error("Image generation baseURL must be configured in Settings; request-level baseURL is not allowed.");
  }
}

export async function downloadGeneratedImageUrl(
  rawUrl: string,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<{ bytes: Buffer; mimeType: string }> {
  const url = parsePublicHttpUrl(rawUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxBytes = options.maxBytes ?? MAX_GENERATED_IMAGE_DOWNLOAD_BYTES;

  const response = await fetchImpl(url.toString(), {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Image download ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const mimeType = contentType.split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Image download returned unsupported content-type: ${contentType || "unknown"}`);
  }

  const bytes = await readResponseBufferWithLimit(response, maxBytes, "Image download");
  if (!bytes.length) {
    throw new Error("Image provider returned an empty image.");
  }

  return { bytes, mimeType };
}
