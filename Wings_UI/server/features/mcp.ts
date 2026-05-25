export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpPromptDefinition {
  name: string;
  description: string;
}

export interface McpHandlerDeps {
  listTools: () => McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  listPrompts?: () => McpPromptDefinition[];
  serverInfo?: { name: string; version: string };
}

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const DEFAULT_SERVER_INFO = { name: "wings-of-world-mcp", version: "1.0.0" };

export async function handleMcpRequest(
  request: JsonRpcRequest,
  deps: McpHandlerDeps,
): Promise<JsonRpcResponse> {
  const id = request?.id ?? null;
  const method = typeof request?.method === "string" ? request.method : "";
  const params = request?.params ?? {};
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string, data?: unknown): JsonRpcResponse => ({
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  });

  try {
    switch (method) {
      case "initialize":
        return ok({
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: deps.serverInfo ?? DEFAULT_SERVER_INFO,
        });
      case "tools/list":
        return ok({ tools: deps.listTools() });
      case "tools/call": {
        const name = typeof params?.name === "string" ? params.name : "";
        const args = (params?.arguments && typeof params.arguments === "object") ? params.arguments : {};
        if (!name) return err(-32602, "Missing tool name");
        try {
          const result = await deps.callTool(name, args as Record<string, unknown>);
          return ok({
            content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }],
            isError: false,
          });
        } catch (e: any) {
          return ok({
            content: [{ type: "text", text: e?.message || String(e) }],
            isError: true,
          });
        }
      }
      case "resources/list":
        return ok({ resources: [] });
      case "prompts/list":
        return ok({ prompts: deps.listPrompts?.() ?? [] });
      case "ping":
        return ok({});
      default:
        return err(-32601, `Method not found: ${method}`);
    }
  } catch (e: any) {
    return err(-32603, e?.message || String(e));
  }
}
