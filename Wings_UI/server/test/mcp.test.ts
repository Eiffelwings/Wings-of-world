import { describe, it, expect } from "vitest";
import { handleMcpRequest } from "../features/mcp.js";

const baseDeps = {
  listTools: () => [
    { name: "echo", description: "Echo back the input", inputSchema: { type: "object" } },
  ],
  callTool: async (name: string, args: Record<string, unknown>) => {
    if (name === "echo") return args;
    if (name === "fail") throw new Error("boom");
    throw new Error("unknown tool");
  },
  listPrompts: () => [{ name: "hello", description: "say hi" }],
};

describe("mcp handler", () => {
  it("responds to initialize with protocol version + serverInfo", async () => {
    const res = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize" }, baseDeps);
    expect(res.id).toBe(1);
    expect((res.result as any).protocolVersion).toBe("2024-11-05");
    expect((res.result as any).serverInfo.name).toBe("wings-of-world-mcp");
  });

  it("lists tools", async () => {
    const res = await handleMcpRequest({ id: 2, method: "tools/list" }, baseDeps);
    expect((res.result as any).tools).toHaveLength(1);
    expect((res.result as any).tools[0].name).toBe("echo");
  });

  it("calls a tool and returns text content", async () => {
    const res = await handleMcpRequest(
      { id: 3, method: "tools/call", params: { name: "echo", arguments: { hi: "there" } } },
      baseDeps,
    );
    expect((res.result as any).isError).toBe(false);
    expect(JSON.parse((res.result as any).content[0].text)).toEqual({ hi: "there" });
  });

  it("returns isError:true when the tool throws", async () => {
    const res = await handleMcpRequest(
      { id: 4, method: "tools/call", params: { name: "fail", arguments: {} } },
      baseDeps,
    );
    expect((res.result as any).isError).toBe(true);
    expect((res.result as any).content[0].text).toContain("boom");
  });

  it("rejects tools/call without a tool name", async () => {
    const res = await handleMcpRequest(
      { id: 5, method: "tools/call", params: {} },
      baseDeps,
    );
    expect(res.error?.code).toBe(-32602);
  });

  it("returns method-not-found for unknown methods", async () => {
    const res = await handleMcpRequest({ id: 6, method: "no/such" }, baseDeps);
    expect(res.error?.code).toBe(-32601);
  });

  it("handles ping", async () => {
    const res = await handleMcpRequest({ id: 7, method: "ping" }, baseDeps);
    expect(res.result).toEqual({});
  });

  it("lists prompts when provided", async () => {
    const res = await handleMcpRequest({ id: 8, method: "prompts/list" }, baseDeps);
    expect((res.result as any).prompts).toHaveLength(1);
  });

  it("returns empty prompts list when no listPrompts dep", async () => {
    const res = await handleMcpRequest(
      { id: 9, method: "prompts/list" },
      { listTools: () => [], callTool: async () => null },
    );
    expect((res.result as any).prompts).toEqual([]);
  });
});
