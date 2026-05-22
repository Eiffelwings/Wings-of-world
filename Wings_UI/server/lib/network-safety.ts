import { isIP } from "node:net";

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    host.endsWith(".local")
  ) {
    return true;
  }

  if (isIP(host) === 4) {
    if (
      host.startsWith("0.") ||
      host.startsWith("10.") ||
      host.startsWith("127.") ||
      host.startsWith("169.254.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return true;
    }
  }

  if (isIP(host) === 6) {
    if (
      host === "::1" ||
      host.startsWith("fe80:") ||
      host.startsWith("fc") ||
      host.startsWith("fd")
    ) {
      return true;
    }
  }

  return false;
}

export function parsePublicHttpUrl(input: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    throw new Error(`Refusing to fetch private/loopback host: ${normalizeHostname(parsed.hostname)}`);
  }

  return parsed;
}

export async function readResponseBufferWithLimit(
  response: Response,
  maxBytes: number,
  label = "Response",
): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`${label} body is empty.`);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // best effort
      }
      throw new Error(`${label} exceeds ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}
