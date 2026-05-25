// Lightweight HTTP client for the Wings API. Used by the CLI subcommands.

const DEFAULT_HOST = process.env.WINGS_OF_WORLD_HOST || process.env.WINGS_HOST || "127.0.0.1";
const DEFAULT_PORT = process.env.WINGS_OF_WORLD_PORT || process.env.WINGS_PORT || "3001";
const DEFAULT_BASE =
  process.env.WINGS_OF_WORLD_API_BASE ||
  process.env.WINGS_API_BASE ||
  `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

export class WingsClient {
  constructor(baseUrl = DEFAULT_BASE) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async ping() {
    try {
      const res = await fetch(`${this.baseUrl}/api/system/readiness`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async request(method, path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && typeof data === "object" && data.error) || res.statusText;
      const err = new Error(`HTTP ${res.status}: ${msg}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async chat({ messages, sessionId, model, skillIds, resourceUris }) {
    return this.request("POST", "/api/chat", {
      messages,
      sessionId,
      model,
      skillIds,
      resourceUris,
    });
  }

  async agent({ messages, model }) {
    return this.request("POST", "/api/chat/agent", { messages, model });
  }

  async streamChat({ messages, model, onDelta }) {
    const res = await fetch(`${this.baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const eventLine = part.split("\n").find((l) => l.startsWith("event:"));
        const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const event = eventLine ? eventLine.slice(6).trim() : "message";
        try {
          const payload = JSON.parse(dataLine.slice(5).trim());
          if (event === "delta" && payload?.text) {
            full += payload.text;
            onDelta?.(payload.text);
          } else if (event === "error") {
            throw new Error(payload?.error || "stream error");
          }
        } catch (err) {
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
    }
    return full;
  }

  // Memory
  listMemory() { return this.request("GET", "/api/vector-memory"); }
  addMemory(text, metadata) { return this.request("POST", "/api/vector-memory", { text, metadata }); }
  searchMemory(query, topK = 5) { return this.request("POST", "/api/vector-memory/search", { query, topK }); }
  deleteMemory(id) { return this.request("DELETE", `/api/vector-memory/${encodeURIComponent(id)}`); }

  // Scheduled tasks
  listTasks() { return this.request("GET", "/api/scheduled-tasks"); }
  addTask(task) { return this.request("POST", "/api/scheduled-tasks", task); }
  updateTask(id, patch) { return this.request("PATCH", `/api/scheduled-tasks/${encodeURIComponent(id)}`, patch); }
  deleteTask(id) { return this.request("DELETE", `/api/scheduled-tasks/${encodeURIComponent(id)}`); }
  runTask(id) { return this.request("POST", `/api/scheduled-tasks/${encodeURIComponent(id)}/run`); }

  // Webhooks
  listWebhooks() { return this.request("GET", "/api/webhooks"); }
  addWebhook(payload) { return this.request("POST", "/api/webhooks", payload); }
  deleteWebhook(id) { return this.request("DELETE", `/api/webhooks/${encodeURIComponent(id)}`); }
  listWebhookEvents() { return this.request("GET", "/api/webhooks/events"); }

  // Tools
  listTools() { return this.request("GET", "/api/tools"); }
  executeTool(name, args) { return this.request("POST", "/api/tools/execute", { name, args }); }

  // System
  audit() { return this.request("GET", "/api/audit"); }
  history(limit = 50) { return this.request("GET", `/api/executions?limit=${limit}`); }

  // Guardrails
  listEvals() { return this.request("GET", "/api/evals"); }
  getEval(id) { return this.request("GET", `/api/evals/${encodeURIComponent(id)}`); }
  runEval(id, values) { return this.request("POST", "/api/evals/run", { id, values }); }
  runEvalBatch(ids, values) { return this.request("POST", "/api/evals/run-batch", { ids, values }); }
  guardrailCheck(payload) { return this.request("POST", "/api/guardrails/check", payload); }

  // Tracing
  listTraces(limit = 50) { return this.request("GET", `/api/traces?limit=${limit}`); }
  getTrace(id) { return this.request("GET", `/api/traces/${encodeURIComponent(id)}`); }

  // Cache
  cacheList() { return this.request("GET", "/api/cache"); }
  cacheClear() { return this.request("POST", "/api/cache/clear"); }
  cachePrune(days = 30) { return this.request("POST", "/api/cache/prune", { days }); }

  // API tokens
  listApiTokens() { return this.request("GET", "/api/tokens"); }
  createApiToken(payload) { return this.request("POST", "/api/tokens", payload); }
  revokeApiToken(id) { return this.request("POST", `/api/tokens/${encodeURIComponent(id)}/revoke`); }
  deleteApiToken(id) { return this.request("DELETE", `/api/tokens/${encodeURIComponent(id)}`); }

  // Datasets / replay
  listDatasets() { return this.request("GET", "/api/datasets"); }
  createDataset(payload) { return this.request("POST", "/api/datasets", payload); }
  deleteDataset(id) { return this.request("DELETE", `/api/datasets/${encodeURIComponent(id)}`); }
  listDatasetItems(id) { return this.request("GET", `/api/datasets/${encodeURIComponent(id)}/items`); }
  addDatasetItem(id, payload) { return this.request("POST", `/api/datasets/${encodeURIComponent(id)}/items`, payload); }
  replayDataset(id, payload) { return this.request("POST", `/api/datasets/${encodeURIComponent(id)}/replay`, payload); }
  listReplayRuns(id) { return this.request("GET", `/api/datasets/${encodeURIComponent(id)}/runs`); }
  getReplayRun(id) { return this.request("GET", `/api/replay-runs/${encodeURIComponent(id)}`); }

  // Adversarial
  listProbes(categories) { return this.request("GET", `/api/adversarial/probes${categories ? `?categories=${categories}` : ""}`); }
  runAdversarial(payload) { return this.request("POST", "/api/adversarial/run", payload); }

  // Experiments
  listExperiments() { return this.request("GET", "/api/experiments"); }
  createExperiment(payload) { return this.request("POST", "/api/experiments", payload); }
  experimentStats(id) { return this.request("GET", `/api/experiments/${encodeURIComponent(id)}/stats`); }
  setExperimentStatus(id, status) { return this.request("PATCH", `/api/experiments/${encodeURIComponent(id)}/status`, { status }); }

  // Cost
  costOverview(days = 7) { return this.request("GET", `/api/cost/overview?days=${days}`); }
  costForecast(lookback = 7) { return this.request("GET", `/api/cost/forecast?lookback=${lookback}`); }

  // Hermes sync
  hermesStatus() { return this.request("GET", "/api/hermes/sync/status"); }
  hermesPush() { return this.request("POST", "/api/hermes/sync/push"); }
  hermesPull() { return this.request("POST", "/api/hermes/sync/pull"); }
  hermesSync() { return this.request("POST", "/api/hermes/sync/full"); }

  // Cascade
  cascadeConfig() { return this.request("GET", "/api/cascade/config"); }
  cascadeStats(days = 7) { return this.request("GET", `/api/cascade/stats?days=${days}`); }
  cascadeChat(payload) { return this.request("POST", "/api/chat/cascade", payload); }

  // Compression
  compressConfig() { return this.request("GET", "/api/compress/config"); }
  compressPreview(text, level = "light", minChars) {
    return this.request("POST", "/api/compress/preview", { text, level, minChars });
  }

  // Tool cache
  toolCacheStats() { return this.request("GET", "/api/tool-cache/stats"); }
  toolCacheEntries(limit = 50) { return this.request("GET", `/api/tool-cache/entries?limit=${limit}`); }
  toolCacheClear(tool) { return this.request("POST", "/api/tool-cache/clear", tool ? { tool } : {}); }
  toolCachePrune(maxEntries) { return this.request("POST", "/api/tool-cache/prune", maxEntries ? { maxEntries } : {}); }

  // Memory consolidation
  memoryConsolidate(payload) { return this.request("POST", "/api/memory/consolidate", payload); }
  memoryConsolidationHistory(limit = 30) { return this.request("GET", `/api/memory/consolidation/history?limit=${limit}`); }
  memoryConsolidationRun(id) { return this.request("GET", `/api/memory/consolidation/${encodeURIComponent(id)}`); }

  // Optimization summary
  optimizationSummary(days = 7) { return this.request("GET", `/api/optimization/summary?days=${days}`); }

  skills() { return this.request("GET", "/api/skills"); }
  settings() { return this.request("GET", "/api/settings"); }
  readiness() { return this.request("GET", "/api/system/readiness"); }
}

export const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export function color(name, text) {
  if (!process.stdout.isTTY) return text;
  return `${colors[name] ?? ""}${text}${colors.reset}`;
}

export function formatTokenUsage(usage) {
  if (!usage) return "";
  return `${usage.promptTokens || 0}p + ${usage.completionTokens || 0}c = ${usage.totalTokens || 0}t`;
}

export function formatTable(rows, columns) {
  if (rows.length === 0) return color("dim", "(empty)");
  const widths = columns.map((c) =>
    Math.max(c.label.length, ...rows.map((r) => String(c.value(r) ?? "").length)),
  );
  const header = columns.map((c, i) => color("bold", c.label.padEnd(widths[i]))).join("  ");
  const sep = widths.map((w) => "─".repeat(w)).join("  ");
  const body = rows
    .map((r) => columns.map((c, i) => String(c.value(r) ?? "").padEnd(widths[i])).join("  "))
    .join("\n");
  return `${header}\n${color("dim", sep)}\n${body}`;
}

export function shortenText(text, max = 60) {
  if (typeof text !== "string") return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
