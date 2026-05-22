export const CHARS_PER_TOKEN = 4;
export const MESSAGE_CHAR_CAP = 12_000;
export const TOOL_RESULT_CHAR_CAP = 4_000;
export const MEMORY_ITEM_CHAR_CAP = 400;

export interface MinimalChatMessage {
  role: string;
  content: string | unknown;
}

export function estimateMessagesTokens(messages: MinimalChatMessage[]): number {
  return Math.ceil(
    messages.reduce(
      (sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0),
      0,
    ) / CHARS_PER_TOKEN,
  );
}

export function adaptiveMaxTokens(
  messages: MinimalChatMessage[],
  defaultCap: number,
): number {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const len = typeof lastUser?.content === "string" ? lastUser.content.length : 0;
  if (len < 200) return Math.min(defaultCap, 1024);
  if (len < 1500) return Math.min(defaultCap, 2048);
  return defaultCap;
}

export function capMessage<T extends MinimalChatMessage>(message: T, cap = MESSAGE_CHAR_CAP): T {
  if (typeof message.content !== "string" || message.content.length <= cap) return message;
  const head = message.content.slice(0, Math.floor(cap * 0.7));
  const tail = message.content.slice(-Math.floor(cap * 0.2));
  const omitted = message.content.length - head.length - tail.length;
  return {
    ...message,
    content: `${head}\n…[${omitted} chars omitted]…\n${tail}`,
  };
}

export function capMessageSizes<T extends MinimalChatMessage>(messages: T[], cap = MESSAGE_CHAR_CAP): T[] {
  return messages.map((m) => capMessage(m, cap));
}

export function truncateMemoryContent(content: string, cap = MEMORY_ITEM_CHAR_CAP): string {
  if (content.length <= cap) return content;
  return `${content.slice(0, cap)}…`;
}

export function smartTruncateToolResult(result: unknown, cap = TOOL_RESULT_CHAR_CAP): string {
  if (typeof result === "string") {
    return result.length > cap
      ? `${result.slice(0, cap)}\n…[truncated ${result.length - cap} chars]`
      : result;
  }
  const serialized = JSON.stringify(result) ?? "";
  if (serialized.length <= cap) return serialized;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>;
    const entries = Object.entries(obj).map(([k, v]) => {
      const vs = typeof v === "string" ? v : JSON.stringify(v);
      return { k, vs: vs || "", len: (vs || "").length };
    });
    entries.sort((a, b) => b.len - a.len);
    const remaining = cap - entries.length * 8;
    const perField = Math.max(200, Math.floor(remaining / Math.max(1, entries.length)));
    const trimmed: Record<string, unknown> = {};
    let used = 0;
    for (const { k, vs } of entries) {
      const slice = vs.length > perField ? `${vs.slice(0, perField)}…` : vs;
      used += slice.length;
      trimmed[k] = slice;
      if (used >= cap) break;
    }
    return JSON.stringify(trimmed);
  }
  return `${serialized.slice(0, cap)}…[truncated]`;
}
