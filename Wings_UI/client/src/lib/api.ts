export interface PublicSettings {
  provider: "openai" | "azure" | "custom" | "codex_local" | "anthropic";
  baseURL: string;
  model: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  apiKeyRequired: boolean;
  fallback: {
    enabled: boolean;
    provider: "openai" | "azure" | "custom" | "codex_local" | "anthropic";
    baseURL: string;
    model: string;
    apiKeyMasked: string;
    hasApiKey: boolean;
    apiKeyRequired: boolean;
    configured: boolean;
    apiMode: string;
  };
  updatedAt: string;
  dataDir: string;
  pricingOverrides: Record<string, number>;
  hasBraveApiKey: boolean;
  hasTavilyApiKey: boolean;
  authEnabled: boolean;
}

export interface AuthStatus {
  enabled: boolean;
  authenticated: boolean;
  canBootstrap: boolean;
  sessionExpiresAt: string | null;
}

export interface OpenRouterModelCatalogEntry {
  id: string;
  name: string;
  provider: string;
  modality?: string;
  input: Array<"text" | "image" | "video">;
  output: Array<"text" | "image" | "video">;
  capabilities: Array<
    "text" | "vision" | "video_understanding" | "image_generation" | "video_generation"
  >;
  reasoning: boolean;
  contextWindow?: number;
  maxTokens?: number;
}

export interface ProviderMeta {
  provider: string;
  model: string;
  apiMode: string;
  usedFallback: boolean;
  baseURL: string;
}

const AUTH_TOKEN_STORAGE_KEY = "wings-of-world.auth.token";
const LEGACY_AUTH_TOKEN_STORAGE_KEY = "wings.auth.token";

export function getStoredAuthToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || window.localStorage.getItem(LEGACY_AUTH_TOKEN_STORAGE_KEY) || "";
}

export function setStoredAuthToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_STORAGE_KEY);
}

export function clearStoredAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_STORAGE_KEY);
}

function notifyAuthInvalidated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("wings-of-world:auth-invalidated"));
  window.dispatchEvent(new CustomEvent("wings:auth-invalidated"));
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  content: string;
  memoryContext?: MemoryEntry[];
  sessionId: string;
  appliedSkills?: SkillDefinition[];
  appliedResources?: ResourceContent[];
  tokenUsage?: TokenUsage;
  sessionTokenUsage?: TokenUsage;
  runCostEstimateUsd?: number;
  sessionCostEstimateUsd?: number;
  providerMeta?: ProviderMeta;
}

export interface ChatAgentResponse {
  content: string;
  trace?: unknown[];
  tokenUsage?: TokenUsage;
  providerMeta?: ProviderMeta;
}

export interface ChatCascadeResponse {
  traceId?: string;
  content: string;
  cascade?: {
    fallback: boolean;
    record: unknown;
  };
  finalTarget?: {
    provider: string;
    model: string;
    baseURL: string;
  };
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostEstimate {
  usd: number;
}

export interface SettingsDraft {
  provider?: string;
  apiKey?: string;
  baseURL?: string;
  model?: string;
  clearApiKey?: boolean;
  fallbackEnabled?: boolean;
  fallbackProvider?: string;
  fallbackApiKey?: string;
  fallbackBaseURL?: string;
  fallbackModel?: string;
  clearFallbackApiKey?: boolean;
  braveApiKey?: string;
  tavilyApiKey?: string;
  pricingOverrides?: Record<string, number>;
}

export interface ProviderHealth {
  primary: {
    provider: "openai" | "azure" | "custom" | "codex_local" | "anthropic";
    baseURL: string;
    model: string;
    apiKeyMasked: string;
    hasApiKey: boolean;
    apiKeyRequired: boolean;
    configured: boolean;
    apiMode: string;
  };
  fallback: {
    enabled: boolean;
    provider: "openai" | "azure" | "custom" | "codex_local" | "anthropic";
    baseURL: string;
    model: string;
    apiKeyMasked: string;
    hasApiKey: boolean;
    apiKeyRequired: boolean;
    configured: boolean;
    apiMode: string;
  };
  warnings: string[];
  lastIssue: null | {
    at: string;
    ageMinutes?: number | null;
    summary: string;
    category: string;
  };
  lastIssueHistory?: null | {
    at: string;
    ageMinutes?: number | null;
    summary: string;
    category: string;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  requiresConfirmation?: boolean;
  parameters: Record<string, unknown>;
}

export interface GeneratedImageRecord {
  id: string;
  prompt: string;
  model: string;
  size: string;
  quality: string;
  mimeType: string;
  filename: string;
  url: string;
  bytes: number;
  createdAt: string;
  revisedPrompt?: string;
}

export interface ImageGenerationDraft {
  prompt: string;
  model?: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  quality?: "auto" | "low" | "medium" | "high";
}

export interface SkillDefinition {
  id: string;
  title: string;
  summary: string;
  whenToUse: string;
  telegramEnabled?: boolean;
}

export interface PromptTemplateDefinition {
  id: string;
  title: string;
  description: string;
  suggestedSkills?: string[];
  telegramEnabled?: boolean;
}

export interface RenderedPromptTemplate extends PromptTemplateDefinition {
  rendered: string;
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

export interface CommandPlan {
  title: string;
  objective: string;
  route: "chat" | "workflow" | "tool" | "human";
  priority: "low" | "medium" | "high" | "critical";
  riskLevel: "low" | "medium" | "high";
  owner?: string;
  checklist: string[];
  acceptanceCriteria: string[];
  suggestedNextStep: string;
  automation?: {
    kind: "tool" | "workflow" | "chat";
    label: string;
    href?: string;
  };
  detailsMarkdown: string;
}

export interface HumanTask {
  id: string;
  title: string;
  details?: string;
  status: "pending" | "in_progress" | "done" | "blocked";
  priority: "low" | "medium" | "high" | "critical";
  source: string;
  owner?: string;
  command?: CommandPlan;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type ScheduledTaskKind = "chat" | "webhook" | "macro" | "command" | "agent";
export type ScheduledTaskScheduleMode = "interval" | "cron";

export interface ScheduledTaskRunRecord {
  at: string;
  status: "success" | "error";
  summary: string;
  durationMs?: number;
}

export interface ScheduledTask {
  id: string;
  name: string;
  kind: ScheduledTaskKind;
  scheduleMode?: ScheduledTaskScheduleMode;
  intervalMs: number;
  cronExpression?: string;
  timezone?: string;
  prompt?: string;
  model?: string;
  owner?: string;
  webhookUrl?: string;
  webhookPayload?: unknown;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  lastStatus?: "success" | "error";
  lastSummary?: string;
  lastDurationMs?: number;
  nextRunAt?: string;
  runCount?: number;
  failureCount?: number;
  consecutiveFailures?: number;
  recentRuns?: ScheduledTaskRunRecord[];
}

export interface SchedulePreset {
  id: string;
  label: string;
  scheduleMode: ScheduledTaskScheduleMode;
  intervalMs?: number;
  cronExpression?: string;
}

export interface ScheduledTaskTemplate {
  id: string;
  label: string;
  description: string;
  task: ScheduledTaskDraft;
}

export interface ScheduledTaskDraft {
  name: string;
  kind: ScheduledTaskKind;
  scheduleMode?: ScheduledTaskScheduleMode;
  intervalMs?: number;
  cronExpression?: string;
  timezone?: string;
  prompt?: string;
  model?: string;
  owner?: string;
  webhookUrl?: string;
  webhookPayload?: unknown;
  enabled?: boolean;
}

export interface MemoryEntry {
  id: string;
  content: string;
  memoryType: "fact" | "preference" | "context" | "summary" | "insight";
  source: string;
  importanceScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  area: "chat" | "workflow" | "tool" | "memory" | "settings" | "system" | "scheduled-task";
  action: string;
  status: "success" | "error";
  summary: string;
  timestamp: string;
  targetId?: string;
}

export interface ReadinessCheck {
  id: string;
  label: string;
  status: "ready" | "warning" | "error";
  detail: string;
  action?: string;
}

export interface SystemReadiness {
  overall: "ready" | "partial" | "blocked";
  summary: {
    ready: number;
    warning: number;
    error: number;
  };
  checks: ReadinessCheck[];
  timestamp: string;
}

export interface BackendGatewayStatus {
  ok: boolean;
  running: boolean;
  healthy: boolean;
  ready: boolean;
  canStart: boolean;
  gatewayUrl: string;
  port: number;
  stateDir: string;
  logs: {
    stdout: string;
    stderr: string;
  };
  cli: {
    command: string;
    baseArgs: string[];
    cwd: string;
    source: "env" | "local" | "global";
    startCommand: string;
  };
  local: {
    backendRoot: string;
    packageJsonExists: boolean;
    scriptsDirExists: boolean;
    nodeModulesExists: boolean;
    localEntryExists: boolean;
    sourceEntryExists: boolean;
    distEntry: string | null;
    distEntryExists: boolean;
  };
  probes: {
    healthz: { ok: boolean; status?: number; bodyPreview?: string; error?: string };
    readyz: { ok: boolean; status?: number; bodyPreview?: string; error?: string };
  };
  timestamp: string;
  recommendedAction: string | null;
}

export interface SystemExportBundle {
  version: 1;
  exportedAt: string;
  data: {
    settings: PublicSettings;
    workflows: unknown[];
    memory: MemoryEntry[];
    chatSessions: Array<{
      id: string;
      title: string;
      updatedAt: string;
      messages: ChatMessage[];
      tokenUsage?: TokenUsage;
      costEstimateUsd?: number;
    }>;
    audit: AuditEntry[];
    executionHistory: ExecutionRecord[];
    executionArtifacts: ExecutionArtifact[];
    telegramState: {
      offset: number;
      chats: Array<{
        chatId: string;
        sessionId: string;
        username?: string;
        title?: string;
        lastMessageAt: string;
      }>;
      lastPollAt?: string;
      lastError?: string;
    };
    humanTasks: HumanTask[];
  };
}

export interface ExecutionRecord {
  id: string;
  kind: "chat" | "workflow" | "tool";
  status: "success" | "error";
  title: string;
  summary: string;
  inputPreview: string;
  outputPreview?: string;
  sessionId?: string;
  workflowId?: string;
  toolName?: string;
  model?: string;
  memoryCount: number;
  tokenUsage?: TokenUsage;
  costEstimateUsd?: number;
  durationMs?: number;
  createdAt: string;
}

export interface ExecutionArtifact {
  executionId: string;
  kind: "chat" | "workflow" | "tool";
  status: "success" | "error";
  createdAt: string;
  input?: unknown;
  output?: unknown;
  memoryContext?: MemoryEntry[];
  trace?: string[];
  workflowSnapshot?: unknown;
  sessionSnapshot?: ChatMessage[];
  toolArgs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface AnalyticsDailyEntry {
  day: string;
  sessions: number;
  input_tokens: number;
  output_tokens: number;
}

export interface AnalyticsModelEntry {
  model: string;
  sessions: number;
  input_tokens: number;
  output_tokens: number;
}

export interface AnalyticsResponse {
  days: number;
  totals: {
    total_input: number;
    total_output: number;
    total_sessions: number;
    total_api_calls: number;
    success_count: number;
    error_count: number;
    total_cost_usd: number;
    avg_duration_ms: number;
  };
  by_kind: Array<{ kind: string; count: number }>;
  daily: AnalyticsDailyEntry[];
  by_model: AnalyticsModelEntry[];
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const authToken = getStoredAuthToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    if (res.status === 401) {
      clearStoredAuthToken();
      notifyAuthInvalidated();
    }
    throw new Error(
      typeof data?.error === "string" && data.error.trim()
        ? data.error
        : `${res.status} ${res.statusText}`.trim(),
    );
  }
  return data as T;
}

async function reqBlob(url: string): Promise<Blob> {
  const authToken = getStoredAuthToken();
  const res = await fetch(url, {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      clearStoredAuthToken();
      notifyAuthInvalidated();
    }
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`.trim());
  }
  return await res.blob();
}

export interface OptimizationSummary {
  windowDays: number;
  generatedAt: string;
  spend: {
    totalUsd: number;
    totalTokens: number;
    totalCalls: number;
    byModel: Array<{ bucket: string; totalUsd: number; totalTokens: number; calls: number }>;
    byKind: Array<{ bucket: string; totalUsd: number; totalTokens: number; calls: number }>;
    byDay: Array<{ bucket: string; totalUsd: number; totalTokens: number; calls: number }>;
    topModelToday: { model: string; usd: number } | null;
  };
  forecast: { dailyAvgUsd: number; projectedMonthlyUsd: number; daysOfDataUsed: number };
  cascade: {
    mode: "off" | "balanced" | "aggressive";
    tiers: Record<string, { provider: string; model: string; baseURL?: string } | undefined>;
    callsByTier: { small: number; medium: number; large: number };
    spendByTier: { small: number; medium: number; large: number };
    estimatedSavingsUsd: number;
    sharePct: { small: number; medium: number; large: number };
  };
  compression: { level: "off" | "light" | "aggressive"; minChars: number };
  toolCache: {
    totalEntries: number;
    totalHits: number;
    totalBytesSaved: number;
    hitRate: number;
    byTool: Array<{ tool: string; entries: number; hits: number; bytesSaved: number; avgResultBytes: number }>;
  };
  consolidation: {
    runs: Array<{
      id: string;
      createdAt: string;
      dryRun: boolean;
      totalBefore: number;
      totalAfter: number;
      clustersMerged: number;
      entriesDropped: number;
    }>;
    cumulativeMemoriesReduced: number;
  };
  health: { uptimeSeconds: number; rssMb: number; heapUsedMb: number; nodeVersion: string };
  totals: { estimatedSavingsUsd: number; headlineLabel: string };
}

export const api = {
  getSettings: () => req<PublicSettings>("/api/settings"),
  getOptimizationSummary: (days = 7) =>
    req<OptimizationSummary>(`/api/optimization/summary?days=${days}`),
  getAuthStatus: () => req<AuthStatus>("/api/auth/status"),
  bootstrapAuth: (password: string) =>
    req<{ ok: true; token: string; status: AuthStatus }>("/api/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  login: (password: string) =>
    req<{ ok: true; token: string; status: AuthStatus }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () =>
    req<{ ok: true }>("/api/auth/logout", {
      method: "POST",
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<{ ok: true; token: string; status: AuthStatus }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  saveSettings: (body: SettingsDraft) =>
    req<PublicSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  testSettings: (body?: SettingsDraft) =>
    req<{
      ok: boolean;
      reply?: string;
      error?: string;
      status?: number;
      errorClass?: "rate_limit" | "auth" | "server" | "client" | "network" | "unknown";
      retryAfterSeconds?: number;
      upstreamProvider?: string;
      hint?: string;
      providerMeta?: { provider: string; model: string; apiMode: string; usedFallback: boolean; baseURL: string };
    }>(
      "/api/settings/test",
      { method: "POST", body: JSON.stringify(body ?? {}) },
    ),
  getOpenRouterModels: () =>
    req<{ models: OpenRouterModelCatalogEntry[] }>("/api/models/openrouter"),
  getCascadeConfig: () =>
    req<{
      mode: string;
      tiers: Record<string, { model?: string; provider?: string; baseURL?: string }>;
      escalationThreshold: number;
    }>("/api/cascade/config"),
  chat: (messages: ChatMessage[], model?: string) =>
    req<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages, model }),
    }),
  chatWithSession: (
    messages: ChatMessage[],
    sessionId?: string,
    model?: string,
    skillIds?: string[],
    resourceUris?: string[],
  ) =>
    req<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages, model, sessionId, skillIds, resourceUris }),
    }),
  chatAgent: (messages: ChatMessage[], model?: string) =>
    req<ChatAgentResponse>("/api/chat/agent", {
      method: "POST",
      body: JSON.stringify({ messages, model }),
    }),
  chatCascade: (
    messages: ChatMessage[],
    options?: { mode?: string; tiers?: unknown; escalationThreshold?: number; model?: string },
  ) =>
    req<ChatCascadeResponse>("/api/chat/cascade", {
      method: "POST",
      body: JSON.stringify({
        messages,
        mode: options?.mode,
        tiers: options?.tiers,
        escalationThreshold: options?.escalationThreshold,
        model: options?.model,
      }),
    }),
  listSkills: () =>
    req<{ skills: SkillDefinition[] }>("/api/skills"),
  listPrompts: () =>
    req<{ prompts: PromptTemplateDefinition[] }>("/api/prompts"),
  renderPrompt: (id: string, topic?: string) =>
    req<{ prompt: RenderedPromptTemplate }>("/api/prompts/render", {
      method: "POST",
      body: JSON.stringify({ id, topic }),
    }),
  listResources: () =>
    req<{ resources: ResourceDefinition[] }>("/api/resources"),
  readResource: (uri: string) =>
    req<{ resource: ResourceContent }>(`/api/resources/read?uri=${encodeURIComponent(uri)}`),
  listChatSessions: () =>
    req<{
      sessions: Array<{ id: string; title: string; updatedAt: string; messageCount: number; tokenUsage?: TokenUsage; costEstimateUsd?: number }>;
    }>("/api/chat/sessions"),
  getChatSession: (id: string) =>
    req<{ session: { id: string; title: string; updatedAt: string; messages: ChatMessage[]; tokenUsage?: TokenUsage; costEstimateUsd?: number } }>(
      `/api/chat/sessions/${encodeURIComponent(id)}`,
    ),
  renameChatSession: (id: string, title: string) =>
    req<{ ok: true }>(`/api/chat/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  deleteChatSession: (id: string) =>
    req<{ ok: true }>(`/api/chat/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  executeWorkflow: (
    workflow: unknown,
    input: string,
    options?: { workflowId?: string; workflowName?: string },
  ) =>
    req<{
      outputs: Record<string, string>;
      trace: string[];
      memoryContext?: MemoryEntry[];
      tokenUsage?: TokenUsage;
      costEstimateUsd?: number;
      nodeUsage?: Array<{
        nodeId: string;
        label: string;
        provider: string;
        model: string;
        usage: TokenUsage;
      }>;
    }>(
      "/api/workflow/execute",
      {
        method: "POST",
        body: JSON.stringify({
          workflow,
          input,
          workflowId: options?.workflowId,
          workflowName: options?.workflowName,
        }),
      },
    ),
  listWorkflows: () => req<any[]>("/api/workflows"),
  saveWorkflows: (list: unknown[]) =>
    req<{ ok: true }>("/api/workflows", {
      method: "PUT",
      body: JSON.stringify(list),
    }),
  getTools: () =>
    req<{ tools: ToolDefinition[]; workspaceRoots: string[] }>("/api/tools"),
  executeTool: (name: string, args: Record<string, unknown>, confirm = false) =>
    req<{ ok: boolean; tool: string; result: unknown }>("/api/tools/execute", {
      method: "POST",
      body: JSON.stringify({ name, args, confirm }),
    }),
  listGeneratedImages: () =>
    req<{ images: GeneratedImageRecord[] }>("/api/images"),
  generateImage: (body: ImageGenerationDraft) =>
    req<{ ok: true; image: GeneratedImageRecord }>("/api/images/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  fetchGeneratedImage: (filename: string) =>
    reqBlob(`/api/images/file/${encodeURIComponent(filename)}`),
  getAgents: () =>
    req<{ agents: Array<{ role: string; title: string; status: string; summary: string }> }>("/api/agents"),
  getSystemHealth: () =>
    req<{
      ok: boolean;
      uptimeSeconds: number;
      node: string;
      platform: string;
      providerConfigured: boolean;
      appAuth?: {
        enabled: boolean;
        activeSessions: number;
      };
      provider: ProviderHealth;
      telegram?: {
        enabled: boolean;
        linkedChats: number;
        lastPollAt: string | null;
        lastError: string | null;
        recommendedAction?: string | null;
        localPollerLock?: {
          pid: number;
          instanceId: string;
          heartbeatAt: string;
          ownedByCurrentProcess: boolean;
        } | null;
      };
      timestamp: string;
    }>("/api/system/health"),
  getSystemResources: () =>
    req<{
      cpu: { cores: number; model: string };
      memory: { totalGb: number; usedGb: number; freeGb: number; percent: number };
      platform: { release: string; arch: string; hostname: string };
      dataDir: string;
      obsidian?: {
        enabled: boolean;
        vaultPath: string;
        memoryDir: string;
      };
      workspaceRoots: string[];
      timestamp: string;
    }>("/api/system/resources"),
  getSystemReadiness: () => req<SystemReadiness>("/api/system/readiness"),
  getBackendStatus: () => req<BackendGatewayStatus>("/api/backend/status"),
  startBackendGateway: () =>
    req<{
      ok: boolean;
      alreadyRunning?: boolean;
      pid?: number;
      status: BackendGatewayStatus;
      error?: string;
    }>("/api/backend/start", { method: "POST" }),
  exportSystemData: () => req<SystemExportBundle>("/api/system/export"),
  importSystemData: (bundle: unknown, mode: "replace" | "merge") =>
    req<{
      ok: boolean;
      mode: "replace" | "merge";
      imported: {
        workflows: number;
        memory: number;
        chatSessions: number;
        audit: number;
        executionHistory: number;
        executionArtifacts: number;
        telegramChats: number;
        humanTasks: number;
      };
    }>("/api/system/import", {
      method: "POST",
      body: JSON.stringify({ bundle, mode }),
    }),
  listExecutions: (params?: { kind?: "chat" | "workflow" | "tool"; targetId?: string; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.kind) search.set("kind", params.kind);
    if (params?.targetId) search.set("targetId", params.targetId);
    if (typeof params?.limit === "number") search.set("limit", String(params.limit));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return req<{ entries: ExecutionRecord[] }>(`/api/executions${suffix}`);
  },
  getExecutionArtifact: (id: string) =>
    req<{ artifact: ExecutionArtifact }>(`/api/executions/${encodeURIComponent(id)}/artifact`),
  getMemoryStats: () =>
    req<{
      totalMemories: number;
      workflowSnapshots: number;
      avgImportance: number;
      byType: Record<string, number>;
    }>("/api/memory/stats"),
  listMemories: (q?: string) =>
    req<{ memories: MemoryEntry[] }>(`/api/memory${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getMemoryContext: (q: string) =>
    req<{ memories: MemoryEntry[] }>(`/api/memory/context?q=${encodeURIComponent(q)}`),
  addMemory: (body: {
    content: string;
    memoryType?: MemoryEntry["memoryType"];
    source?: string;
    importanceScore?: number;
  }) =>
    req<{ ok: boolean; memory: MemoryEntry }>("/api/memory", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateMemory: (
    id: string,
    body: {
      content: string;
      memoryType?: MemoryEntry["memoryType"];
      source?: string;
      importanceScore?: number;
    },
  ) =>
    req<{ ok: boolean; memory: MemoryEntry }>(`/api/memory/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteMemory: (id: string) =>
    req<{ ok: true }>(`/api/memory/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  getAnalytics: (days = 30) =>
    req<AnalyticsResponse>(`/api/analytics?days=${encodeURIComponent(String(days))}`),
  listAudit: (limit = 30) =>
    req<{ entries: AuditEntry[] }>(`/api/audit?limit=${encodeURIComponent(String(limit))}`),
  planCommand: (body: { command: string; owner?: string; source?: string }) =>
    req<{ plan: CommandPlan }>("/api/commands/plan", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  dispatchCommand: (body: { command: string; owner?: string; source?: string }) =>
    req<{ ok: boolean; task: HumanTask; plan: CommandPlan }>("/api/commands/dispatch", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listScheduledTasks: () =>
    req<{ tasks: ScheduledTask[]; presets: SchedulePreset[]; templates: ScheduledTaskTemplate[] }>("/api/scheduled-tasks"),
  previewScheduledTask: (body: ScheduledTaskDraft) =>
    req<{ task: ScheduledTask; nextRuns: string[] }>("/api/scheduled-tasks/preview", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  addScheduledTask: (body: ScheduledTaskDraft) =>
    req<{ task: ScheduledTask }>("/api/scheduled-tasks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateScheduledTask: (id: string, body: Partial<ScheduledTaskDraft>) =>
    req<{ task: ScheduledTask; nextRuns?: string[] }>(`/api/scheduled-tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteScheduledTask: (id: string) =>
    req<{ ok: true }>(`/api/scheduled-tasks/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  runScheduledTask: (id: string) =>
    req<{ task: ScheduledTask; outcome: { ok: boolean; summary: string; durationMs?: number } }>(
      `/api/scheduled-tasks/${encodeURIComponent(id)}/run`,
      { method: "POST" },
    ),
  registerBackendScheduledTask: (id: string) =>
    req<{ ok: true; command: string; stdout: string; stderr?: string }>(
      `/api/scheduled-tasks/${encodeURIComponent(id)}/register-backend`,
      { method: "POST" },
    ),
  listHumanTasks: () =>
    req<{ tasks: HumanTask[] }>("/api/human-tasks"),
  addHumanTask: (body: {
    title: string;
    details?: string;
    status?: HumanTask["status"];
    priority?: HumanTask["priority"];
    source?: string;
    owner?: string;
    command?: CommandPlan;
  }) =>
    req<{ ok: boolean; task: HumanTask }>("/api/human-tasks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateHumanTask: (
    id: string,
    body: Partial<Pick<HumanTask, "title" | "details" | "status" | "priority" | "source" | "owner" | "command">>,
  ) =>
    req<{ ok: boolean; task: HumanTask }>(`/api/human-tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteHumanTask: (id: string) =>
    req<{ ok: true }>(`/api/human-tasks/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
