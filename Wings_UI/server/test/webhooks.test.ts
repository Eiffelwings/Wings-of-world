import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  makeWebhookSecret,
  maskSecret,
  verifyWebhookSignature,
  parseWebhookBody,
} from "../features/webhooks.js";

function sign(secret: string, payload: string, prefix = ""): string {
  const hex = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return prefix + hex;
}

describe("webhooks", () => {
  describe("makeWebhookSecret", () => {
    it("returns a 48-char hex string", () => {
      const s = makeWebhookSecret();
      expect(s).toMatch(/^[a-f0-9]{48}$/);
    });

    it("returns different values across calls", () => {
      expect(makeWebhookSecret()).not.toBe(makeWebhookSecret());
    });
  });

  describe("maskSecret", () => {
    it("masks long secrets keeping head and tail", () => {
      const masked = maskSecret("abcdefghijklmnop");
      expect(masked).toBe("abcd…mnop");
    });

    it("returns ellipsis-only for very short secrets", () => {
      expect(maskSecret("abc")).toBe("…");
    });

    it("returns empty for empty input", () => {
      expect(maskSecret("")).toBe("");
    });
  });

  describe("verifyWebhookSignature", () => {
    const secret = "supersecret";
    const payload = JSON.stringify({ hello: "world" });

    it("accepts a valid signature", () => {
      const sig = sign(secret, payload);
      expect(verifyWebhookSignature(secret, payload, sig)).toBe(true);
    });

    it("accepts the sha256= prefix variant", () => {
      const sig = sign(secret, payload, "sha256=");
      expect(verifyWebhookSignature(secret, payload, sig)).toBe(true);
    });

    it("rejects a tampered payload", () => {
      const sig = sign(secret, payload);
      expect(verifyWebhookSignature(secret, payload + "x", sig)).toBe(false);
    });

    it("rejects a different secret", () => {
      const sig = sign(secret, payload);
      expect(verifyWebhookSignature("other", payload, sig)).toBe(false);
    });

    it("rejects an empty signature", () => {
      expect(verifyWebhookSignature(secret, payload, "")).toBe(false);
    });

    it("rejects garbage signature without throwing", () => {
      expect(verifyWebhookSignature(secret, payload, "not-hex")).toBe(false);
    });
  });

  describe("parseWebhookBody", () => {
    it("parses valid JSON", () => {
      const buf = Buffer.from(JSON.stringify({ a: 1 }));
      expect(parseWebhookBody(buf)).toEqual({ a: 1 });
    });

    it("returns text on parse failure", () => {
      const buf = Buffer.from("not json");
      expect(parseWebhookBody(buf)).toBe("not json");
    });

    it("returns empty object for empty buffer", () => {
      expect(parseWebhookBody(Buffer.from(""))).toEqual({});
    });
  });
});
