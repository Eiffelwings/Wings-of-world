import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

const indexSource = fs.readFileSync(
  path.resolve(import.meta.dirname, "../index.ts"),
  "utf-8",
);

describe("tool routing security", () => {
  it("keeps one web_fetch tool definition and routes it through fetchWebContent", () => {
    expect(indexSource.match(/name:\s*"web_fetch"/g) || []).toHaveLength(1);
    expect(indexSource).not.toContain("runWebFetch");
    expect(indexSource).toContain("return await fetchWebContent(url, { maxChars });");
  });

  it("does not expose request-level baseURL on generate_image", () => {
    expect(indexSource).not.toContain('baseURL: "string?"');
    expect(indexSource).toContain("rejectRequestImageBaseUrl(args.baseURL)");
  });

  it("keeps high-risk confirmation at the shared tool execution boundary", () => {
    expect(indexSource).toContain("function assertToolConfirmation");
    expect(indexSource).toContain("assertToolConfirmation(name, options);");
    expect(indexSource).toContain("confirmed: req.body?.confirm === true");
  });

  it("does not advertise confirmation-required tools to macro loops", () => {
    expect(indexSource).toContain("const availableTools = getAgenticToolDefinitions()");
  });
});
