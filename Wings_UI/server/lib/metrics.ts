// Lightweight in-process metrics. Not a Prometheus implementation — just
// enough for /metrics to expose request counts, durations, and LLM spend
// without pulling in a heavy dependency.

interface Counter {
  count: number;
  errors: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

const requestsByPath = new Map<string, Counter>();
const llmStats = {
  calls: 0,
  errors: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalCostUsd: 0,
};

const startTime = Date.now();

export function recordRequest(path: string, status: number, durationMs: number): void {
  // Bucket by route prefix to keep the cardinality bounded.
  const key = bucketPath(path);
  let c = requestsByPath.get(key);
  if (!c) {
    c = { count: 0, errors: 0, totalDurationMs: 0, maxDurationMs: 0 };
    requestsByPath.set(key, c);
  }
  c.count++;
  if (status >= 400) c.errors++;
  c.totalDurationMs += durationMs;
  if (durationMs > c.maxDurationMs) c.maxDurationMs = durationMs;
}

export function recordLlmCall(usage: {
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  failed?: boolean;
}): void {
  llmStats.calls++;
  if (usage.failed) llmStats.errors++;
  llmStats.promptTokens += usage.promptTokens || 0;
  llmStats.completionTokens += usage.completionTokens || 0;
  llmStats.totalCostUsd += usage.costUsd || 0;
}

function bucketPath(path: string): string {
  // Strip dynamic segments so /api/scheduled-tasks/sch_123 → /api/scheduled-tasks/:id
  return path
    .replace(/\/(sch|wh|whe|run|audit|mem|vmem|chat|task)_[a-z0-9_]+/gi, "/:id")
    .replace(/\/\d+/g, "/:n");
}

export interface MetricsSnapshot {
  uptimeSeconds: number;
  routes: Array<{
    path: string;
    count: number;
    errors: number;
    avgDurationMs: number;
    maxDurationMs: number;
  }>;
  llm: typeof llmStats;
  process: {
    rssMb: number;
    heapUsedMb: number;
    nodeVersion: string;
  };
}

export function snapshot(): MetricsSnapshot {
  const mem = process.memoryUsage();
  return {
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    routes: [...requestsByPath.entries()]
      .map(([path, c]) => ({
        path,
        count: c.count,
        errors: c.errors,
        avgDurationMs: c.count ? Math.round(c.totalDurationMs / c.count) : 0,
        maxDurationMs: Math.round(c.maxDurationMs),
      }))
      .sort((a, b) => b.count - a.count),
    llm: { ...llmStats },
    process: {
      rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      nodeVersion: process.version,
    },
  };
}

export function toPrometheus(): string {
  const s = snapshot();
  const lines: string[] = [];
  lines.push("# HELP wings_uptime_seconds Server uptime in seconds");
  lines.push("# TYPE wings_uptime_seconds counter");
  lines.push(`wings_uptime_seconds ${s.uptimeSeconds}`);
  lines.push("# HELP wings_http_requests_total Request count by route");
  lines.push("# TYPE wings_http_requests_total counter");
  for (const r of s.routes) {
    const path = r.path.replace(/"/g, '\\"');
    lines.push(`wings_http_requests_total{path="${path}"} ${r.count}`);
    lines.push(`wings_http_errors_total{path="${path}"} ${r.errors}`);
    lines.push(`wings_http_avg_duration_ms{path="${path}"} ${r.avgDurationMs}`);
  }
  lines.push("# HELP wings_llm_calls_total Total LLM API calls");
  lines.push(`wings_llm_calls_total ${s.llm.calls}`);
  lines.push(`wings_llm_errors_total ${s.llm.errors}`);
  lines.push(`wings_llm_prompt_tokens_total ${s.llm.promptTokens}`);
  lines.push(`wings_llm_completion_tokens_total ${s.llm.completionTokens}`);
  lines.push(`wings_llm_cost_usd_total ${s.llm.totalCostUsd.toFixed(6)}`);
  lines.push(`wings_process_rss_mb ${s.process.rssMb}`);
  lines.push(`wings_process_heap_mb ${s.process.heapUsedMb}`);
  return lines.join("\n") + "\n";
}

export function resetMetricsForTest(): void {
  requestsByPath.clear();
  llmStats.calls = 0;
  llmStats.errors = 0;
  llmStats.promptTokens = 0;
  llmStats.completionTokens = 0;
  llmStats.totalCostUsd = 0;
}
