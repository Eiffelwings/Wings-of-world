import express, { type Request, type Response } from "express";
import fs from "fs";
import { createServer } from "http";
import os from "os";
import path from "path";
import util from "util";
import crypto, { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getStarterWorkflowRecords } from "../shared/workflow-templates.js";
import { writeJsonSync, writeJsonQueued, readJsonSafe } from "./lib/storage.js";
import {
  adaptiveMaxTokens as budgetAdaptiveMaxTokens,
  capMessageSizes as budgetCapMessageSizes,
  estimateMessagesTokens as budgetEstimateMessagesTokens,
  smartTruncateToolResult as budgetSmartTruncateToolResult,
  truncateMemoryContent as budgetTruncateMemoryContent,
  CHARS_PER_TOKEN as BUDGET_CHARS_PER_TOKEN,
  MESSAGE_CHAR_CAP as BUDGET_MESSAGE_CHAR_CAP,
  TOOL_RESULT_CHAR_CAP as BUDGET_TOOL_RESULT_CHAR_CAP,
  MEMORY_ITEM_CHAR_CAP as BUDGET_MEMORY_ITEM_CHAR_CAP,
} from "./lib/token-budget.js";
import {
  cosineSimilarity as vecCosineSimilarity,
  hashEmbedding as vecHashEmbedding,
  embedText as vecEmbedText,
  loadVectorMemory as vecLoadVectorMemory,
  saveVectorMemory as vecSaveVectorMemory,
  makeVectorMemoryId as vecMakeVectorMemoryId,
  searchVectorMemory as vecSearchVectorMemory,
  type VectorMemoryEntry as SharedVectorMemoryEntry,
} from "./features/vector-memory.js";
import {
  type ScheduledTask as SharedScheduledTask,
  type ScheduledTaskKind as SharedScheduledTaskKind,
  loadScheduledTasks as schLoadScheduledTasks,
  saveScheduledTasks as schSaveScheduledTasks,
  makeScheduledTaskId as schMakeScheduledTaskId,
  runScheduledTask as schRunScheduledTask,
  recordScheduledTaskOutcome as schRecordOutcome,
  startScheduledTaskRunner as schStartRunner,
  validateScheduledTaskInput as schValidateInput,
  previewScheduledTask as schPreviewTask,
  SCHEDULE_PRESETS as SCH_PRESETS,
  SCHEDULE_TEMPLATES as SCH_TEMPLATES,
} from "./features/scheduled-tasks.js";
import {
  buildBackendCronAgentArgs,
  formatBackendCronCommand,
  redactBackendCronAgentArgs,
} from "./features/backend-cron.js";
import { createBackendBridge, type BackendBridgeStatus } from "./features/backend-bridge.js";
import {
  type WebhookConfig as SharedWebhookConfig,
  type WebhookEvent as SharedWebhookEvent,
  loadWebhooks as whLoadWebhooks,
  saveWebhooks as whSaveWebhooks,
  loadWebhookEvents as whLoadWebhookEvents,
  saveWebhookEvents as whSaveWebhookEvents,
  makeWebhookId as whMakeWebhookId,
  makeWebhookEventId as whMakeWebhookEventId,
  makeWebhookSecret as whMakeWebhookSecret,
  maskSecret as whMaskSecret,
  verifyWebhookSignature as whVerifySignature,
  parseWebhookBody as whParseBody,
} from "./features/webhooks.js";
import { buildCommandPlan, type CommandPlan } from "./features/command-center.js";
import { handleMcpRequest as mcpHandle } from "./features/mcp.js";
import { ensureTracingSchema, Tracer } from "./lib/tracing.js";
import {
  ensureCacheSchema,
  lookupExact as cacheLookupExact,
  lookupSemantic as cacheLookupSemantic,
  storeEntry as cacheStoreEntry,
  recordHit as cacheRecordHit,
  listCacheEntries,
  getCacheStats,
  pruneCache,
  clearCache,
} from "./features/semantic-cache.js";
import {
  ensureTokensSchema,
  createToken as createApiToken,
  listTokens as listApiTokens,
  revokeToken as revokeApiToken,
  deleteToken as deleteApiToken,
  makeTokenAuthMiddleware,
  ALL_SCOPES,
  type Scope,
} from "./features/api-tokens.js";
import {
  ensureDatasetSchema,
  createDataset,
  listDatasets,
  deleteDataset as deleteEvalDataset,
  addDatasetItem,
  listDatasetItems,
  deleteDatasetItem,
  listRuns as listReplayRuns,
  getRun as getReplayRun,
  getRunResults as getReplayResults,
  passRate as runPassRate,
} from "./features/eval-datasets.js";
import { runReplay } from "./features/replay-engine.js";
import {
  ensureAdversarialSchema,
  listProbes,
  runAdversarialSuite,
  persistReport as persistAdversarialReport,
  listReports as listAdversarialReports,
  type AttackCategory,
} from "./features/adversarial.js";
import {
  ensureExperimentSchema,
  createExperiment,
  listExperiments,
  getExperiment,
  setExperimentStatus,
  deleteExperiment,
  pickArm,
  recordObservation as recordExperimentObservation,
  getExperimentStats,
} from "./features/experiments.js";
import { buildOverview as costOverview, forecastSpend as costForecast } from "./features/cost-attribution.js";
import {
  DEFAULT_TELEGRAM_MODEL_PRESETS,
  TELEGRAM_MODEL_BUTTONS_PER_PAGE,
  buildTelegramModelKeyboard as buildModelKeyboard,
  parseModelCallback,
  filterPresetsByCategory,
  findPresetCategory,
  type ModelCategory,
  type TelegramInlineButton as SharedInlineButton,
  type TelegramInlineKeyboardMarkup as SharedInlineKeyboardMarkup,
  type TelegramModelPreset as SharedTelegramModelPreset,
} from "./features/telegram-models.js";
import { initDb, getDb, closeDb } from "./lib/db.js";
import {
  appendAuditEntry as dbAppendAuditEntry,
  listAuditEntries as dbListAuditEntries,
  migrateAuditFromJson,
  type AuditEntry as SharedAuditEntry,
} from "./features/audit-log.js";
import {
  appendExecutionRecord as dbAppendExecutionRecord,
  listExecutionRecords as dbListExecutionRecords,
  migrateExecutionFromJson,
  makeExecutionId as dbMakeExecutionId,
  type ExecutionRecord as SharedExecutionRecord,
} from "./features/execution-history.js";
import { logger, requestLogger, errorLogger } from "./lib/logger.js";
import { apiLimiter, chatLimiter, webhookIngestLimiter } from "./lib/rate-limit.js";
import { ensureSpendSchema, recordSpend, getSpendStatus, pruneSpendLog } from "./lib/spend-cap.js";
import { recordRequest, recordLlmCall, snapshot as metricsSnapshot, toPrometheus } from "./lib/metrics.js";
import {
  parseUpstreamErrorBody,
  formatFriendlyError,
  withUpstreamRetry,
  backoffMs as upstreamBackoffMs,
  shouldRetry as upstreamShouldRetry,
} from "./lib/upstream-errors.js";
import { runUserCode, evalToolArgs } from "./lib/code-sandbox.js";
import {
  pickBranchEdges,
  evaluateBranchOutcome,
  evaluateLoopItems,
  runLoopBody,
} from "./lib/workflow-flow.js";
import {
  describeHermesPaths,
  ensureHermesDb,
  pushToHermes,
  pullFromHermes,
  mergeIntoWings,
  bidirectionalSync,
  type WingsMemoryEntry as HermesWingsMemoryEntry,
} from "./features/hermes-sync.js";
import {
  runCascade,
  defaultTiersFor,
  type CascadeRecord,
} from "./features/cascade-runtime.js";
import {
  type CascadeMode,
  type TierConfig as CascadeTierConfig,
  type ModelTarget as CascadeModelTarget,
} from "./lib/model-cascade.js";
import {
  compressText,
  compressMessages,
  type CompressionLevel,
} from "./lib/prompt-compress.js";
import {
  ensureToolCacheSchema,
  executeToolCached,
  getToolCacheStats,
  listToolCacheEntries,
  pruneToolCache,
  clearToolCache,
  DEFAULT_TOOL_CACHE_POLICIES,
} from "./features/tool-cache.js";
import {
  ensureConsolidationSchema,
  consolidateMemories,
  persistConsolidationRun,
  listConsolidationRuns,
  getConsolidationRun,
  buildMergePrompt,
  type ConsolidatableEntry,
  type ConsolidationOptions,
} from "./features/memory-consolidation.js";
import {
  buildOptimizationSummary,
} from "./features/optimization-summary.js";
import { fetchWebContent } from "./features/web-fetch.js";
import { downloadGeneratedImageUrl, rejectRequestImageBaseUrl } from "./features/image-security.js";
import {
  applyToolSecurityPolicy,
  canUseToolAgentically,
  toolRequiresConfirmation,
} from "./features/tool-security.js";
import { evaluateRemoteAccess, isPublicBindHost, shouldProtectRemotePath } from "./features/remote-access.js";
import { extractDocument } from "./features/document-extract.js";
import { tavilySearch, tavilyExtract } from "./features/tavily-search.js";
import {
  listEvals as listGuardrailEvals,
  getEvalDefinition as getGuardrailEval,
  runEval as runGuardrailEval,
  runEvals as runGuardrailEvals,
  makeJudge as makeGuardrailJudge,
  type EvalVerdict,
} from "./features/guardrails/engine.js";
import {
  POLICY_PRESETS,
  runPreChecks,
  runPostChecks,
  summarizeReport,
  type GuardrailPolicy,
  type GuardrailReport,
} from "./features/guardrails/runtime.js";
import { formatCodexCliError, spawnCodexCli } from "./features/codex-local.js";
import { execFile as execFileCallback, spawn } from "child_process";
import { fileURLToPath } from "url";

const execFile = util.promisify(execFileCallback);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

function loadDotEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvFile(path.join(PROJECT_ROOT, ".env.local"));

const IS_PROD = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || (IS_PROD ? 3000 : 3001);
const HOST = process.env.HOST || "127.0.0.1";
const PRODUCT_NAME = "Wings Of World";

function envValue(primary: string, fallback?: string) {
  const primaryValue = process.env[primary];
  if (primaryValue !== undefined && primaryValue !== "") return primaryValue;
  if (fallback) {
    const fallbackValue = process.env[fallback];
    if (fallbackValue !== undefined && fallbackValue !== "") return fallbackValue;
  }
  return undefined;
}

function envFlag(primary: string, fallback: string | undefined, defaultValue: boolean) {
  const value = envValue(primary, fallback);
  if (value === undefined) return defaultValue;
  return value !== "false" && value !== "0";
}

function resolveDefaultDataDir() {
  const homeDir = os.homedir();
  const projectDataDir = path.join(PROJECT_ROOT, "data");
  const canWriteDir = (dir: string) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probeFile = path.join(dir, `.write-test-${process.pid}-${Date.now()}.tmp`);
      fs.writeFileSync(probeFile, "ok", "utf-8");
      fs.unlinkSync(probeFile);
      return true;
    } catch {
      return false;
    }
  };
  if (process.platform === "win32") {
    const appDataDir =
      process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    const preferred = path.join(appDataDir, PRODUCT_NAME);
    if (canWriteDir(preferred)) {
      return preferred;
    }
    if (canWriteDir(projectDataDir)) return projectDataDir;
    return path.resolve(process.cwd(), ".wings-of-world");
  }
  const preferred = path.join(homeDir, ".wings-of-world");
  return canWriteDir(preferred) ? preferred : projectDataDir;
}

function resolveConfiguredDataDir() {
  const configured = envValue("WINGS_OF_WORLD_DATA_DIR", "WINGS_DATA_DIR");
  if (!configured) return resolveDefaultDataDir();
  return path.isAbsolute(configured) ? configured : path.resolve(PROJECT_ROOT, configured);
}

const DATA_DIR = resolveConfiguredDataDir();
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const APP_AUTH_FILE = path.join(DATA_DIR, "app-auth.json");
const WORKFLOWS_FILE = path.join(DATA_DIR, "workflows.json");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");
const CHAT_SESSIONS_FILE = path.join(DATA_DIR, "chat-sessions.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit-log.json");
const EXECUTION_HISTORY_FILE = path.join(DATA_DIR, "execution-history.json");
const EXECUTION_ARTIFACTS_FILE = path.join(DATA_DIR, "execution-artifacts.json");
const TELEGRAM_STATE_FILE = path.join(DATA_DIR, "telegram-state.json");
const TELEGRAM_LOCK_FILE = path.join(DATA_DIR, "telegram-poller.lock.json");
const HUMAN_TASKS_FILE = path.join(DATA_DIR, "human-tasks.json");
const PROJECT_REQUESTS_FILE = path.join(DATA_DIR, "project-requests.json");
const SCHEDULED_TASKS_FILE = path.join(DATA_DIR, "scheduled-tasks.json");
const WEBHOOKS_FILE = path.join(DATA_DIR, "webhooks.json");
const WEBHOOK_EVENTS_FILE = path.join(DATA_DIR, "webhook-events.json");
const VECTOR_MEMORY_FILE = path.join(DATA_DIR, "vector-memory.json");
const MACROS_FILE = path.join(DATA_DIR, "macros.json");
const MACRO_HISTORY_FILE = path.join(DATA_DIR, "macro-history.json");
const GENERATED_IMAGES_DIR = path.join(DATA_DIR, "generated-images");
const GENERATED_IMAGES_FILE = path.join(DATA_DIR, "generated-images.json");
const SQLITE_FILE = path.join(DATA_DIR, "wings-of-world.db");
const backendBridge = createBackendBridge({
  projectRoot: PROJECT_ROOT,
  dataDir: DATA_DIR,
  appendAuditEntry,
});

// ... (existing code)

function loadMacros(): any[] {
  if (!fs.existsSync(MACROS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(MACROS_FILE, "utf-8"));
  } catch { return []; }
}

function saveMacros(macros: any[]) {
  writeJsonSync(MACROS_FILE, macros, { mode: 0o600 });
}

function loadMacroHistory(): any[] {
  if (!fs.existsSync(MACRO_HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(MACRO_HISTORY_FILE, "utf-8"));
  } catch { return []; }
}

function appendMacroHistory(entry: any) {
  const history = loadMacroHistory();
  history.unshift({ id: randomBytes(8).toString("hex"), timestamp: new Date().toISOString(), ...entry });
  writeJsonSync(MACRO_HISTORY_FILE, history.slice(0, 100), { mode: 0o600 });
}
const DEFAULT_OBSIDIAN_VAULT_PATH = "D:\\MEMORY";
const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || DEFAULT_OBSIDIAN_VAULT_PATH;

function ensureObsidianStructure() {
  const dirs = ["Projects", "Macros", "Knowledge", "System", "Chat"];
  dirs.forEach(dir => {
    const p = path.join(OBSIDIAN_VAULT_PATH, dir);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  });
}

function saveToObsidian(category: "Projects" | "Macros" | "Knowledge" | "System" | "Chat", title: string, content: string, metadata: Record<string, any> = {}) {
  try {
    ensureObsidianStructure();
    const safeTitle = title.slice(0, 50).replace(/[^a-z0-9]/gi, "_");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `${timestamp}_${safeTitle}.md`;
    const filePath = path.join(OBSIDIAN_VAULT_PATH, category, fileName);
    
    const body = [
      "---",
      `title: ${JSON.stringify(title)}`,
      `created: ${new Date().toISOString()}`,
      `tags: [wings-of-world-ai, ${category.toLowerCase()}]`,
      ...Object.entries(metadata).map(([k, v]) => `${k}: ${JSON.stringify(v)}`),
      "---",
      "",
      `# ${title}`,
      "",
      content
    ].join("\n");

    fs.writeFileSync(filePath, body, "utf-8");
    return filePath;
  } catch (err) {
    console.error("Failed to save to Obsidian:", err);
    return null;
  }
}

const OBSIDIAN_MEMORY_DIR = path.join(OBSIDIAN_VAULT_PATH, "Knowledge");
const TOOL_WORKSPACE_ROOTS = [
  path.resolve(PROJECT_ROOT, ".."),
  ...(envValue("WINGS_OF_WORLD_WORKSPACE_ROOTS", "WINGS_WORKSPACE_ROOTS") || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry)),
  path.resolve("D:\\local_ai_system"),
];
const PROJECTS_ROOT = path.resolve(envValue("WINGS_OF_WORLD_PROJECTS_ROOT", "WINGS_PROJECTS_ROOT") || "D:\\Projects");
const OBSIDIAN_PROJECTS_DIR = path.join(
  OBSIDIAN_VAULT_PATH,
  "Projects",
  "AI-System",
  "Projects",
);
const TOOL_BLOCKED_EXTENSIONS = [".pem", ".key", ".p12", ".pfx", ".crt"];
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_POLLING_ENABLED = envFlag("WINGS_OF_WORLD_TELEGRAM_POLLING", "WINGS_TELEGRAM_POLLING", true);
const TELEGRAM_ALLOWED_CHAT_IDS = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

type LLMProvider = "openai" | "azure" | "custom" | "codex_local" | "anthropic" | "ollama";

interface AppConfig {
  provider: LLMProvider;
  apiKey: string;
  baseURL: string;
  model: string;
  fallbackEnabled: boolean;
  fallbackProvider: LLMProvider;
  fallbackApiKey: string;
  fallbackBaseURL: string;
  fallbackModel: string;
  pricingOverrides: Record<string, number>;
  braveApiKey: string;
  /** Optional API key for Tavily — premium LLM-tuned search. */
  tavilyApiKey?: string;
  spendDailyUsd?: number;
  spendMonthlyUsd?: number;
  guardrailPreset?: keyof typeof POLICY_PRESETS;
  guardrailModel?: string;
  /**
   * When true, Wings auto-pushes new memory entries to the Hermes
   * memory_store.db (best-effort, debounced). Pulls happen on demand via
   * the /api/hermes/sync endpoints or the `wings hermes` CLI.
   */
  hermesSyncEnabled?: boolean;
  /** Override Hermes home dir; defaults to $HERMES_HOME or ~/.hermes. */
  hermesHomeOverride?: string;
  /**
   * Smart model cascade — route easy queries to cheap tiers, escalate only
   * when the response looks uncertain. "off" disables routing entirely.
   */
  cascadeMode?: CascadeMode;
  /** Per-tier model targets used by the cascade. Empty = use provider defaults. */
  cascadeTiers?: CascadeTierConfig;
  /** Confidence threshold for escalation in aggressive mode (0-1). Default 0.55. */
  cascadeEscalationThreshold?: number;
  /**
   * Prompt compression level. "light" trims long memory/system context with
   * sentence-importance heuristics; "aggressive" also strips inline stopwords.
   * The latest user message is always sent verbatim.
   */
  compressionLevel?: CompressionLevel;
  /** Char count below which compression is skipped. Default 600. */
  compressionMinChars?: number;
  /** Strong model reserved for Hermes tool execution. Defaults to GPT-5.4. */
  hermesModel?: string;
  /** Provider API root used by Hermes when Wings launches it. */
  hermesBaseURL?: string;
  updatedAt: string;
}

interface AppAuthSession {
  id: string;
  tokenHash: string;
  bindingHash: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  maxExpiresAt: string;
  createdFromIp?: string;
  createdUserAgentHash?: string;
}

interface AppAuthState {
  passwordSalt?: string;
  passwordHash?: string;
  sessions: AppAuthSession[];
  updatedAt: string;
}

const DEFAULT_CONFIG: AppConfig = {
  provider: "openai",
  apiKey: "",
  baseURL: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  fallbackEnabled: false,
  fallbackProvider: "custom",
  fallbackApiKey: "",
  fallbackBaseURL: "http://127.0.0.1:11434/v1",
  fallbackModel: "llama3.1",
  pricingOverrides: {},
  braveApiKey: "",
  tavilyApiKey: "",
  spendDailyUsd: 5,
  guardrailPreset: "off",
  cascadeMode: "balanced",
  cascadeEscalationThreshold: 0.55,
  compressionLevel: "light",
  compressionMinChars: 600,
  hermesModel: "gpt-5.4",
  hermesBaseURL: "https://api.openai.com/v1",
  updatedAt: new Date(0).toISOString(),
};

const CODEX_LOCAL_BASE_URL = "codex://local";
const APP_AUTH_MIN_PASSWORD_LENGTH = 10;
const APP_AUTH_SESSION_IDLE_TTL_MS = 1000 * 60 * 60 * 2;
const APP_AUTH_SESSION_ABSOLUTE_TTL_MS = 1000 * 60 * 60 * 12;
const APP_AUTH_SESSION_TOUCH_INTERVAL_MS = 1000 * 60 * 5;
const APP_AUTH_MAX_SESSIONS = 5;
const APP_AUTH_MAX_FAILED_ATTEMPTS = 5;
const APP_AUTH_RATE_LIMIT_WINDOW_MS = 1000 * 60 * 15;
const APP_AUTH_LOCKOUT_MS = 1000 * 60 * 10;
const appAuthAttempts = new Map<
  string,
  { failures: number[]; lockedUntil: number }
>();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadConfig(): AppConfig {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return {
      ...DEFAULT_CONFIG,
      apiKey: process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_BASE_URL || DEFAULT_CONFIG.baseURL,
      model: process.env.OPENAI_MODEL || DEFAULT_CONFIG.model,
    };
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(cfg: AppConfig) {
  ensureDataDir();
  writeJsonSync(CONFIG_FILE, cfg, { mode: 0o600 });
}

function defaultAppAuthState(): AppAuthState {
  return {
    sessions: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function loadAppAuthState(): AppAuthState {
  ensureDataDir();
  if (!fs.existsSync(APP_AUTH_FILE)) {
    return defaultAppAuthState();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(APP_AUTH_FILE, "utf-8"));
    return {
      passwordSalt:
        typeof raw?.passwordSalt === "string" && raw.passwordSalt.trim()
          ? raw.passwordSalt.trim()
          : undefined,
      passwordHash:
        typeof raw?.passwordHash === "string" && raw.passwordHash.trim()
          ? raw.passwordHash.trim()
          : undefined,
      sessions: Array.isArray(raw?.sessions)
        ? raw.sessions
            .filter((entry: any) => entry && typeof entry === "object")
            .map((entry: any) => ({
              id: String(entry.id || ""),
              tokenHash: String(entry.tokenHash || ""),
              bindingHash: String(entry.bindingHash || ""),
              createdAt:
                typeof entry.createdAt === "string" && entry.createdAt.trim()
                  ? entry.createdAt
                  : new Date(0).toISOString(),
              lastSeenAt:
                typeof entry.lastSeenAt === "string" && entry.lastSeenAt.trim()
                  ? entry.lastSeenAt
                  : typeof entry.createdAt === "string" && entry.createdAt.trim()
                    ? entry.createdAt
                    : new Date(0).toISOString(),
              expiresAt:
                typeof entry.expiresAt === "string" && entry.expiresAt.trim()
                  ? entry.expiresAt
                  : new Date(0).toISOString(),
              maxExpiresAt:
                typeof entry.maxExpiresAt === "string" && entry.maxExpiresAt.trim()
                  ? entry.maxExpiresAt
                  : typeof entry.expiresAt === "string" && entry.expiresAt.trim()
                    ? entry.expiresAt
                    : new Date(0).toISOString(),
              createdFromIp:
                typeof entry.createdFromIp === "string" && entry.createdFromIp.trim()
                  ? entry.createdFromIp
                  : undefined,
              createdUserAgentHash:
                typeof entry.createdUserAgentHash === "string" && entry.createdUserAgentHash.trim()
                  ? entry.createdUserAgentHash
                  : undefined,
            }))
            .filter((entry: AppAuthSession) => entry.id && entry.tokenHash && entry.bindingHash)
        : [],
      updatedAt:
        typeof raw?.updatedAt === "string" && raw.updatedAt.trim()
          ? raw.updatedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return defaultAppAuthState();
  }
}

function saveAppAuthState(state: AppAuthState) {
  ensureDataDir();
  writeJsonSync(APP_AUTH_FILE, state, { mode: 0o600 });
}

function isAppAuthEnabled(state = loadAppAuthState()) {
  return Boolean(state.passwordSalt && state.passwordHash);
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function secureCompareHex(a?: string, b?: string) {
  if (!a || !b) return false;
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    if (left.length !== right.length || left.length === 0) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function pruneExpiredAuthSessions(state: AppAuthState) {
  const now = Date.now();
  const sessions = state.sessions.filter((session) => {
    const expiresAt = Date.parse(session.expiresAt);
    const maxExpiresAt = Date.parse(session.maxExpiresAt || "");
    return (
      Number.isFinite(expiresAt) &&
      expiresAt > now &&
      Number.isFinite(maxExpiresAt) &&
      maxExpiresAt > now
    );
  });
  return sessions.length === state.sessions.length
    ? state
    : {
        ...state,
        sessions,
        updatedAt: new Date().toISOString(),
      };
}

function persistPrunedAuthState() {
  const current = loadAppAuthState();
  const state = pruneExpiredAuthSessions(current);
  if (state === current) return state;
  try {
    saveAppAuthState(state);
  } catch (error: any) {
    logger.warn({ err: error?.message || String(error) }, "app auth prune could not persist");
  }
  return state;
}

function validateAppPasswordRules(password: string) {
  const trimmed = password.trim();
  if (trimmed.length < APP_AUTH_MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${APP_AUTH_MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!/[a-z]/i.test(trimmed) || !/[0-9]/.test(trimmed)) {
    throw new Error("Password must include both letters and numbers.");
  }
}

function normalizeClientIp(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function hashUserAgent(userAgent: string) {
  return createHash("sha256").update(userAgent || "unknown").digest("hex");
}

function getClientBindingHash(req: Request) {
  const fingerprint = `${normalizeClientIp(req)}|${req.get("user-agent") || "unknown"}`;
  return createHash("sha256").update(fingerprint).digest("hex");
}

function getAuthRateLimitKey(req: Request) {
  return normalizeClientIp(req);
}

function getAuthRateLimitState(req: Request) {
  const key = getAuthRateLimitKey(req);
  const now = Date.now();
  const current = appAuthAttempts.get(key) || { failures: [], lockedUntil: 0 };
  const pruned = {
    failures: current.failures.filter((timestamp) => now - timestamp <= APP_AUTH_RATE_LIMIT_WINDOW_MS),
    lockedUntil: current.lockedUntil > now ? current.lockedUntil : 0,
  };
  appAuthAttempts.set(key, pruned);
  return { key, state: pruned };
}

function recordFailedAuthAttempt(req: Request) {
  const { key, state } = getAuthRateLimitState(req);
  const now = Date.now();
  const failures = [...state.failures, now].filter(
    (timestamp) => now - timestamp <= APP_AUTH_RATE_LIMIT_WINDOW_MS,
  );
  const lockedUntil =
    failures.length >= APP_AUTH_MAX_FAILED_ATTEMPTS ? now + APP_AUTH_LOCKOUT_MS : state.lockedUntil;
  appAuthAttempts.set(key, { failures, lockedUntil });
  return { failures: failures.length, lockedUntil };
}

function clearFailedAuthAttempts(req: Request) {
  appAuthAttempts.delete(getAuthRateLimitKey(req));
}

function getAuthLockout(req: Request) {
  const { state } = getAuthRateLimitState(req);
  if (!state.lockedUntil) return null;
  return {
    retryAfterMs: Math.max(0, state.lockedUntil - Date.now()),
    retryAfterSeconds: Math.max(1, Math.ceil((state.lockedUntil - Date.now()) / 1000)),
  };
}

function createAppAuthSession(state: AppAuthState, req: Request) {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const userAgentHash = hashUserAgent(req.get("user-agent") || "unknown");
  const session: AppAuthSession = {
    id: `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tokenHash: hashSessionToken(token),
    bindingHash: getClientBindingHash(req),
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + APP_AUTH_SESSION_IDLE_TTL_MS).toISOString(),
    maxExpiresAt: new Date(now.getTime() + APP_AUTH_SESSION_ABSOLUTE_TTL_MS).toISOString(),
    createdFromIp: normalizeClientIp(req),
    createdUserAgentHash: userAgentHash,
  };
  const nextState: AppAuthState = {
    ...state,
    sessions: [session, ...state.sessions].slice(0, APP_AUTH_MAX_SESSIONS),
    updatedAt: now.toISOString(),
  };
  saveAppAuthState(nextState);
  return { token, session, state: nextState };
}

function extractAppAuthToken(req: Request) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const sessionHeader = req.headers["x-wings-session"];
  return typeof sessionHeader === "string" && sessionHeader.trim()
    ? sessionHeader.trim()
    : "";
}

function getAppAuthSession(req: Request) {
  const state = persistPrunedAuthState();
  if (!isAppAuthEnabled(state)) {
    return {
      enabled: false,
      authenticated: true,
      state,
      session: null as AppAuthSession | null,
    };
  }
  const token = extractAppAuthToken(req);
  if (!token) {
    return {
      enabled: true,
      authenticated: false,
      state,
      session: null as AppAuthSession | null,
    };
  }
  const tokenHash = hashSessionToken(token);
  const session = state.sessions.find((entry) => secureCompareHex(entry.tokenHash, tokenHash)) || null;
  const bindingMatches =
    Boolean(session) && secureCompareHex(session?.bindingHash, getClientBindingHash(req));
  return {
    enabled: true,
    authenticated: Boolean(session && bindingMatches),
    state,
    session: session && bindingMatches ? session : null,
    invalidReason: session && !bindingMatches ? "binding-mismatch" : null,
  };
}

function touchAuthenticatedSession(state: AppAuthState, sessionId: string) {
  const now = Date.now();
  let changed = false;
  const sessions = state.sessions.map((entry) => {
    if (entry.id !== sessionId) return entry;
    const lastSeenAt = Date.parse(entry.lastSeenAt || entry.createdAt);
    if (Number.isFinite(lastSeenAt) && now - lastSeenAt < APP_AUTH_SESSION_TOUCH_INTERVAL_MS) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: new Date(
        Math.min(
          Date.parse(entry.maxExpiresAt || new Date(now).toISOString()),
          now + APP_AUTH_SESSION_IDLE_TTL_MS,
        ),
      ).toISOString(),
    };
  });
  if (!changed) return state;
  const nextState = {
    ...state,
    sessions,
    updatedAt: new Date(now).toISOString(),
  };
  saveAppAuthState(nextState);
  return nextState;
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function parseBaseUrl(baseURL: string) {
  if (baseURL === CODEX_LOCAL_BASE_URL) {
    return { protocol: "codex:", hostname: "local", pathname: "/" } as URL;
  }
  try {
    return new URL(baseURL);
  } catch {
    return null;
  }
}

function isLocalHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

function isLoopbackRequest(req: Request) {
  const ip = req.ip || req.socket.remoteAddress || "";
  return (
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip === "127.0.0.1" ||
    ip === "::ffff:localhost"
  );
}

function shouldRestrictToLoopback(req: Request) {
  if (!req.path.startsWith("/api/")) return false;
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    return true;
  }
  return (
    req.path === "/api/system/export" ||
    req.path === "/api/settings" ||
    req.path === "/api/settings/test"
  );
}

function shouldAllowAnonymousApiRequest(req: Request) {
  return (
    req.path === "/api/auth/status" ||
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/bootstrap"
  );
}

function isApiKeyRequired(cfg: AppConfig) {
  if (cfg.provider === "codex_local" || cfg.provider === "ollama") {
    return false;
  }
  const parsed = parseBaseUrl(cfg.baseURL);
  if (!parsed) return true;
  if (cfg.provider === "custom" && isLocalHost(parsed.hostname)) {
    return false;
  }
  return true;
}

function isProviderUsable(cfg: AppConfig) {
  return !isApiKeyRequired(cfg) || Boolean(cfg.apiKey);
}

function buildProviderConfig(
  provider: LLMProvider,
  baseURL: string,
  model: string,
  apiKey: string,
  updatedAt: string,
): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    provider,
    baseURL,
    model,
    apiKey,
    updatedAt,
    fallbackEnabled: false,
    fallbackProvider: DEFAULT_CONFIG.fallbackProvider,
    fallbackApiKey: "",
    fallbackBaseURL: DEFAULT_CONFIG.fallbackBaseURL,
    fallbackModel: DEFAULT_CONFIG.fallbackModel,
    pricingOverrides: {},
  };
}

function getFallbackConfig(cfg: AppConfig): AppConfig | null {
  if (!cfg.fallbackEnabled) return null;
  return buildProviderConfig(
    cfg.fallbackProvider,
    cfg.fallbackBaseURL,
    cfg.fallbackModel,
    cfg.fallbackApiKey,
    cfg.updatedAt,
  );
}

function isLLMProvider(value: string): value is LLMProvider {
  return (
    value === "openai" ||
    value === "azure" ||
    value === "custom" ||
    value === "codex_local" ||
    value === "anthropic" ||
    value === "ollama"
  );
}

function configForModelTarget(cfg: AppConfig, target: CascadeModelTarget): AppConfig {
  const provider = isLLMProvider(target.provider) ? target.provider : cfg.provider;
  const baseURL = target.baseURL || cfg.baseURL;
  const sameEndpoint = baseURL.replace(/\/$/, "") === cfg.baseURL.replace(/\/$/, "");
  return {
    ...cfg,
    provider,
    baseURL,
    model: target.model,
    apiKey: sameEndpoint ? cfg.apiKey : provider === cfg.provider ? cfg.apiKey : "",
  };
}

function getProviderSummary(cfg: AppConfig) {
  return {
    provider: cfg.provider,
    baseURL: cfg.baseURL,
    model: cfg.model,
    apiKeyMasked: maskKey(cfg.apiKey),
    hasApiKey: Boolean(cfg.apiKey),
    apiKeyRequired: isApiKeyRequired(cfg),
    configured: isProviderUsable(cfg),
    apiMode: getApiMode(cfg),
  };
}

function publicConfig(cfg: AppConfig) {
  return {
    provider: cfg.provider,
    baseURL: cfg.baseURL,
    model: cfg.model,
    apiKeyMasked: maskKey(cfg.apiKey),
    hasApiKey: Boolean(cfg.apiKey),
    apiKeyRequired: isApiKeyRequired(cfg),
    fallback: {
      enabled: cfg.fallbackEnabled,
      ...getProviderSummary(getFallbackConfig(cfg) || buildProviderConfig(
        cfg.fallbackProvider,
        cfg.fallbackBaseURL,
        cfg.fallbackModel,
        cfg.fallbackApiKey,
        cfg.updatedAt,
      )),
    },
    updatedAt: cfg.updatedAt,
    dataDir: DATA_DIR,
    pricingOverrides: cfg.pricingOverrides || {},
    hasBraveApiKey: Boolean(cfg.braveApiKey),
    hasTavilyApiKey: Boolean(cfg.tavilyApiKey),
    authEnabled: isAppAuthEnabled(),
  };
}

function validateConfig(cfg: AppConfig) {
  const validateSingle = (candidate: AppConfig, label: string) => {
    if (candidate.provider === "codex_local") {
      if (candidate.baseURL.trim() !== CODEX_LOCAL_BASE_URL) {
        throw new Error(`${label} should use ${CODEX_LOCAL_BASE_URL}.`);
      }
      if (!candidate.model.trim()) {
        throw new Error(`${label} model is required.`);
      }
      return;
    }

    if (!candidate.baseURL.trim()) {
      throw new Error(`${label} Base URL is required.`);
    }
    const parsed = parseBaseUrl(candidate.baseURL);
    if (!parsed) {
      throw new Error(`${label} Base URL must be a valid absolute URL.`);
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`${label} Base URL must use http or https.`);
    }
    if (!candidate.model.trim()) {
      throw new Error(`${label} model is required.`);
    }
    if (isApiKeyRequired(candidate) && !candidate.apiKey.trim()) {
      throw new Error(`${label} API key is required for this provider endpoint.`);
    }

    if (candidate.provider === "openai") {
      if (parsed.protocol !== "https:" || parsed.hostname !== "api.openai.com") {
        throw new Error(`${label} should use https://api.openai.com/v1.`);
      }
    }

    if (candidate.provider === "azure") {
      if (parsed.protocol !== "https:") {
        throw new Error(`${label} requires an https endpoint.`);
      }
      if (!/\/openai\/deployments\/[^/]+/i.test(parsed.pathname)) {
        throw new Error(
          `${label} Base URL must include /openai/deployments/YOUR-DEPLOYMENT.`,
        );
      }
    }
  };

  validateSingle(buildProviderConfig(cfg.provider, cfg.baseURL, cfg.model, cfg.apiKey, cfg.updatedAt), "Primary provider");

  if (cfg.fallbackEnabled) {
    validateSingle(
      buildProviderConfig(
        cfg.fallbackProvider,
        cfg.fallbackBaseURL,
        cfg.fallbackModel,
        cfg.fallbackApiKey,
        cfg.updatedAt,
      ),
      "Fallback provider",
    );
  }

  const overrides = cfg.pricingOverrides || {};
  for (const [model, rate] of Object.entries(overrides)) {
    if (!model.trim()) {
      throw new Error("Pricing overrides cannot use an empty model key.");
    }
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error(`Pricing override for ${model} must be a non-negative number.`);
    }
  }
}

type ConfigPatch = Partial<AppConfig> & {
  clearApiKey?: boolean;
  clearFallbackApiKey?: boolean;
  pricingOverrides?: Record<string, unknown>;
};

function normalizeConfigPatch(
  patch: ConfigPatch | undefined,
  current: AppConfig,
): AppConfig {
  const normalizeProvider = (value: unknown, fallback: LLMProvider) =>
    value === "openai" ||
    value === "azure" ||
    value === "custom" ||
    value === "codex_local" ||
    value === "anthropic" ||
    value === "ollama"
      ? (value as LLMProvider)
      : fallback;

  const normalizeCascadeMode = (value: unknown, fallback: CascadeMode | undefined): CascadeMode | undefined =>
    value === "off" || value === "balanced" || value === "aggressive"
      ? value
      : fallback;

  const normalizeCompressionLevel = (
    value: unknown,
    fallback: CompressionLevel | undefined,
  ): CompressionLevel | undefined =>
    value === "off" || value === "light" || value === "aggressive"
      ? value
      : fallback;

  const provider =
    normalizeProvider(patch?.provider, current.provider);
  const fallbackProvider = normalizeProvider(
    patch?.fallbackProvider,
    current.fallbackProvider,
  );

  return {
    provider,
    apiKey:
      patch?.clearApiKey === true
        ? ""
        : typeof patch?.apiKey === "string"
        ? patch.apiKey.trim() || current.apiKey
        : current.apiKey,
    baseURL:
      typeof patch?.baseURL === "string" && patch.baseURL.trim()
        ? patch.baseURL.trim()
        : current.baseURL,
    model:
      typeof patch?.model === "string" && patch.model.trim()
        ? patch.model.trim()
        : current.model,
    fallbackEnabled:
      typeof patch?.fallbackEnabled === "boolean"
        ? patch.fallbackEnabled
        : current.fallbackEnabled,
    fallbackProvider,
    fallbackApiKey:
      patch?.clearFallbackApiKey === true
        ? ""
        : typeof patch?.fallbackApiKey === "string"
        ? patch.fallbackApiKey.trim() || current.fallbackApiKey
        : current.fallbackApiKey,
    fallbackBaseURL:
      typeof patch?.fallbackBaseURL === "string" && patch.fallbackBaseURL.trim()
        ? patch.fallbackBaseURL.trim()
        : current.fallbackBaseURL,
    fallbackModel:
      typeof patch?.fallbackModel === "string" && patch.fallbackModel.trim()
        ? patch.fallbackModel.trim()
        : current.fallbackModel,
    pricingOverrides:
      patch?.pricingOverrides && typeof patch.pricingOverrides === "object"
        ? Object.fromEntries(
            Object.entries(patch.pricingOverrides)
              .map(([key, value]) => [key.trim(), Number(value)] as const)
              .filter(([key, value]) => key && Number.isFinite(value) && value >= 0),
          )
        : current.pricingOverrides,
    braveApiKey:
      typeof patch?.braveApiKey === "string"
        ? patch.braveApiKey.trim()
        : current.braveApiKey,
    tavilyApiKey:
      typeof patch?.tavilyApiKey === "string"
        ? patch.tavilyApiKey.trim()
        : current.tavilyApiKey,
    spendDailyUsd:
      typeof patch?.spendDailyUsd === "number" && Number.isFinite(patch.spendDailyUsd)
        ? Math.max(0, patch.spendDailyUsd)
        : current.spendDailyUsd,
    spendMonthlyUsd:
      typeof patch?.spendMonthlyUsd === "number" && Number.isFinite(patch.spendMonthlyUsd)
        ? Math.max(0, patch.spendMonthlyUsd)
        : current.spendMonthlyUsd,
    guardrailPreset:
      typeof patch?.guardrailPreset === "string"
        ? patch.guardrailPreset as keyof typeof POLICY_PRESETS
        : current.guardrailPreset,
    guardrailModel:
      typeof patch?.guardrailModel === "string"
        ? patch.guardrailModel.trim() || undefined
        : current.guardrailModel,
    hermesSyncEnabled:
      typeof patch?.hermesSyncEnabled === "boolean"
        ? patch.hermesSyncEnabled
        : current.hermesSyncEnabled,
    hermesHomeOverride:
      typeof patch?.hermesHomeOverride === "string"
        ? patch.hermesHomeOverride.trim() || undefined
        : current.hermesHomeOverride,
    cascadeMode: normalizeCascadeMode(patch?.cascadeMode, current.cascadeMode),
    cascadeTiers:
      patch?.cascadeTiers && typeof patch.cascadeTiers === "object"
        ? patch.cascadeTiers
        : current.cascadeTiers,
    cascadeEscalationThreshold:
      typeof patch?.cascadeEscalationThreshold === "number" && Number.isFinite(patch.cascadeEscalationThreshold)
        ? Math.max(0, Math.min(1, patch.cascadeEscalationThreshold))
        : current.cascadeEscalationThreshold,
    compressionLevel: normalizeCompressionLevel(patch?.compressionLevel, current.compressionLevel),
    compressionMinChars:
      typeof patch?.compressionMinChars === "number" && Number.isFinite(patch.compressionMinChars)
        ? Math.max(0, Math.round(patch.compressionMinChars))
        : current.compressionMinChars,
    hermesModel:
      typeof patch?.hermesModel === "string" && patch.hermesModel.trim()
        ? patch.hermesModel.trim()
        : current.hermesModel,
    hermesBaseURL:
      typeof patch?.hermesBaseURL === "string" && patch.hermesBaseURL.trim()
        ? patch.hermesBaseURL.trim()
        : current.hermesBaseURL,
    updatedAt: new Date().toISOString(),
  };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function shouldUseResponsesApi(cfg: AppConfig) {
  const parsed = parseBaseUrl(cfg.baseURL);
  if (!parsed) return false;
  return cfg.provider === "openai" && parsed.hostname === "api.openai.com";
}

function getApiMode(cfg: AppConfig) {
  if (cfg.provider === "codex_local") return "codex_exec";
  if (cfg.provider === "anthropic") return "anthropic_messages";
  return shouldUseResponsesApi(cfg) ? "responses" : "chat_completions";
}

function isLikelyQuotaError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("usage limit") ||
    normalized.includes("rate limit") ||
    normalized.includes("quota") ||
    normalized.includes("too many requests") ||
    normalized.includes("429")
  );
}

function shouldFallbackOnError(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    isLikelyQuotaError(message) ||
    message.includes("fetch failed") ||
    message.includes("connection") ||
    message.includes("timeout") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("upstream")
  );
}

function buildOfflineFallbackResponse(messages: ChatMessage[]) {
  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content?.trim() || "";
  const systemMessage =
    messages.find((message) => message.role === "system")?.content?.trim() || "";
  const bullets: string[] = [];
  if (lastUserMessage) {
    bullets.push(`Focus: ${lastUserMessage.slice(0, 240)}`);
  }
  if (systemMessage) {
    bullets.push(`Context loaded from system prompt and attached Wings Of World context.`);
  }
  bullets.push("Primary model runtime is unavailable, so Wings Of World switched to offline fallback mode.");
  bullets.push("You can still use skills, prompt templates, resources, memory search, tools, and Telegram commands.");
  bullets.push("For full model-quality generation, bring an upstream provider or local model online.");

  const content = [
    "Wings Of World offline fallback is active.",
    "",
    ...bullets.map((line, index) => `${index + 1}. ${line}`),
    "",
    "Recommended next actions:",
    "- Open Settings and enable a working fallback provider.",
    "- Or start a local OpenAI-compatible runtime such as Ollama or LM Studio.",
    "- Then retry the same request.",
  ].join("\n");

  return {
    content,
    raw: {
      mode: "offline_fallback",
      reason: "No upstream model runtime available",
    },
    usage: estimateUsageFromMessages(messages, content),
  };
}

function getRecentProviderIssue() {
  const entries = loadAuditEntries();
  const issue = entries.find(
    (entry) =>
      entry.status === "error" &&
      (entry.area === "settings" || entry.area === "chat" || entry.area === "system") &&
      (isLikelyQuotaError(entry.summary) ||
        entry.summary.toLowerCase().includes("fetch failed") ||
        entry.summary.toLowerCase().includes("telegram delivery") ||
        entry.summary.toLowerCase().includes("telegram poll")),
  );
  if (!issue) return null;
  const issueTimestamp = Date.parse(issue.timestamp);
  const hasNewerChatSuccess = entries.some((entry) => {
    if (entry.area !== "chat" || entry.status !== "success" || entry.action !== "reply") {
      return false;
    }
    const successTimestamp = Date.parse(entry.timestamp);
    return Number.isFinite(issueTimestamp) && Number.isFinite(successTimestamp)
      ? successTimestamp > issueTimestamp
      : false;
  });
  if (hasNewerChatSuccess) return null;
  const ageMinutes = Number.isFinite(issueTimestamp)
    ? Math.max(0, Math.round((Date.now() - issueTimestamp) / 60000))
    : null;
  return {
    at: issue.timestamp,
    ageMinutes,
    summary: issue.summary,
    category: isLikelyQuotaError(issue.summary) ? "quota" : "runtime",
  };
}

function getProviderHealthSnapshot(cfg: AppConfig) {
  const fallback = getFallbackConfig(cfg);
  const recentIssue = getRecentProviderIssue();
  const activeIssue =
    recentIssue && (recentIssue.ageMinutes === null || recentIssue.ageMinutes <= 30)
      ? recentIssue
      : null;
  return {
    primary: getProviderSummary(cfg),
    fallback: fallback
      ? {
          enabled: true,
          ...getProviderSummary(fallback),
        }
      : {
          enabled: false,
          ...getProviderSummary(
            buildProviderConfig(
              cfg.fallbackProvider,
              cfg.fallbackBaseURL,
              cfg.fallbackModel,
              cfg.fallbackApiKey,
              cfg.updatedAt,
            ),
          ),
        },
    warnings: [
      ...(activeIssue
        ? [
            activeIssue.ageMinutes !== null
              ? `${activeIssue.summary} (${activeIssue.ageMinutes} minute(s) ago)`
              : activeIssue.summary,
          ]
        : []),
      ...(cfg.fallbackEnabled && fallback && !isProviderUsable(fallback)
        ? ["Fallback provider is enabled but not fully configured."]
        : []),
    ],
    lastIssue: activeIssue,
    lastIssueHistory: recentIssue,
  };
}

function buildCodexPrompt(messages: ChatMessage[]) {
  return messages
    .map((message) => {
      const role = message.role.toUpperCase();
      return `${role}:\n${message.content}`;
    })
    .join("\n\n");
}

async function callCodexLocal(
  cfg: AppConfig,
  messages: ChatMessage[],
  modelOverride?: string,
): Promise<{ content: string; raw: unknown; usage: TokenUsage }> {
  const prompt = buildCodexPrompt(messages);
  const outputFile = path.join(
    DATA_DIR,
    `codex-last-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`,
  );
  const args = [
    "exec",
    "--disable",
    "plugins",
    "--skip-git-repo-check",
    "--ephemeral",
    "--color",
    "never",
    "-C",
    PROJECT_ROOT,
    "-o",
    outputFile,
    "-m",
    modelOverride || cfg.model,
    "-",
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawnCodexCli(args, {
        cwd: PROJECT_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.stdin.write(prompt);
      child.stdin.end();
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              formatCodexCliError(stderr, stdout, code),
            ),
          );
        }
      });
      child.on("error", reject);
    });

    const content = fs.existsSync(outputFile)
      ? fs.readFileSync(outputFile, "utf-8").trim()
      : "";
    if (!content) {
      throw new Error("Codex returned an empty response.");
    }

    return {
      content,
      raw: {
        provider: "codex_local",
        model: modelOverride || cfg.model,
      },
      usage: estimateUsageFromMessages(messages, content),
    };
  } finally {
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }
  }
}

async function callResponsesApi(
  cfg: AppConfig,
  messages: ChatMessage[],
  modelOverride?: string,
): Promise<{ content: string; raw: unknown; usage: TokenUsage }> {
  if (isApiKeyRequired(cfg) && !cfg.apiKey) {
    throw new Error("API key is not configured. Set it in Settings first.");
  }

  const url = `${cfg.baseURL.replace(/\/$/, "")}/responses`;
  const body = {
    model: modelOverride || cfg.model,
    input: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    store: false,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Upstream ${res.status}: ${text.slice(0, 500) || res.statusText}`,
    );
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Upstream returned non-JSON: ${text.slice(0, 200)}`);
  }

  const content: string =
    data?.output_text ??
    data?.output
      ?.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
      ?.filter((item: any) => item?.type === "output_text" && typeof item?.text === "string")
      ?.map((item: any) => item.text)
      ?.join("\n") ??
    "";
  return {
    content,
    raw: data,
    usage:
      data?.usage && typeof data.usage === "object"
        ? normalizeTokenUsage(data.usage)
        : estimateUsageFromMessages(messages, content),
  };
}

// ── Anthropic Messages API ───────────────────────────────────────────────────
const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_MAX_TOKENS = 4096;
const ANTHROPIC_CACHE_MIN_CHARS = 1024;

const adaptiveMaxTokens = budgetAdaptiveMaxTokens;

async function callAnthropicAPI(
  cfg: AppConfig,
  messages: ChatMessage[],
  modelOverride?: string,
): Promise<{ content: string; raw: unknown; usage: TokenUsage }> {
  if (!cfg.apiKey) {
    throw new Error("Anthropic API key is not configured. Set it in Settings.");
  }

  const systemMsg = messages.find((m) => m.role === "system");
  const conversationMsgs = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string }));

  if (conversationMsgs.length === 0 || conversationMsgs[0].role !== "user") {
    conversationMsgs.unshift({ role: "user", content: "Hello" });
  }

  const model = modelOverride || cfg.model || ANTHROPIC_DEFAULT_MODEL;
  const body: Record<string, unknown> = {
    model,
    max_tokens: adaptiveMaxTokens(messages, ANTHROPIC_MAX_TOKENS),
    messages: conversationMsgs,
  };
  if (systemMsg?.content) {
    const sys = systemMsg.content as string;
    body.system = sys.length >= ANTHROPIC_CACHE_MIN_CHARS
      ? [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }]
      : sys;
  }

  const effectiveBase = cfg.baseURL && cfg.baseURL.trim() && !cfg.baseURL.includes("api.openai.com")
    ? cfg.baseURL.replace(/\/$/, "")
    : `${ANTHROPIC_BASE_URL}/v1`;
  const messagesEndpoint = effectiveBase.endsWith("/messages")
    ? effectiveBase
    : `${effectiveBase}/messages`;

  const outcome = await withUpstreamRetry<{ content: string; raw: any; usage: TokenUsage }>(
    async () => {
      const res = await fetch(messagesEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, status: res.status, body: text, retryAfter: res.headers.get("retry-after") };
      }
      let data: any;
      try { data = JSON.parse(text); } catch {
        return { ok: false, status: res.status, body: `non-JSON response: ${text.slice(0, 200)}` };
      }
      const content = Array.isArray(data?.content)
        ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
        : "";
      const usage: TokenUsage = {
        promptTokens: data?.usage?.input_tokens ?? 0,
        completionTokens: data?.usage?.output_tokens ?? 0,
        totalTokens: (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0),
      };
      return { ok: true, status: res.status, body: text, result: { content, raw: data, usage } };
    },
    {
      maxAttempts: 3,
      onRetry: ({ attempt, delayMs, error }) => {
        logger.warn({ attempt, delayMs, status: error.status, errorClass: error.errorClass }, "anthropic retry");
      },
    },
  );

  if ("error" in outcome) {
    throw new Error(formatFriendlyError(outcome.error));
  }
  return outcome.result;
}

async function callChatCompletions(
  cfg: AppConfig,
  messages: ChatMessage[],
  modelOverride?: string,
  options?: { allowOfflineFallback?: boolean },
): Promise<{
  content: string;
  raw: unknown;
  usage: TokenUsage;
  providerMeta: {
    provider: string;
    model: string;
    apiMode: string;
    usedFallback: boolean;
    baseURL: string;
  };
}> {
  const executeSingleProvider = async (
    candidate: AppConfig,
    usedFallback: boolean,
  ) => {
    let result: { content: string; raw: unknown; usage: TokenUsage };
    if (candidate.provider === "anthropic") {
      result = await callAnthropicAPI(candidate, messages, modelOverride);
    } else if (candidate.provider === "codex_local") {
      result = await callCodexLocal(candidate, messages, modelOverride);
    } else if (shouldUseResponsesApi(candidate)) {
      result = await callResponsesApi(candidate, messages, modelOverride);
    } else {
      if (isApiKeyRequired(candidate) && !candidate.apiKey) {
        throw new Error("API key is not configured. Set it in Settings first.");
      }

      const url = `${candidate.baseURL.replace(/\/$/, "")}/chat/completions`;
      const body = {
        model: modelOverride || candidate.model,
        messages,
        temperature: 0.2,
      };

      const outcome = await withUpstreamRetry<{ content: string; raw: any; usage: TokenUsage }>(
        async () => {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(candidate.apiKey ? { Authorization: `Bearer ${candidate.apiKey}` } : {}),
            },
            body: JSON.stringify(body),
          });
          const text = await res.text();
          if (!res.ok) {
            return { ok: false, status: res.status, body: text, retryAfter: res.headers.get("retry-after") };
          }
          let data: any;
          try { data = JSON.parse(text); } catch {
            return { ok: false, status: res.status, body: `non-JSON response: ${text.slice(0, 200)}` };
          }
          const content =
            data?.choices?.[0]?.message?.content ??
            data?.choices?.[0]?.text ??
            "";
          const usage =
            data?.usage && typeof data.usage === "object"
              ? normalizeTokenUsage(data.usage)
              : estimateUsageFromMessages(messages, content);
          return { ok: true, status: res.status, body: text, result: { content, raw: data, usage } };
        },
        {
          maxAttempts: 3,
          onRetry: ({ attempt, delayMs, error }) => {
            logger.warn(
              { attempt, delayMs, status: error.status, errorClass: error.errorClass, provider: candidate.provider, model: modelOverride || candidate.model },
              "upstream retry",
            );
          },
        },
      );

      if ("error" in outcome) {
        throw new Error(formatFriendlyError(outcome.error));
      }
      result = outcome.result;
    }

    return {
      ...result,
      providerMeta: {
        provider: candidate.provider,
        model: modelOverride || candidate.model,
        apiMode: getApiMode(candidate),
        usedFallback,
        baseURL: candidate.baseURL,
      },
    };
  };

  try {
    return await executeSingleProvider(cfg, false);
  } catch (primaryError) {
    const fallback = getFallbackConfig(cfg);
    if (fallback && isProviderUsable(fallback) && shouldFallbackOnError(primaryError)) {
      appendAuditEntry({
        area: "chat",
        action: "fallback",
        status: "success",
        summary: `Primary provider ${cfg.provider} failed. Falling back to ${fallback.provider}.`,
      });
      try {
        return await executeSingleProvider(fallback, true);
      } catch (fallbackError) {
        if (options?.allowOfflineFallback === false) {
          throw fallbackError;
        }
        const result = buildOfflineFallbackResponse(messages);
        appendAuditEntry({
          area: "chat",
          action: "offline-fallback",
          status: "success",
          summary: `Primary ${cfg.provider} and fallback ${fallback.provider} were unavailable. Wings Of World switched to offline fallback mode.`,
        });
        return {
          ...result,
          providerMeta: {
            provider: "offline_fallback",
            model: modelOverride || cfg.model,
            apiMode: "offline_fallback",
            usedFallback: true,
            baseURL: "offline://fallback",
          },
        };
      }
    }
    if (options?.allowOfflineFallback === false) {
      throw primaryError;
    }
    const result = buildOfflineFallbackResponse(messages);
    appendAuditEntry({
      area: "chat",
      action: "offline-fallback",
      status: "success",
      summary: `Primary ${cfg.provider} was unavailable and no working fallback provider was present. Wings Of World switched to offline fallback mode.`,
    });
    return {
      ...result,
      providerMeta: {
        provider: "offline_fallback",
        model: modelOverride || cfg.model,
        apiMode: "offline_fallback",
        usedFallback: false,
        baseURL: "offline://fallback",
      },
    };
  }
}

interface WorkflowNode {
  id: string;
  type: "trigger" | "llm" | "code" | "output" | "tool" | "telegram" | "condition" | "loop";
  data: {
    label: string;
    prompt?: string;
    model?: string;
    provider?: "primary" | "fallback";
    input?: string;
    code?: string;
    /** Predicate expression for condition nodes. Evaluated in the sandbox. */
    condition?: string;
    /** Expression returning the array to iterate over for loop nodes. */
    itemsExpr?: string;
    /** Body executed once per loop item. Has bindings: item, index, input. */
    bodyCode?: string;
    /** Hard cap on loop iterations. Defaults to 50. */
    maxIterations?: number;
  };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /**
   * Optional branch label. When set, the edge only fires when its source
   * `condition` node evaluated to this branch ("true" or "false").
   */
  branch?: "true" | "false";
}

interface Workflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface MemoryEntry {
  id: string;
  content: string;
  memoryType: "fact" | "preference" | "context" | "summary" | "insight";
  source: string;
  importanceScore: number;
  createdAt: string;
  updatedAt: string;
}

interface ChatSessionRecord {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
  tokenUsage?: TokenUsage;
  costEstimateUsd?: number;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface AuditEntry {
  id: string;
  area: string;
  action: string;
  status: "success" | "error";
  summary: string;
  timestamp: string;
  targetId?: string;
}

interface ReadinessCheck {
  id: string;
  label: string;
  status: "ready" | "warning" | "error";
  detail: string;
  action?: string;
}

interface SystemExportBundle {
  version: 1;
  exportedAt: string;
  data: {
    settings: ReturnType<typeof publicConfig>;
    workflows: unknown[];
    memory: MemoryEntry[];
    chatSessions: ChatSessionRecord[];
    audit: AuditEntry[];
    executionHistory: ExecutionRecord[];
    executionArtifacts: ExecutionArtifact[];
    telegramState: TelegramState;
    humanTasks: HumanTask[];
  };
}

interface ExecutionRecord {
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

interface ExecutionArtifact {
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

interface TelegramChatState {
  chatId: string;
  sessionId: string;
  username?: string;
  title?: string;
  lastMessageAt: string;
  activeSkillIds?: string[];
}

interface TelegramState {
  offset: number;
  chats: TelegramChatState[];
  lastPollAt?: string;
  lastError?: string;
}

interface TelegramPollerLock {
  pid: number;
  instanceId: string;
  acquiredAt: string;
  heartbeatAt: string;
}

interface SkillDefinition {
  id: string;
  title: string;
  summary: string;
  whenToUse: string;
  systemPrompt: string;
  telegramEnabled?: boolean;
}

interface PromptTemplateDefinition {
  id: string;
  title: string;
  description: string;
  template: string;
  suggestedSkills?: string[];
  telegramEnabled?: boolean;
}

interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

interface HumanTask {
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

type HumanTaskStatus = HumanTask["status"];

const HUMAN_TASK_TRANSITIONS: Record<HumanTaskStatus, HumanTaskStatus[]> = {
  pending: ["in_progress", "blocked", "done"],
  in_progress: ["pending", "blocked", "done"],
  blocked: ["pending", "in_progress"],
  done: [],
};

function normalizeHumanTaskStatus(value: unknown, fallback: HumanTaskStatus): HumanTaskStatus {
  return value === "pending" ||
    value === "in_progress" ||
    value === "done" ||
    value === "blocked"
    ? value
    : fallback;
}

function normalizeHumanTaskPriority(value: unknown, fallback: HumanTask["priority"]): HumanTask["priority"] {
  return value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
    ? value
    : fallback;
}

function normalizeCommandPlanForTask(value: unknown): CommandPlan | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entry = value as Partial<CommandPlan>;
  if (
    typeof entry.title !== "string" ||
    typeof entry.objective !== "string" ||
    !["chat", "workflow", "tool", "human"].includes(String(entry.route)) ||
    !["low", "medium", "high"].includes(String(entry.riskLevel)) ||
    !["low", "medium", "high", "critical"].includes(String(entry.priority)) ||
    !Array.isArray(entry.checklist) ||
    !Array.isArray(entry.acceptanceCriteria) ||
    typeof entry.suggestedNextStep !== "string" ||
    typeof entry.detailsMarkdown !== "string"
  ) {
    return undefined;
  }

  const automation =
    entry.automation &&
    typeof entry.automation === "object" &&
    ["tool", "workflow", "chat"].includes(String(entry.automation.kind)) &&
    typeof entry.automation.label === "string"
      ? {
          kind: entry.automation.kind,
          label: entry.automation.label.slice(0, 120),
          href:
            typeof entry.automation.href === "string"
              ? entry.automation.href.slice(0, 160)
              : undefined,
        }
      : undefined;

  return {
    title: entry.title.trim().slice(0, 200),
    objective: entry.objective.trim().slice(0, 4000),
    route: entry.route as CommandPlan["route"],
    priority: entry.priority as CommandPlan["priority"],
    riskLevel: entry.riskLevel as CommandPlan["riskLevel"],
    owner:
      typeof entry.owner === "string" && entry.owner.trim()
        ? entry.owner.trim().slice(0, 120)
        : undefined,
    checklist: entry.checklist
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .slice(0, 12)
      .map((item) => item.trim().slice(0, 240)),
    acceptanceCriteria: entry.acceptanceCriteria
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .slice(0, 8)
      .map((item) => item.trim().slice(0, 240)),
    suggestedNextStep: entry.suggestedNextStep.trim().slice(0, 300),
    automation,
    detailsMarkdown: entry.detailsMarkdown.trim().slice(0, 6000),
  };
}

function transitionHumanTask(task: HumanTask, nextStatus: HumanTaskStatus, now = new Date().toISOString()): HumanTask {
  if (task.status === nextStatus) {
    return { ...task, updatedAt: now };
  }
  if (!HUMAN_TASK_TRANSITIONS[task.status].includes(nextStatus)) {
    throw new Error(`Invalid task transition: ${task.status} -> ${nextStatus}`);
  }
  return {
    ...task,
    status: nextStatus,
    updatedAt: now,
    completedAt: nextStatus === "done" ? task.completedAt || now : undefined,
  };
}

interface ProjectRequestSpec {
  name: string;
  slug: string;
  stack: string;
  features: string[];
  requestedPath: string;
  projectPath: string;
  notes?: string;
}

interface ProjectRequest {
  id: string;
  status: "draft" | "approved" | "created" | "error";
  source: string;
  requestedBy?: string;
  chatId?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  executedAt?: string;
  summary: string;
  spec: ProjectRequestSpec;
  createdFiles?: string[];
  error?: string;
}

type TelegramInlineButton = SharedInlineButton;
type TelegramInlineKeyboardMarkup = SharedInlineKeyboardMarkup;

type OpenRouterCatalogEntry = {
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
};

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

let openrouterCatalogCache:
  | {
      loadedAt: number;
      models: OpenRouterCatalogEntry[];
    }
  | undefined;

function normalizeOpenRouterMediaList(value: string): Array<"text" | "image" | "video"> {
  const media = new Set<"text" | "image" | "video">();
  if (value.includes("text")) {
    media.add("text");
  }
  if (value.includes("image")) {
    media.add("image");
  }
  if (value.includes("video")) {
    media.add("video");
  }
  if (media.size === 0) {
    media.add("text");
  }
  return Array.from(media);
}

function normalizeOpenRouterModalities(modality: unknown) {
  const value = typeof modality === "string" ? modality.toLowerCase() : "";
  const [inputPart = "text", outputPart = "text"] = value.split("->", 2);
  const input = normalizeOpenRouterMediaList(inputPart);
  const output = normalizeOpenRouterMediaList(outputPart);
  const capabilities = new Set<OpenRouterCatalogEntry["capabilities"][number]>(["text"]);
  if (input.includes("image") || input.includes("video")) {
    capabilities.add("vision");
  }
  if (input.includes("video")) {
    capabilities.add("video_understanding");
  }
  if (output.includes("image")) {
    capabilities.add("image_generation");
  }
  if (output.includes("video")) {
    capabilities.add("video_generation");
  }
  return { input, output, capabilities: Array.from(capabilities) };
}

function parseOpenRouterCatalogEntry(model: any): OpenRouterCatalogEntry | null {
  const id = typeof model?.id === "string" ? model.id.trim() : "";
  if (!id) {
    return null;
  }
  const name = typeof model?.name === "string" ? model.name.trim() : id;
  const modality =
    typeof model?.architecture?.modality === "string"
      ? model.architecture.modality.trim()
      : typeof model?.modality === "string"
        ? model.modality.trim()
        : undefined;
  const contextWindow =
    typeof model?.context_length === "number" && Number.isFinite(model.context_length)
      ? model.context_length
      : undefined;
  const maxTokens =
    typeof model?.top_provider?.max_completion_tokens === "number" &&
    Number.isFinite(model.top_provider.max_completion_tokens)
      ? model.top_provider.max_completion_tokens
      : typeof model?.max_completion_tokens === "number" &&
          Number.isFinite(model.max_completion_tokens)
        ? model.max_completion_tokens
        : typeof model?.max_output_tokens === "number" && Number.isFinite(model.max_output_tokens)
          ? model.max_output_tokens
          : undefined;
    const provider = id.includes("/") ? id.slice(0, id.indexOf("/")) : "openrouter";
    const modalities = normalizeOpenRouterModalities(modality);
    return {
      id,
      name,
      provider,
      modality,
      input: modalities.input,
      output: modalities.output,
      capabilities: modalities.capabilities,
      reasoning: Array.isArray(model?.supported_parameters)
        ? model.supported_parameters.includes("reasoning")
        : false,
    contextWindow,
    maxTokens,
  };
}

async function loadOpenRouterCatalog(): Promise<OpenRouterCatalogEntry[]> {
  const now = Date.now();
  if (openrouterCatalogCache && now - openrouterCatalogCache.loadedAt < OPENROUTER_CATALOG_TTL_MS) {
    return openrouterCatalogCache.models;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, { signal: controller.signal });
    if (!response.ok) {
      return openrouterCatalogCache?.models ?? [];
    }
    const data = (await response.json()) as { data?: unknown[] };
    const models = Array.isArray(data.data)
      ? data.data
          .map((item) => parseOpenRouterCatalogEntry(item))
          .filter((item): item is OpenRouterCatalogEntry => Boolean(item))
          .sort((a, b) => {
            const provider = a.provider.localeCompare(b.provider);
            if (provider !== 0) {
              return provider;
            }
            const name = a.name.localeCompare(b.name);
            if (name !== 0) {
              return name;
            }
            return a.id.localeCompare(b.id);
          })
      : [];
    openrouterCatalogCache = { loadedAt: now, models };
    return models;
  } catch {
    return openrouterCatalogCache?.models ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

interface TelegramReplyKeyboardMarkup {
  keyboard: string[][];
  resize_keyboard?: boolean;
  is_persistent?: boolean;
  one_time_keyboard?: boolean;
}

type TelegramReplyMarkup = TelegramReplyKeyboardMarkup | TelegramInlineKeyboardMarkup;

interface ParsedTelegramCommand {
  name: string;
  args: string;
}

type ToolRiskLevel = "low" | "medium" | "high";

const EMPTY_TOKEN_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

const TELEGRAM_MESSAGE_LIMIT = 3800;
const TELEGRAM_INPUT_LIMIT = 2000;
const TELEGRAM_COMMAND_ARG_LIMIT = 1000;
const TELEGRAM_RATE_LIMIT_WINDOW_MS = 15_000;
const TELEGRAM_RATE_LIMIT_MAX_MESSAGES = 6;
const TELEGRAM_RATE_LIMIT_COOLDOWN_MS = 20_000;
const ENABLE_TEST_ROUTES = envValue("WINGS_OF_WORLD_ENABLE_TEST_ROUTES", "WINGS_ENABLE_TEST_ROUTES") === "1";
const TELEGRAM_REPLY_KEYBOARD: TelegramReplyKeyboardMarkup = {
  keyboard: [
    ["🏠 Menu", "🌊 Workflows", "🧠 Status"],
    ["📊 Usage", "⚙️ Model", "📝 Memory"],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

function buildTelegramMainMenu(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🤖 Chat with AI", callback_data: "tg:menu:chat" },
        { text: "🌊 Workflows", callback_data: "tg:menu:workflows" }
      ],
      [
        { text: "⚡ Macros", callback_data: "tg:menu:macros" },
        { text: "🛠️ Tools", callback_data: "tg:menu:tools" }
      ],
      [
        { text: "🧠 Agents", callback_data: "tg:menu:agents" },
        { text: "📝 Memory", callback_data: "tg:menu:memory" }
      ],
      [
        { text: "📊 Analytics", callback_data: "tg:menu:usage" },
        { text: "⚙️ Settings", callback_data: "tg:menu:settings" }
      ]
    ]
  };
}

function buildTelegramMacroMenu(): TelegramInlineKeyboardMarkup {
  const macros = loadMacros();
  const buttons = macros.slice(0, 8).map(m => ([{
    text: `⚡ ${m.name}`,
    callback_data: `tg:macro:run:${m.name}`
  }]));
  
  if (buttons.length === 0) {
    buttons.push([{ text: "No Macros Saved", callback_data: "tg:menu:noop" }]);
  }
  
  buttons.push([{ text: "⬅️ Back to Menu", callback_data: "tg:menu:main" }]);
  
  return { inline_keyboard: buttons };
}

function buildTelegramWorkflowMenu(workflows: any[]): TelegramInlineKeyboardMarkup {
  const buttons = workflows.slice(0, 10).map(wf => ([{
    text: `⚡ ${wf.name || "Untitled"}`,
    callback_data: `tg:wf:run:${wf.id}`
  }]));
  
  buttons.push([{ text: "⬅️ Back to Menu", callback_data: "tg:menu:main" }]);
  
  return { inline_keyboard: buttons };
}

type TelegramModelPreset = SharedTelegramModelPreset;
const TELEGRAM_MODEL_PRESETS = DEFAULT_TELEGRAM_MODEL_PRESETS;

const TELEGRAM_RECENT_ACTIVITY = new Map<string, number[]>();
const TELEGRAM_RATE_LIMIT_UNTIL = new Map<string, number>();
const TELEGRAM_POLLER_INSTANCE_ID = `telegram_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
const TELEGRAM_LOCK_STALE_MS = 90_000;

const SKILL_CATALOG: SkillDefinition[] = [
  {
    id: "operator",
    title: "Operator",
    summary: "Respond like a production operator: concise, status-aware, action-first.",
    whenToUse: "Use for runtime health, incident handling, status summaries, and operational answers.",
    systemPrompt:
      "Operate like a production systems operator. Prioritize current state, risks, mitigations, and next actions. Keep answers concise, concrete, and execution-oriented.",
    telegramEnabled: true,
  },
  {
    id: "builder",
    title: "Builder",
    summary: "Bias toward implementation, system design, and concrete build steps.",
    whenToUse: "Use for feature planning, implementation tasks, refactors, and architecture decisions.",
    systemPrompt:
      "Act like a senior builder. Produce implementation-ready guidance, explicit tradeoffs, and the most direct path to a working result.",
    telegramEnabled: true,
  },
  {
    id: "reviewer",
    title: "Reviewer",
    summary: "Bias toward bug finding, regression detection, and quality review.",
    whenToUse: "Use for code review, risk review, failure analysis, and validation planning.",
    systemPrompt:
      "Act like a rigorous reviewer. Prioritize bugs, risks, regressions, missing tests, and weak assumptions before summaries or suggestions.",
    telegramEnabled: true,
  },
  {
    id: "memory_curator",
    title: "Memory Curator",
    summary: "Bias toward extracting durable knowledge and reusable memory.",
    whenToUse: "Use when turning chat output into reusable notes, summaries, decisions, or long-lived context.",
    systemPrompt:
      "Act like a memory curator. Emphasize durable facts, preferences, decisions, reusable summaries, and what should be saved to memory.",
    telegramEnabled: true,
  },
  {
    id: "workflow_designer",
    title: "Workflow Designer",
    summary: "Bias toward turning goals into reusable workflows and automation.",
    whenToUse: "Use when designing steps, triggers, nodes, guardrails, or automation flows.",
    systemPrompt:
      "Act like a workflow designer. Prefer reusable structured steps, clear inputs and outputs, failure handling, and automation-friendly formats.",
    telegramEnabled: true,
  },
];

const PROMPT_TEMPLATES: PromptTemplateDefinition[] = [
  {
    id: "incident_triage",
    title: "Incident Triage",
    description: "Structure an incident update with impact, likely cause, mitigation, and next action.",
    template:
      "Analyze this issue like a production incident.\n\nIssue:\n{{topic}}\n\nReturn:\n1. Impact\n2. Likely cause\n3. Immediate mitigation\n4. Next verification step",
    suggestedSkills: ["operator", "reviewer"],
    telegramEnabled: true,
  },
  {
    id: "release_readiness",
    title: "Release Readiness",
    description: "Review whether a change is safe to ship and what is still missing.",
    template:
      "Assess release readiness for this change.\n\nChange:\n{{topic}}\n\nReturn:\n1. What is ready\n2. What is risky\n3. Missing tests or checks\n4. Ship / no-ship recommendation",
    suggestedSkills: ["reviewer", "operator"],
    telegramEnabled: true,
  },
  {
    id: "workflow_blueprint",
    title: "Workflow Blueprint",
    description: "Turn a goal into a reusable workflow with nodes, inputs, outputs, and guardrails.",
    template:
      "Design a reusable workflow for this goal:\n{{topic}}\n\nReturn:\n1. Trigger\n2. Processing nodes\n3. Tools or skills needed\n4. Failure handling\n5. Final output contract",
    suggestedSkills: ["workflow_designer", "builder"],
    telegramEnabled: true,
  },
  {
    id: "memory_distill",
    title: "Memory Distill",
    description: "Extract durable memory items from a conversation, decision, or result.",
    template:
      "Distill durable memory from this content:\n{{topic}}\n\nReturn only:\n- Facts worth keeping\n- Preferences\n- Decisions\n- Follow-up items worth tracking",
    suggestedSkills: ["memory_curator"],
    telegramEnabled: true,
  },
];

function estimateTokens(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function estimateMessageTokens(messages: ChatMessage[]) {
  return messages.reduce(
    (sum, message) => sum + estimateTokens(message.content) + 4,
    0,
  );
}

function normalizeTokenUsage(input: any): TokenUsage {
  const promptTokens =
    typeof input?.promptTokens === "number" && Number.isFinite(input.promptTokens)
      ? Math.max(0, Math.round(input.promptTokens))
      : typeof input?.input_tokens === "number" && Number.isFinite(input.input_tokens)
        ? Math.max(0, Math.round(input.input_tokens))
        : typeof input?.prompt_tokens === "number" && Number.isFinite(input.prompt_tokens)
          ? Math.max(0, Math.round(input.prompt_tokens))
          : 0;
  const completionTokens =
    typeof input?.completionTokens === "number" && Number.isFinite(input.completionTokens)
      ? Math.max(0, Math.round(input.completionTokens))
      : typeof input?.output_tokens === "number" && Number.isFinite(input.output_tokens)
        ? Math.max(0, Math.round(input.output_tokens))
        : typeof input?.completion_tokens === "number" &&
            Number.isFinite(input.completion_tokens)
          ? Math.max(0, Math.round(input.completion_tokens))
          : 0;
  const totalTokens =
    typeof input?.totalTokens === "number" && Number.isFinite(input.totalTokens)
      ? Math.max(0, Math.round(input.totalTokens))
      : typeof input?.total_tokens === "number" && Number.isFinite(input.total_tokens)
        ? Math.max(0, Math.round(input.total_tokens))
        : promptTokens + completionTokens;

  return {
    promptTokens,
    completionTokens,
    totalTokens: Math.max(totalTokens, promptTokens + completionTokens),
  };
}

function estimateUsageFromMessages(
  messages: ChatMessage[],
  completion = "",
): TokenUsage {
  const promptTokens = estimateMessageTokens(messages);
  const completionTokens = estimateTokens(completion);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function addTokenUsage(...entries: Array<TokenUsage | undefined | null>): TokenUsage {
  return entries.reduce<TokenUsage>(
    (sum, current) => ({
      promptTokens: sum.promptTokens + (current?.promptTokens || 0),
      completionTokens: sum.completionTokens + (current?.completionTokens || 0),
      totalTokens: sum.totalTokens + (current?.totalTokens || 0),
    }),
    { ...EMPTY_TOKEN_USAGE },
  );
}

function formatTokenUsage(usage?: TokenUsage) {
  if (!usage) return "0 tokens";
  return `${usage.totalTokens} tokens (${usage.promptTokens} prompt / ${usage.completionTokens} completion)`;
}

function getModelRatePer1KTokens(model?: string, pricingOverrides?: Record<string, number>) {
  const name = (model || "").toLowerCase();
  if (!name) return 0;
  const override = Object.entries(pricingOverrides || {}).find(
    ([key]) => key.trim().toLowerCase() === name,
  );
  if (override) return Number(override[1]) || 0;
  if (name.includes("gpt-5.4")) return 0.012;
  if (name.includes("gpt-5") && name.includes("codex")) return 0.015;
  if (name.includes("gpt-5")) return 0.013;
  if (name.includes("gpt-4.1-mini")) return 0.0006;
  if (name.includes("gpt-4.1")) return 0.008;
  if (name.includes("gpt-4o-mini")) return 0.0009;
  if (name.includes("gpt-4o")) return 0.01;
  if (name.includes("o4-mini")) return 0.0033;
  if (name.includes("o3")) return 0.06;
  // Anthropic
  if (name.includes("claude-opus-4")) return 0.045;
  if (name.includes("claude-sonnet-4") || name.includes("claude-3.7-sonnet")) return 0.009;
  if (name.includes("claude-3-5-sonnet")) return 0.009;
  if (name.includes("claude-haiku-4") || name.includes("claude-3-5-haiku")) return 0.0012;
  // DeepSeek
  if (name.includes("deepseek-v4-pro")) return 0.0026;
  if (name.includes("deepseek-v4-flash")) return 0.00021;
  if (name.includes("deepseek-r1") || name.includes("deepseek-reasoner")) return 0.0022;
  if (name.includes("deepseek-chat") || name.includes("deepseek-v3")) return 0.00035;
  // Groq
  if (name.includes("llama-3.3-70b")) return 0.00059;
  if (name.includes("llama-3.1-8b")) return 0.00005;
  if (name.includes("mixtral-8x7b")) return 0.00024;
  if (name.includes("gemma2-9b")) return 0.0002;
  // Google Gemini
  if (name.includes("gemini-2.5-pro")) return 0.00875;
  if (name.includes("gemini-2.0-flash")) return 0.0005;
  if (name.includes("gemini-1.5-pro")) return 0.00875;
  if (name.includes("gemini-1.5-flash")) return 0.0005;
  // Gemma open-weight (free tier on OpenRouter / Google AI Studio)
  if (name.includes("gemma-4-26b") || name.includes("gemma-4-26b-a4b-it")) return 0;
  if (name.includes("gemma-3") || name.includes("gemma2")) return 0.0002;
  // Z.ai GLM
  if (name.includes("glm-5.1") || name.includes("glm-5")) return 0.0008;
  if (name.includes("glm-4.6")) return 0.0006;
  if (name.includes("glm-4.5")) return 0.0005;
  // Qwen (Alibaba) — listed pricing for OpenRouter / DashScope tiers.
  if (name.includes("qwen3.6-plus")) return 0.0024;
  if (name.includes("qwen3-max")) return 0.012;
  if (name.includes("qwen3") && name.includes("coder")) return 0.001;
  if (name.includes("qwen3")) return 0.0006;
  if (name.includes("qwen2.5")) return 0.0004;
  // Moonshot Kimi
  if (name.includes("kimi-k2.6") || name.includes("kimi-k2")) return 0.0017;
  if (name.includes("kimi")) return 0.0012;
  // Meta / Mistral via OpenRouter
  if (name.includes("llama-4-maverick")) return 0.0006;
  if (name.includes("llama-4-scout")) return 0.0003;
  if (name.includes("mistral-large")) return 0.006;
  if (name.includes("codestral")) return 0.003;
  if (name.includes("llama")) return 0;
  return 0;
}

function estimateCostUsd(
  model: string | undefined,
  usage?: TokenUsage,
  pricingOverrides?: Record<string, number>,
) {
  if (!usage?.totalTokens) return 0;
  const rate = getModelRatePer1KTokens(model, pricingOverrides);
  if (!rate) return 0;
  return Number(((usage.totalTokens / 1000) * rate).toFixed(6));
}

function formatCostUsd(cost = 0) {
  if (!cost) return "$0.000000";
  return `$${cost.toFixed(6)}`;
}

interface GeneratedImageRecord {
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

const GENERATED_IMAGE_HISTORY_LIMIT = 100;
const IMAGE_SIZE_OPTIONS = new Set(["1024x1024", "1024x1536", "1536x1024"]);
const IMAGE_QUALITY_OPTIONS = new Set(["auto", "low", "medium", "high"]);

function ensureGeneratedImagesDir() {
  ensureDataDir();
  if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
    fs.mkdirSync(GENERATED_IMAGES_DIR, { recursive: true });
  }
}

function loadGeneratedImages(): GeneratedImageRecord[] {
  ensureDataDir();
  if (!fs.existsSync(GENERATED_IMAGES_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(GENERATED_IMAGES_FILE, "utf-8"));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((entry) => entry && typeof entry === "object")
      .map((entry: any) => ({
        id: String(entry.id || ""),
        prompt: String(entry.prompt || ""),
        model: String(entry.model || ""),
        size: String(entry.size || ""),
        quality: String(entry.quality || "auto"),
        mimeType: String(entry.mimeType || "image/png"),
        filename: String(entry.filename || ""),
        url: String(entry.url || ""),
        bytes: Number.isFinite(entry.bytes) ? Number(entry.bytes) : 0,
        createdAt:
          typeof entry.createdAt === "string" && entry.createdAt.trim()
            ? entry.createdAt
            : new Date(0).toISOString(),
        revisedPrompt:
          typeof entry.revisedPrompt === "string" && entry.revisedPrompt.trim()
            ? entry.revisedPrompt
            : undefined,
      }))
      .filter((entry: GeneratedImageRecord) => entry.id && entry.filename && entry.prompt);
  } catch {
    return [];
  }
}

function saveGeneratedImages(entries: GeneratedImageRecord[]) {
  ensureDataDir();
  writeJsonSync(GENERATED_IMAGES_FILE, entries.slice(0, GENERATED_IMAGE_HISTORY_LIMIT), { mode: 0o600 });
}

function normalizeImageSize(value: unknown) {
  const size = typeof value === "string" && value.trim() ? value.trim() : "1024x1024";
  if (!IMAGE_SIZE_OPTIONS.has(size)) {
    throw new Error(`Unsupported image size "${size}". Use 1024x1024, 1024x1536, or 1536x1024.`);
  }
  return size;
}

function normalizeImageQuality(value: unknown) {
  const quality = typeof value === "string" && value.trim() ? value.trim() : "auto";
  if (!IMAGE_QUALITY_OPTIONS.has(quality)) {
    throw new Error(`Unsupported image quality "${quality}". Use auto, low, medium, or high.`);
  }
  return quality;
}

function extensionForMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  return "png";
}

function isSafeGeneratedImageFilename(filename: string) {
  return /^img_[a-z0-9_]+\.(png|jpg|jpeg|webp)$/i.test(filename);
}

async function generateImage(args: Record<string, unknown>): Promise<GeneratedImageRecord> {
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  if (prompt.length < 3) {
    throw new Error("prompt must be at least 3 characters.");
  }
  if (prompt.length > 4000) {
    throw new Error("prompt is too long. Keep image prompts under 4000 characters.");
  }

  const cfg = loadConfig();
  const model =
    typeof args.model === "string" && args.model.trim()
      ? args.model.trim()
      : process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const size = normalizeImageSize(args.size);
  const quality = normalizeImageQuality(args.quality);
  rejectRequestImageBaseUrl(args.baseURL);
  const baseURL = cfg.baseURL || DEFAULT_CONFIG.baseURL;
  const parsedBase = parseBaseUrl(baseURL);
  if (!parsedBase || !["http:", "https:"].includes(parsedBase.protocol)) {
    throw new Error("Image generation requires an HTTP(S) OpenAI-compatible Base URL.");
  }
  if (cfg.provider === "anthropic" || cfg.provider === "codex_local" || cfg.provider === "azure") {
    throw new Error("Image generation requires OpenAI or a custom OpenAI-compatible image endpoint in Settings.");
  }

  const apiKey = cfg.apiKey || process.env.OPENAI_API_KEY || "";
  if (isApiKeyRequired({ ...cfg, baseURL }) && !apiKey) {
    throw new Error("OpenAI API key is required for image generation. Add it in Settings first.");
  }

  const body: Record<string, unknown> = {
    model,
    prompt,
    size,
    n: 1,
  };
  if (quality !== "auto") {
    body.quality = quality;
  }

  const response = await fetch(`${baseURL.replace(/\/$/, "")}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Image provider ${response.status}: ${text.slice(0, 500) || response.statusText}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Image provider returned non-JSON: ${text.slice(0, 200)}`);
  }
  const first = Array.isArray(data?.data) ? data.data[0] : null;
  if (!first) {
    throw new Error("Image provider returned no image data.");
  }

  let bytes: Buffer;
  let mimeType = "image/png";
  if (typeof first.b64_json === "string" && first.b64_json.trim()) {
    bytes = Buffer.from(first.b64_json, "base64");
  } else if (typeof first.url === "string" && first.url.trim()) {
    const downloaded = await downloadGeneratedImageUrl(first.url);
    bytes = downloaded.bytes;
    mimeType = downloaded.mimeType;
  } else {
    throw new Error("Image provider returned neither b64_json nor url.");
  }

  if (!bytes.length) {
    throw new Error("Image provider returned an empty image.");
  }

  ensureGeneratedImagesDir();
  const id = `img_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const filename = `${id}.${extensionForMimeType(mimeType)}`;
  const filePath = path.join(GENERATED_IMAGES_DIR, filename);
  fs.writeFileSync(filePath, bytes);

  const record: GeneratedImageRecord = {
    id,
    prompt,
    model,
    size,
    quality,
    mimeType,
    filename,
    url: `/api/images/file/${encodeURIComponent(filename)}`,
    bytes: bytes.length,
    createdAt: new Date().toISOString(),
    revisedPrompt:
      typeof first.revised_prompt === "string" && first.revised_prompt.trim()
        ? first.revised_prompt
        : undefined,
  };
  const existing = loadGeneratedImages();
  saveGeneratedImages([record, ...existing.filter((entry) => entry.id !== id)]);
  return record;
}

interface ToolDefinition {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  requiresConfirmation?: boolean;
  parameters: Record<string, unknown>;
}

const TOOL_DEFINITIONS: ToolDefinition[] = ([
  {
    name: "calculator",
    description: "Evaluate a basic math expression safely.",
    riskLevel: "low",
    parameters: {
      expression: "string",
    },
  },
  {
    name: "list_directory",
    description:
      "List files and folders under an allowed workspace path in Wings Of World or local_ai_system.",
    riskLevel: "low",
    parameters: {
      path: "string",
    },
  },
  {
    name: "read_file",
    description:
      "Read a UTF-8 text file from an allowed workspace path in Wings Of World or local_ai_system.",
    riskLevel: "low",
    parameters: {
      path: "string",
      maxBytes: "number?",
    },
  },
  {
    name: "search_files",
    description:
      "Search for text recursively under an allowed workspace path using ripgrep.",
    riskLevel: "medium",
    parameters: {
      pattern: "string",
      path: "string?",
    },
  },
  {
    name: "write_file",
    description:
      "Write or overwrite a UTF-8 file under an allowed workspace path. Confirmation required.",
    riskLevel: "medium",
    requiresConfirmation: true,
    parameters: {
      path: "string",
      content: "string",
    },
  },
  {
    name: "web_search",
    description:
      "Search the web using DuckDuckGo. Returns titles, URLs, and snippets for the top results. No API key required.",
    riskLevel: "low",
    parameters: {
      query: "string",
      count: "number?",
    },
  },
  {
    name: "hermes_execute",
    description:
      "Delegate a complex task to the Hermes Super-Agent. Use this for deep reasoning, multi-step coding, or autonomous research that requires more than simple chat.",
    riskLevel: "high",
    requiresConfirmation: true,
    parameters: {
      task: "string",
    },
  },
  {
    name: "run_macro",
    description:
      "Execute an autonomous macro loop to perform multi-step system tasks (read files, run commands) using local AI while saving tokens by focusing on current state only.",
    riskLevel: "high",
    requiresConfirmation: true,
    parameters: {
      task: "string",
    },
  },
  {
    name: "remember_to_obsidian",
    description: "Save deep knowledge, project insights, or important notes into the permanent Obsidian vault in D:\\MEMORY\\Knowledge.",
    riskLevel: "low",
    parameters: {
      title: "string",
      content: "string",
      category: "string?"
    }
  },
  {
    name: "search_knowledge",
    description: "Search and retrieve information from your permanent knowledge base in D:\\MEMORY. Use this to recall past projects, notes, or deep insights.",
    riskLevel: "low",
    parameters: {
      query: "string"
    }
  },
  {
    name: "brave_search",
    description:
      "Search the web using Brave Search API. Supports country/language/time filters. Requires Brave API key configured in Settings.",
    riskLevel: "low",
    parameters: {
      query: "string",
      count: "number?",
      country: "string?",
      freshness: "string?",
    },
  },
  {
    name: "web_fetch",
    description:
      "Fetch a URL and return clean readable content (title, byline, main article text in markdown). Uses Mozilla Readability to strip nav/ads/sidebars. Use after web_search to read the actual page content. Refuses private/loopback hosts.",
    riskLevel: "low",
    parameters: {
      url: "string",
      maxChars: "number?",
    },
  },
  {
    name: "extract_document",
    description:
      "Extract text from a local document file (PDF, .txt, .md, .json, .csv). PDFs use pdfjs-dist for text-only extraction (no images). Returns clean text plus page count. The path must live under an allowed Wings Of World workspace.",
    riskLevel: "low",
    parameters: {
      path: "string",
      pageRange: "string?",
      maxChars: "number?",
    },
  },
  {
    name: "tavily_search",
    description:
      "Search the web with Tavily — an LLM-tuned search API that returns ranked results plus an optional synthesised answer string. Requires Tavily API key in Settings. Use this when the question needs fresh, well-curated sources rather than raw HTML.",
    riskLevel: "low",
    parameters: {
      query: "string",
      maxResults: "number?",
      topic: "string?",
      timeRange: "string?",
      includeAnswer: "boolean?",
    },
  },
  {
    name: "generate_image",
    description:
      "Generate an image from a text prompt using the configured OpenAI Images API or compatible image endpoint. Saves the result under the local Wings Of World data directory and returns an authenticated image URL.",
    riskLevel: "medium",
    parameters: {
      prompt: "string",
      model: "string?",
      size: "string?",
      quality: "string?",
    },
  },
] as ToolDefinition[]).map(applyToolSecurityPolicy);

// === Agentic tool-calling: schema conversion ===

function toolParamsToJsonSchema(params: Record<string, unknown>): {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, spec] of Object.entries(params)) {
    const specStr = String(spec);
    const optional = specStr.endsWith("?");
    const typeName = optional ? specStr.slice(0, -1) : specStr;
    properties[key] = { type: typeName === "number" ? "number" : typeName === "boolean" ? "boolean" : "string" };
    if (!optional) required.push(key);
  }
  return { type: "object", properties, required };
}

function toolDefToOpenAI(tool: ToolDefinition) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toolParamsToJsonSchema(tool.parameters),
    },
  };
}

function toolDefToAnthropic(tool: ToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: toolParamsToJsonSchema(tool.parameters),
  };
}

function getAgenticToolDefinitions(): ToolDefinition[] {
  // Only expose non-confirmation-required tools to the agent for autonomous use.
  return TOOL_DEFINITIONS.filter(canUseToolAgentically);
}

function findToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((entry) => entry.name === name);
}

function assertToolConfirmation(
  name: string,
  options: { confirmed?: boolean } = {},
) {
  const tool = findToolDefinition(name);
  if (tool && toolRequiresConfirmation(tool) && options.confirmed !== true) {
    throw new Error(`Tool "${name}" requires confirm=true before execution.`);
  }
}

type AgenticToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

type AgenticTrace = {
  step: number;
  type: "tool_call" | "tool_result" | "assistant";
  name?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  content?: string;
  tookMs?: number;
};

const MAX_AGENT_ITERATIONS = 6;

const TOOL_RESULT_CHAR_CAP = BUDGET_TOOL_RESULT_CHAR_CAP;
const smartTruncateToolResult = budgetSmartTruncateToolResult;

async function runAgenticLoopOpenAI(
  cfg: AppConfig,
  messages: ChatMessage[],
  modelOverride?: string,
  onProgress?: (status: string) => void,
): Promise<{
  content: string;
  usage: TokenUsage;
  trace: AgenticTrace[];
  providerMeta: { provider: string; model: string; apiMode: string; usedFallback: boolean; baseURL: string };
}> {
  const lastUserMsg = messages[messages.length - 1]?.content || "";
  // ⚡ Fast Path: Bypass agentic loop for simple greetings or short chat
  const isSimpleChat = messages.length < 10 && lastUserMsg.length < 50 && !/(รัน|ทำ|หา|execute|search|read|file)/i.test(lastUserMsg);
  
  const tools = getAgenticToolDefinitions().map(toolDefToOpenAI);
  const conversation: any[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const trace: AgenticTrace[] = [];
  const aggregateUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const url = `${cfg.baseURL.replace(/\/$/, "")}/chat/completions`;
  const model = modelOverride || cfg.model;

  const maxSteps = isSimpleChat ? 1 : MAX_AGENT_ITERATIONS;

  for (let step = 0; step < maxSteps; step++) {
    const currentStep = step + 1;
    if (onProgress) onProgress(`🧠 Thinking (Step ${currentStep}/${maxSteps})...`);

    const body = {
      model,
      messages: conversation,
      tools: isSimpleChat ? undefined : (tools.length > 0 ? tools : undefined),
      tool_choice: isSimpleChat ? undefined : (tools.length > 0 ? "auto" : undefined),
      temperature: isSimpleChat ? 0.7 : 0.2,
      // 🚀 GPU VRAM & Performance Boost for Ollama
      num_ctx: 8192,
      num_predict: 2048,
      num_thread: 12, // Increase threads for faster pre-processing
    };
// ... rest of logic remains but reports progress on tool calls

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Upstream ${res.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    if (data?.usage) {
      const u = normalizeTokenUsage(data.usage);
      aggregateUsage.promptTokens += u.promptTokens;
      aggregateUsage.completionTokens += u.completionTokens;
      aggregateUsage.totalTokens += u.totalTokens;
    }
    const choice = data?.choices?.[0];
    const msg = choice?.message;
    const toolCalls = msg?.tool_calls as Array<{ id: string; type: string; function: { name: string; arguments: string } }> | undefined;

    if (!toolCalls || toolCalls.length === 0) {
      const content = msg?.content ?? "";
      trace.push({ step, type: "assistant", content });
      return {
        content,
        usage: aggregateUsage,
        trace,
        providerMeta: {
          provider: cfg.provider,
          model,
          apiMode: getApiMode(cfg),
          usedFallback: false,
          baseURL: cfg.baseURL,
        },
      };
    }

    conversation.push({
      role: "assistant",
      content: msg?.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = {}; }
      trace.push({ step, type: "tool_call", name: call.function.name, arguments: args });
      const t0 = Date.now();
      let result: unknown;
      let errMsg: string | undefined;
      try {
        result = await executeToolWithCache(call.function.name, args);
      } catch (err: any) {
        errMsg = err?.message || String(err);
        result = { error: errMsg };
      }
      trace.push({
        step,
        type: "tool_result",
        name: call.function.name,
        result,
        error: errMsg,
        tookMs: Date.now() - t0,
      });
      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: smartTruncateToolResult(result),
      });
    }
  }

  const fallbackContent = "[Agent stopped: maximum tool iterations reached.]";
  trace.push({ step: MAX_AGENT_ITERATIONS, type: "assistant", content: fallbackContent });
  return {
    content: fallbackContent,
    usage: aggregateUsage,
    trace,
    providerMeta: {
      provider: cfg.provider,
      model,
      apiMode: getApiMode(cfg),
      usedFallback: false,
      baseURL: cfg.baseURL,
    },
  };
}

async function runAgenticLoopAnthropic(
  cfg: AppConfig,
  messages: ChatMessage[],
  modelOverride?: string,
): Promise<{
  content: string;
  usage: TokenUsage;
  trace: AgenticTrace[];
  providerMeta: { provider: string; model: string; apiMode: string; usedFallback: boolean; baseURL: string };
}> {
  if (!cfg.apiKey) throw new Error("Anthropic API key is not configured.");
  const systemMsg = messages.find((m) => m.role === "system")?.content;
  const conv: any[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  if (conv.length === 0 || conv[0].role !== "user") conv.unshift({ role: "user", content: "Hello" });

  const tools = getAgenticToolDefinitions().map(toolDefToAnthropic);
  const trace: AgenticTrace[] = [];
  const aggregateUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const effectiveBase =
    cfg.baseURL && cfg.baseURL.trim() && !cfg.baseURL.includes("api.openai.com")
      ? cfg.baseURL.replace(/\/$/, "")
      : `${ANTHROPIC_BASE_URL}/v1`;
  const endpoint = effectiveBase.endsWith("/messages") ? effectiveBase : `${effectiveBase}/messages`;
  const model = modelOverride || cfg.model || ANTHROPIC_DEFAULT_MODEL;

  for (let step = 0; step < MAX_AGENT_ITERATIONS; step++) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: conv,
      tools,
    };
    if (systemMsg) body.system = systemMsg;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    aggregateUsage.promptTokens += data?.usage?.input_tokens ?? 0;
    aggregateUsage.completionTokens += data?.usage?.output_tokens ?? 0;
    aggregateUsage.totalTokens += (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0);

    const blocks = Array.isArray(data?.content) ? data.content : [];
    const toolUses = blocks.filter((b: any) => b?.type === "tool_use");
    const textParts = blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("");

    if (toolUses.length === 0 || data?.stop_reason !== "tool_use") {
      trace.push({ step, type: "assistant", content: textParts });
      return {
        content: textParts,
        usage: aggregateUsage,
        trace,
        providerMeta: {
          provider: cfg.provider,
          model,
          apiMode: getApiMode(cfg),
          usedFallback: false,
          baseURL: cfg.baseURL,
        },
      };
    }

    conv.push({ role: "assistant", content: blocks });

    const toolResults: any[] = [];
    for (const use of toolUses) {
      const args = (use.input || {}) as Record<string, unknown>;
      trace.push({ step, type: "tool_call", name: use.name, arguments: args });
      const t0 = Date.now();
      let result: unknown;
      let errMsg: string | undefined;
      try {
        result = await executeToolWithCache(use.name, args);
      } catch (err: any) {
        errMsg = err?.message || String(err);
        result = { error: errMsg };
      }
      trace.push({ step, type: "tool_result", name: use.name, result, error: errMsg, tookMs: Date.now() - t0 });
      toolResults.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: smartTruncateToolResult(result),
        is_error: Boolean(errMsg),
      });
    }
    conv.push({ role: "user", content: toolResults });
  }

  const fallbackContent = "[Agent stopped: maximum tool iterations reached.]";
  trace.push({ step: MAX_AGENT_ITERATIONS, type: "assistant", content: fallbackContent });
  return {
    content: fallbackContent,
    usage: aggregateUsage,
    trace,
    providerMeta: {
      provider: cfg.provider,
      model,
      apiMode: getApiMode(cfg),
      usedFallback: false,
      baseURL: cfg.baseURL,
    },
  };
}

async function runAgenticLoop(
  cfg: AppConfig,
  messages: ChatMessage[],
  modelOverride?: string,
  onProgress?: (status: string) => void,
) {
  if (cfg.provider === "anthropic") return runAgenticLoopAnthropic(cfg, messages, modelOverride);
  if (cfg.provider === "codex_local") {
    onProgress?.(`Running Codex Local: ${modelOverride || cfg.model}`);
    const result = await callCodexLocal(cfg, messages, modelOverride);
    return {
      content: result.content,
      usage: result.usage,
      trace: [{ step: 0, type: "assistant" as const, content: result.content }],
      providerMeta: {
        provider: cfg.provider,
        model: modelOverride || cfg.model,
        apiMode: getApiMode(cfg),
        usedFallback: false,
        baseURL: cfg.baseURL,
      },
    };
  }
  return runAgenticLoopOpenAI(cfg, messages, modelOverride, onProgress);
}

const AGENT_CATALOG = [
  {
    role: "orchestrator",
    title: "Orchestrator",
    status: "ready",
    summary: "Routes work across Wings Of World capabilities and imported panels.",
  },
  {
    role: "planner",
    title: "Planner",
    status: "ready",
    summary: "Breaks complex requests into executable steps.",
  },
  {
    role: "researcher",
    title: "Researcher",
    status: "ready",
    summary: "Explores files, configs, and tool outputs for context.",
  },
  {
    role: "implementer",
    title: "Implementer",
    status: "ready",
    summary: "Focuses on code and configuration changes.",
  },
  {
    role: "reviewer",
    title: "Reviewer",
    status: "ready",
    summary: "Checks regressions, risks, and quality before rollout.",
  },
  {
    role: "memory_manager",
    title: "Memory Manager",
    status: "ready",
    summary: "Curates reusable notes and operational context.",
  },
];

function obsidianMemoryEnabled() {
  return fs.existsSync(OBSIDIAN_VAULT_PATH);
}

function ensureObsidianMemoryDir() {
  fs.mkdirSync(OBSIDIAN_MEMORY_DIR, { recursive: true });
}

function escapeFrontmatterValue(value: string) {
  return JSON.stringify(value);
}

function formatMemoryEntryAsObsidianNote(entry: MemoryEntry) {
  return `---
type: wings-memory
id: ${escapeFrontmatterValue(entry.id)}
memoryType: ${entry.memoryType}
source: ${escapeFrontmatterValue(entry.source)}
importanceScore: ${entry.importanceScore}
createdAt: ${escapeFrontmatterValue(entry.createdAt)}
updatedAt: ${escapeFrontmatterValue(entry.updatedAt)}
tags:
  - wings
  - memory
---

${entry.content}
`;
}

function parseObsidianMemoryNote(content: string): MemoryEntry | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = match[1];
  const body = match[2].trim();
  const map: Record<string, string> = {};

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.trim();
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }

  if (map.type !== "wings-memory" || !map.id || !body) {
    return null;
  }

  const memoryType =
    map.memoryType === "fact" ||
    map.memoryType === "preference" ||
    map.memoryType === "context" ||
    map.memoryType === "summary" ||
    map.memoryType === "insight"
      ? map.memoryType
      : "fact";

  return {
    id: map.id,
    content: body,
    memoryType,
    source: map.source || "obsidian",
    importanceScore: Number.isFinite(Number(map.importanceScore))
      ? Math.max(0, Math.min(1, Number(map.importanceScore)))
      : 0.5,
    createdAt: map.createdAt || new Date().toISOString(),
    updatedAt: map.updatedAt || new Date().toISOString(),
  };
}

function loadObsidianMemoryEntries(): MemoryEntry[] {
  ensureObsidianMemoryDir();
  return fs
    .readdirSync(OBSIDIAN_MEMORY_DIR)
    .filter((file) => file.toLowerCase().endsWith(".md"))
    .map((file) => {
      const content = fs.readFileSync(path.join(OBSIDIAN_MEMORY_DIR, file), "utf-8");
      return parseObsidianMemoryNote(content);
    })
    .filter((entry): entry is MemoryEntry => Boolean(entry))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function saveObsidianMemoryEntries(entries: MemoryEntry[]) {
  ensureObsidianMemoryDir();
  const wanted = new Set(entries.map((entry) => `${entry.id}.md`));

  for (const entry of entries) {
    fs.writeFileSync(
      path.join(OBSIDIAN_MEMORY_DIR, `${entry.id}.md`),
      formatMemoryEntryAsObsidianNote(entry),
      "utf-8",
    );
  }

  for (const file of fs.readdirSync(OBSIDIAN_MEMORY_DIR)) {
    if (file.toLowerCase().endsWith(".md") && !wanted.has(file)) {
      fs.unlinkSync(path.join(OBSIDIAN_MEMORY_DIR, file));
    }
  }
}

function loadMemoryEntries(): MemoryEntry[] {
  if (fs.existsSync(OBSIDIAN_VAULT_PATH)) {
    try {
      return loadObsidianMemoryEntries();
    } catch {
      // fall back to local json cache if the vault is temporarily unavailable
    }
  }
  ensureDataDir();
  if (!fs.existsSync(MEMORY_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

// Debounce auto-push to Hermes so a burst of memory writes only triggers a
// single sync call. Best-effort: failures are logged, never thrown.
let hermesAutoPushTimer: NodeJS.Timeout | null = null;
const HERMES_AUTO_PUSH_DEBOUNCE_MS = 1500;

function scheduleHermesAutoPush(entries: MemoryEntry[]) {
  if (hermesAutoPushTimer) clearTimeout(hermesAutoPushTimer);
  hermesAutoPushTimer = setTimeout(() => {
    hermesAutoPushTimer = null;
    try {
      const cfg = loadConfig();
      if (!cfg.hermesSyncEnabled) return;
      const env = cfg.hermesHomeOverride
        ? { ...process.env, HERMES_HOME: cfg.hermesHomeOverride }
        : process.env;
      const paths = describeHermesPaths(env);
      const db = ensureHermesDb(paths.dbPath);
      try {
        const stats = pushToHermes(db, entries as HermesWingsMemoryEntry[]);
        if (stats.inserted + stats.updated > 0) {
          logger.info({ stats, dbPath: paths.dbPath }, "hermes auto-push");
        }
      } finally {
        db.close();
      }
    } catch (err) {
      logger.warn({ err: (err as Error)?.message }, "hermes auto-push failed");
    }
  }, HERMES_AUTO_PUSH_DEBOUNCE_MS);
  hermesAutoPushTimer.unref?.();
}

function saveMemoryEntries(entries: MemoryEntry[]) {
  if (fs.existsSync(OBSIDIAN_VAULT_PATH)) {
    try {
      saveObsidianMemoryEntries(entries);
    } catch {
      // continue to json mirror below so memory writes do not fail hard
    }
  }
  ensureDataDir();
  writeJsonSync(MEMORY_FILE, entries, { mode: 0o600 });
  scheduleHermesAutoPush(entries);
}

function saveWorkflows(workflows: unknown[]) {
  ensureDataDir();
  writeJsonSync(WORKFLOWS_FILE, workflows, { mode: 0o600 });
}

function tryPersistStarterWorkflows(reason: string, workflows: unknown[]) {
  try {
    saveWorkflows(workflows);
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message, reason, file: WORKFLOWS_FILE },
      "starter workflows could not be persisted",
    );
  }
}

function loadWorkflows(): unknown[] {
  ensureDataDir();
  const starterWorkflows = getStarterWorkflowRecords();
  if (!fs.existsSync(WORKFLOWS_FILE)) {
    tryPersistStarterWorkflows("missing-workflows-file", starterWorkflows);
    return starterWorkflows;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(WORKFLOWS_FILE, "utf-8"));
    if (!Array.isArray(raw) || raw.length === 0) {
      tryPersistStarterWorkflows("empty-or-invalid-workflows-file", starterWorkflows);
      return starterWorkflows;
    }
    return raw;
  } catch {
    tryPersistStarterWorkflows("unreadable-workflows-file", starterWorkflows);
    return starterWorkflows;
  }
}

function makeMemoryId() {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeSessionId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeAuditId() {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeExecutionId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeHumanTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeProjectRequestId() {
  return `prj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadChatSessions(): ChatSessionRecord[] {
  ensureDataDir();
  if (!fs.existsSync(CHAT_SESSIONS_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(CHAT_SESSIONS_FILE, "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function loadProjectRequests(): ProjectRequest[] {
  ensureDataDir();
  if (!fs.existsSync(PROJECT_REQUESTS_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(PROJECT_REQUESTS_FILE, "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveProjectRequests(entries: ProjectRequest[]) {
  ensureDataDir();
  writeJsonSync(PROJECT_REQUESTS_FILE, entries, { mode: 0o600 });
}

function saveChatSessions(sessions: ChatSessionRecord[]) {
  ensureDataDir();
  writeJsonSync(CHAT_SESSIONS_FILE, sessions, { mode: 0o600 });
}

function loadAuditEntries(): AuditEntry[] {
  ensureDataDir();
  return dbListAuditEntries(getDb());
}

function saveAuditEntries(_entries: AuditEntry[]) {
  // No-op: audit entries are persisted per-row to SQLite.
  // Retained for compatibility — callers that mutated then saved should
  // prefer `appendAuditEntry` for new rows.
}

function loadExecutionHistory(): ExecutionRecord[] {
  ensureDataDir();
  return dbListExecutionRecords(getDb());
}

function saveExecutionHistory(_entries: ExecutionRecord[]) {
  // No-op: execution records are persisted per-row to SQLite.
}

function loadExecutionArtifacts(): ExecutionArtifact[] {
  ensureDataDir();
  if (!fs.existsSync(EXECUTION_ARTIFACTS_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(EXECUTION_ARTIFACTS_FILE, "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveExecutionArtifacts(entries: ExecutionArtifact[]) {
  ensureDataDir();
  writeJsonSync(EXECUTION_ARTIFACTS_FILE, entries, { mode: 0o600 });
}

function loadHumanTasks(): HumanTask[] {
  ensureDataDir();
  if (!fs.existsSync(HUMAN_TASKS_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(HUMAN_TASKS_FILE, "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveHumanTasks(entries: HumanTask[]) {
  ensureDataDir();
  writeJsonSync(HUMAN_TASKS_FILE, entries, { mode: 0o600 });
}

function loadTelegramPollerLock(): TelegramPollerLock | null {
  ensureDataDir();
  if (!fs.existsSync(TELEGRAM_LOCK_FILE)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(TELEGRAM_LOCK_FILE, "utf-8"));
    const stat = fs.statSync(TELEGRAM_LOCK_FILE);
    if (
      typeof raw?.pid !== "number" ||
      !Number.isFinite(raw.pid) ||
      typeof raw?.instanceId !== "string" ||
      !raw.instanceId.trim()
    ) {
      return null;
    }
    return {
      pid: raw.pid,
      instanceId: raw.instanceId.trim(),
      acquiredAt:
        typeof raw?.acquiredAt === "string" && raw.acquiredAt.trim()
          ? raw.acquiredAt
          : new Date(stat.mtimeMs).toISOString(),
      heartbeatAt: new Date(stat.mtimeMs).toISOString(),
    };
  } catch {
    return null;
  }
}

function saveTelegramPollerLock(lock: TelegramPollerLock, options?: { exclusive?: boolean }) {
  ensureDataDir();
  if (options?.exclusive) {
    const fd = fs.openSync(TELEGRAM_LOCK_FILE, "wx", 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(lock));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return;
  }
  writeJsonSync(TELEGRAM_LOCK_FILE, lock, { mode: 0o600 });
}

function removeTelegramPollerLock() {
  if (fs.existsSync(TELEGRAM_LOCK_FILE)) {
    fs.unlinkSync(TELEGRAM_LOCK_FILE);
  }
}

function getActiveTelegramPollerLock() {
  const lock = loadTelegramPollerLock();
  if (!lock) return null;
  const heartbeatAgeMs = Math.max(
    0,
    Date.now() - (Number.isFinite(Date.parse(lock.heartbeatAt)) ? Date.parse(lock.heartbeatAt) : 0),
  );
  const stale =
    !Number.isFinite(heartbeatAgeMs) || heartbeatAgeMs > TELEGRAM_LOCK_STALE_MS;
  if (stale || !isProcessAlive(lock.pid)) return null;
  return lock;
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireTelegramPollerLock() {
  const now = new Date();
  const current = loadTelegramPollerLock();
  if (current) {
    const heartbeatAgeMs = Math.max(
      0,
      now.getTime() - (Number.isFinite(Date.parse(current.heartbeatAt)) ? Date.parse(current.heartbeatAt) : 0),
    );
    const ownedByThisProcess =
      current.pid === process.pid && current.instanceId === TELEGRAM_POLLER_INSTANCE_ID;
    const stale = !Number.isFinite(heartbeatAgeMs) || heartbeatAgeMs > TELEGRAM_LOCK_STALE_MS;

    if (!ownedByThisProcess && isProcessAlive(current.pid) && !stale) {
      return {
        ok: false,
        reason: `Another local Wings Of World Telegram poller is active (pid ${current.pid}, heartbeat ${current.heartbeatAt}).`,
      };
    }
    if (stale || !isProcessAlive(current.pid)) {
      removeTelegramPollerLock();
    }
  }

  try {
    saveTelegramPollerLock(
      {
        pid: process.pid,
        instanceId: TELEGRAM_POLLER_INSTANCE_ID,
        acquiredAt: now.toISOString(),
        heartbeatAt: now.toISOString(),
      },
      { exclusive: true },
    );
    return { ok: true };
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === "EEXIST") {
      const active = getActiveTelegramPollerLock();
      return {
        ok: false,
        reason: active
          ? `Another local Wings Of World Telegram poller is active (pid ${active.pid}, heartbeat ${active.heartbeatAt}).`
          : "Another local Wings Of World Telegram poller is starting up.",
      };
    }
    throw err;
  }
}

function refreshTelegramPollerLock() {
  const current = loadTelegramPollerLock();
  if (!current) return;
  if (current.pid !== process.pid || current.instanceId !== TELEGRAM_POLLER_INSTANCE_ID) return;
  const now = new Date();
  try {
    fs.utimesSync(TELEGRAM_LOCK_FILE, now, now);
  } catch {
    // Best-effort heartbeat.
  }
}

function releaseTelegramPollerLock() {
  const current = loadTelegramPollerLock();
  if (!current) return;
  if (current.pid === process.pid && current.instanceId === TELEGRAM_POLLER_INSTANCE_ID) {
    removeTelegramPollerLock();
  }
}

function getTelegramErrorAction(lastError?: string) {
  if (!lastError) {
    return "Open Telegram and send /start to the bot to begin chatting.";
  }
  const normalized = lastError.toLowerCase();
  if (
    normalized.includes("another local wings of world telegram poller") ||
    normalized.includes("another local wings telegram poller")
  ) {
    return "Stop the older local Wings Of World instance or wait for its poller lock to expire before starting another Telegram-enabled instance.";
  }
  if (normalized.includes("conflict: terminated by other getupdates request")) {
    return "Another bot instance is polling with the same Telegram token. Stop the competing instance or move one bot to webhook mode.";
  }
  return "Check TELEGRAM_BOT_TOKEN, allowed chat ids, and Telegram network access.";
}

function loadTelegramState(): TelegramState {
  ensureDataDir();
  if (!fs.existsSync(TELEGRAM_STATE_FILE)) {
    return { offset: 0, chats: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(TELEGRAM_STATE_FILE, "utf-8"));
    return {
      offset:
        typeof raw?.offset === "number" && Number.isFinite(raw.offset)
          ? raw.offset
          : 0,
      chats: Array.isArray(raw?.chats)
        ? raw.chats
            .filter((entry: any) => entry && typeof entry === "object")
            .map((entry: any) => ({
              chatId: String(entry.chatId || ""),
              sessionId: String(entry.sessionId || ""),
              username:
                typeof entry.username === "string" && entry.username.trim()
                  ? entry.username.trim()
                  : undefined,
              title:
                typeof entry.title === "string" && entry.title.trim()
                  ? entry.title.trim()
                  : undefined,
              lastMessageAt:
                typeof entry.lastMessageAt === "string" && entry.lastMessageAt.trim()
                  ? entry.lastMessageAt
                  : new Date().toISOString(),
              activeSkillIds: Array.isArray(entry.activeSkillIds)
                ? entry.activeSkillIds
                    .map((value: unknown) => String(value || "").trim())
                    .filter(Boolean)
                : [],
            }))
            .filter((entry: TelegramChatState) => entry.chatId && entry.sessionId)
        : [],
      lastPollAt:
        typeof raw?.lastPollAt === "string" && raw.lastPollAt.trim()
          ? raw.lastPollAt
          : undefined,
      lastError:
        typeof raw?.lastError === "string" && raw.lastError.trim()
          ? raw.lastError
          : undefined,
    };
  } catch {
    return { offset: 0, chats: [] };
  }
}

function saveTelegramState(state: TelegramState) {
  ensureDataDir();
  writeJsonSync(TELEGRAM_STATE_FILE, state, { mode: 0o600 });
}

function getSkillCatalog() {
  return SKILL_CATALOG;
}

function getSkillMap() {
  return new Map(getSkillCatalog().map((skill) => [skill.id, skill]));
}

function normalizeSkillIds(input?: unknown, options?: { telegramOnly?: boolean }) {
  if (!Array.isArray(input)) return [];
  const allowed = getSkillMap();
  return input
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((id, index, list) => list.indexOf(id) === index)
    .filter((id) => {
      const skill = allowed.get(id);
      if (!skill) return false;
      if (options?.telegramOnly && !skill.telegramEnabled) return false;
      return true;
    });
}

function getSkillsByIds(skillIds?: string[]) {
  const skillMap = getSkillMap();
  return normalizeSkillIds(skillIds).map((id) => skillMap.get(id)!).filter(Boolean);
}

function buildSkillPrompt(skillIds?: string[]) {
  const selectedSkills = getSkillsByIds(skillIds);
  if (selectedSkills.length === 0) return "";
  return selectedSkills
    .map((skill, index) => `Skill ${index + 1} - ${skill.title}: ${skill.systemPrompt}`)
    .join("\n");
}

function formatSkillSummary(skillIds?: string[]) {
  const selectedSkills = getSkillsByIds(skillIds);
  if (selectedSkills.length === 0) return "none";
  return selectedSkills.map((skill) => skill.title).join(", ");
}

function getPromptCatalog() {
  return PROMPT_TEMPLATES;
}

function renderPromptTemplate(templateId: string, topic?: string) {
  const prompt = getPromptCatalog().find((entry) => entry.id === templateId);
  if (!prompt) {
    throw new Error(`Unknown prompt template: ${templateId}`);
  }
  const rendered = prompt.template.replaceAll("{{topic}}", (topic || "<describe here>").trim());
  return {
    ...prompt,
    rendered,
  };
}

function getResourceCatalog(): ResourceDefinition[] {
  return [
    {
      uri: "wings://system/health",
      name: "System Health",
      description: "Latest runtime health snapshot for providers and Telegram.",
      mimeType: "application/json",
    },
    {
      uri: "wings://system/readiness",
      name: "System Readiness",
      description: "Readiness checklist for provider, memory, tools, workflows, and Telegram.",
      mimeType: "application/json",
    },
    {
      uri: "wings://memory/recent",
      name: "Recent Memory",
      description: "The latest memory entries from the current Wings Of World memory backend.",
      mimeType: "application/json",
    },
    {
      uri: "wings://skills/catalog",
      name: "Skill Catalog",
      description: "Available runtime skills and their intended usage.",
      mimeType: "application/json",
    },
    {
      uri: "wings://telegram/state",
      name: "Telegram State",
      description: "Current Telegram linkage and chat session state.",
      mimeType: "application/json",
    },
    {
      uri: "wings://human/tasks",
      name: "Human Task Queue",
      description: "Open tasks that require a human or external-world action.",
      mimeType: "application/json",
    },
  ];
}

function readResource(uri: string) {
  switch (uri) {
    case "wings://system/health":
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            ok: true,
            provider: getProviderHealthSnapshot(loadConfig()),
            telegram: loadTelegramState(),
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      };
    case "wings://system/readiness":
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(buildSystemReadiness(), null, 2),
      };
    case "wings://memory/recent":
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(loadMemoryEntries().slice(0, 10), null, 2),
      };
    case "wings://skills/catalog":
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(getSkillCatalog(), null, 2),
      };
    case "wings://telegram/state":
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(loadTelegramState(), null, 2),
      };
    case "wings://human/tasks":
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(loadHumanTasks(), null, 2),
      };
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}

function buildMemoryContext(query: string, limit = 3) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length >= 2);
  return loadMemoryEntries()
    .map((entry) => {
      const haystack = `${entry.content} ${entry.memoryType} ${entry.source}`.toLowerCase();
      const tokenScore = tokens.reduce(
        (sum, token) => sum + (haystack.includes(token) ? 1 : 0),
        0,
      );
      const exactBonus = haystack.includes(normalizedQuery) ? 2 : 0;
      const importanceBonus = entry.importanceScore;
      return {
        ...entry,
        score: tokenScore + exactBonus + importanceBonus,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .slice(0, limit);
}

function appendAuditEntry(entry: Omit<AuditEntry, "id" | "timestamp">) {
  return dbAppendAuditEntry(getDb(), entry);
}

function appendExecutionRecord(
  entry: Omit<ExecutionRecord, "id" | "createdAt">,
) {
  return dbAppendExecutionRecord(getDb(), entry);
}

function appendExecutionArtifact(
  artifact: ExecutionArtifact,
) {
  const entries = loadExecutionArtifacts();
  entries.unshift(artifact);
  const deduped = entries.filter(
    (entry, index, list) =>
      list.findIndex((candidate) => candidate.executionId === entry.executionId) === index,
  );
  saveExecutionArtifacts(deduped.slice(0, 300));
}

function isDataDirWritable() {
  try {
    ensureDataDir();
    const probeFile = path.join(DATA_DIR, `.write-test-${process.pid}.tmp`);
    fs.writeFileSync(probeFile, "ok", "utf-8");
    fs.unlinkSync(probeFile);
    return true;
  } catch {
    return false;
  }
}

function buildSystemReadiness(options?: { backendStatus?: BackendBridgeStatus }) {
  const cfg = loadConfig();
  const providerHealth = getProviderHealthSnapshot(cfg);
  const authState = persistPrunedAuthState();
  const memoryEntries = loadMemoryEntries();
  const workflows = loadWorkflows();
  const telegramState = loadTelegramState();
  const humanTasks = loadHumanTasks();
  const openHumanTasks = humanTasks.filter(
    (task) => task.status === "pending" || task.status === "in_progress" || task.status === "blocked",
  );
  const toolRootsPresent = TOOL_WORKSPACE_ROOTS.filter((root) => fs.existsSync(root));
  const backendStatus = options?.backendStatus;
  const checks: ReadinessCheck[] = [
    isDataDirWritable()
      ? {
          id: "data-dir",
          label: "Data directory",
          status: "ready",
          detail: `Writable at ${DATA_DIR}`,
        }
      : {
          id: "data-dir",
          label: "Data directory",
          status: "error",
          detail: `Cannot write to ${DATA_DIR}`,
          action: "Set WINGS_OF_WORLD_DATA_DIR to a writable directory before using persistence.",
        },
    isProviderUsable(cfg)
      ? {
          id: "provider",
          label: "LLM provider",
          status:
            providerHealth.lastIssue?.category === "quota" ? "warning" : "ready",
          detail: providerHealth.lastIssue
            ? `Primary ${cfg.provider}/${cfg.model}; last issue: ${providerHealth.lastIssue.summary.slice(0, 140)}`
            : `Primary ${cfg.provider}/${cfg.model}${cfg.fallbackEnabled ? ` with fallback ${cfg.fallbackProvider}/${cfg.fallbackModel}` : ""}`,
          action:
            providerHealth.lastIssue?.category === "quota"
              ? cfg.fallbackEnabled
                ? "Primary provider has recent quota pressure. Wings Of World can use the configured fallback automatically."
                : "Enable a fallback provider to keep chat and Telegram online during quota or upstream failures."
              : undefined,
        }
      : {
          id: "provider",
          label: "LLM provider",
          status: "warning",
          detail: isApiKeyRequired(cfg)
            ? "No API key configured yet."
            : "Provider endpoint is not fully configured yet.",
          action: isApiKeyRequired(cfg)
            ? "Open Settings and add an API key to enable chat and LLM workflow nodes."
            : "Open Settings and confirm the local provider Base URL and model.",
        },
    isAppAuthEnabled(authState)
      ? {
          id: "app-auth",
          label: "App access control",
          status: "ready",
          detail: `Local app password enabled with ${authState.sessions.length} active session(s)`,
        }
      : isPublicBindHost(HOST)
        ? {
            id: "app-auth",
            label: "App access control",
            status: "error",
            detail: `Local Wings Of World app password is not enabled while HOST=${HOST}.`,
            action: "Bootstrap local app authentication from 127.0.0.1 before exposing this service.",
          }
      : {
          id: "app-auth",
          label: "App access control",
          status: "warning",
          detail: "Local Wings Of World app password is not enabled yet.",
          action: "Open Settings and enable local app authentication to lock the web UI and API behind a password.",
        },
    workflows.length > 0
      ? {
          id: "workflows",
          label: "Workflow library",
          status: "ready",
          detail: `${workflows.length} workflow snapshot(s) saved`,
        }
      : {
          id: "workflows",
          label: "Workflow library",
          status: "warning",
          detail: "No saved workflows yet.",
          action: "Build and save at least one workflow so Wings Of World can resume from a known state.",
        },
    memoryEntries.length > 0
      ? {
          id: "memory",
          label: "Memory vault",
          status: "ready",
          detail: `${memoryEntries.length} memory item(s) available for retrieval via ${obsidianMemoryEnabled() ? "Obsidian" : "local json"} backend`,
        }
      : {
          id: "memory",
          label: "Memory vault",
          status: "warning",
          detail: `Memory store is empty (${obsidianMemoryEnabled() ? "Obsidian backend active" : "local json backend active"}).`,
          action: "Save operational notes or promote useful chat/workflow output into memory.",
        },
    toolRootsPresent.length === TOOL_WORKSPACE_ROOTS.length
      ? {
          id: "tools",
          label: "Tool workspaces",
          status: "ready",
          detail: `All ${TOOL_WORKSPACE_ROOTS.length} configured tool roots are available`,
        }
      : toolRootsPresent.length > 0
        ? {
            id: "tools",
            label: "Tool workspaces",
            status: "warning",
            detail: `${toolRootsPresent.length}/${TOOL_WORKSPACE_ROOTS.length} tool roots are available`,
            action: "Restore the missing workspace path or adjust the allowed tool roots.",
          }
        : {
            id: "tools",
            label: "Tool workspaces",
            status: "error",
            detail: "No configured tool workspace roots are available.",
            action: "Restore the Wings Of World or local_ai_system directories before using file tools.",
          },
    {
      id: "audit",
      label: "Audit log",
      status: "ready",
      detail: `${loadAuditEntries().length} recent audit event(s) retained`,
    },
    openHumanTasks.length > 0
      ? {
          id: "human-tasks",
          label: "Command queue",
          status: "warning",
          detail: `${openHumanTasks.length} open command task(s) still require execution`,
          action: "Open Command Center to assign, complete, or unblock the pending work.",
        }
      : {
          id: "human-tasks",
          label: "Command queue",
          status: "ready",
          detail: `${humanTasks.length} total task(s); no open command work is waiting`,
        },
    isTelegramEnabled()
      ? {
          id: "telegram",
          label: "Telegram bot",
          status: telegramState.lastError ? "warning" : "ready",
          detail: telegramState.lastError
            ? `Polling error: ${telegramState.lastError}`
            : `Enabled with ${telegramState.chats.length} linked chat(s)`,
          action: getTelegramErrorAction(telegramState.lastError),
        }
      : {
          id: "telegram",
          label: "Telegram bot",
          status: "warning",
          detail: "Telegram bridge is not configured.",
          action: "Set TELEGRAM_BOT_TOKEN to enable Telegram chat integration.",
        },
  ];

  if (backendStatus) {
    checks.push(
      backendStatus.running && backendStatus.ready
        ? {
            id: "backend-integration",
            label: "Backend integration",
            status: "ready",
            detail: `Wings_Backend gateway is ready at ${backendStatus.gatewayUrl}`,
          }
        : {
            id: "backend-integration",
            label: "Backend integration",
            status: "warning",
            detail: backendStatus.running
              ? `Gateway is reachable at ${backendStatus.gatewayUrl}, but readiness is not green.`
              : `Wings_UI is running locally, but Wings_Backend gateway is offline at ${backendStatus.gatewayUrl}.`,
            action:
              backendStatus.recommendedAction ||
              "Open System > Backend Gateway, start the gateway, or run the displayed backend command manually.",
          },
    );
  }

  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { ready: 0, warning: 0, error: 0 },
  );
  const overall =
    summary.error > 0 ? "blocked" : summary.warning > 0 ? "partial" : "ready";

  return {
    overall,
    summary,
    checks,
    timestamp: new Date().toISOString(),
  };
}

function buildSystemExportBundle(): SystemExportBundle {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings: publicConfig(loadConfig()),
      workflows: loadWorkflows(),
      memory: loadMemoryEntries(),
      chatSessions: loadChatSessions(),
      audit: loadAuditEntries(),
      executionHistory: loadExecutionHistory(),
      executionArtifacts: loadExecutionArtifacts(),
      telegramState: loadTelegramState(),
      humanTasks: loadHumanTasks(),
    },
  };
}

function normalizeImportedHumanTasks(input: unknown): HumanTask[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry) => entry && typeof entry === "object")
    .map((entry: any) => ({
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id : makeHumanTaskId(),
      title:
        typeof entry.title === "string" && entry.title.trim()
          ? entry.title.slice(0, 200)
          : "Imported human task",
      details:
        typeof entry.details === "string" && entry.details.trim()
          ? entry.details
          : undefined,
      status:
        entry.status === "in_progress" ||
        entry.status === "done" ||
        entry.status === "blocked"
          ? entry.status
          : "pending",
      priority:
        entry.priority === "low" ||
        entry.priority === "high" ||
        entry.priority === "critical"
          ? entry.priority
          : "medium",
      source:
        typeof entry.source === "string" && entry.source.trim()
          ? entry.source
          : "import",
      owner:
        typeof entry.owner === "string" && entry.owner.trim()
          ? entry.owner
          : undefined,
      command: normalizeCommandPlanForTask(entry.command),
      createdAt:
        typeof entry.createdAt === "string" && entry.createdAt.trim()
          ? entry.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof entry.updatedAt === "string" && entry.updatedAt.trim()
          ? entry.updatedAt
          : new Date().toISOString(),
      completedAt:
        typeof entry.completedAt === "string" && entry.completedAt.trim()
          ? entry.completedAt
          : undefined,
    }));
}

function normalizeImportedTelegramState(input: unknown): TelegramState {
  if (!input || typeof input !== "object") {
    return { offset: 0, chats: [] };
  }
  const raw = input as any;
  return {
    offset:
      typeof raw.offset === "number" && Number.isFinite(raw.offset)
        ? raw.offset
        : 0,
    chats: Array.isArray(raw.chats)
      ? raw.chats
          .filter((entry: any) => entry && typeof entry === "object")
          .map((entry: any) => ({
            chatId: String(entry.chatId || ""),
            sessionId: String(entry.sessionId || ""),
            username:
              typeof entry.username === "string" && entry.username.trim()
                ? entry.username.trim()
                : undefined,
            title:
              typeof entry.title === "string" && entry.title.trim()
                ? entry.title.trim()
                : undefined,
            lastMessageAt:
              typeof entry.lastMessageAt === "string" && entry.lastMessageAt.trim()
                ? entry.lastMessageAt
                : new Date().toISOString(),
            activeSkillIds: normalizeSkillIds(entry.activeSkillIds, { telegramOnly: true }),
          }))
          .filter((entry: TelegramChatState) => entry.chatId && entry.sessionId)
      : [],
    lastPollAt:
      typeof raw.lastPollAt === "string" && raw.lastPollAt.trim()
        ? raw.lastPollAt
        : undefined,
    lastError:
      typeof raw.lastError === "string" && raw.lastError.trim()
        ? raw.lastError
        : undefined,
  };
}

function isValidChatMessage(message: any): message is ChatMessage {
  return (
    message &&
    (message.role === "system" ||
      message.role === "user" ||
      message.role === "assistant") &&
    typeof message.content === "string"
  );
}

function normalizeImportedMemoryEntries(input: unknown): MemoryEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry) => entry && typeof entry === "object")
    .map((entry: any) => ({
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id : makeMemoryId(),
      content: typeof entry.content === "string" ? entry.content : "",
      memoryType:
        entry.memoryType === "fact" ||
        entry.memoryType === "preference" ||
        entry.memoryType === "context" ||
        entry.memoryType === "summary" ||
        entry.memoryType === "insight"
          ? entry.memoryType
          : "fact",
      source: typeof entry.source === "string" && entry.source.trim() ? entry.source : "import",
      importanceScore:
        typeof entry.importanceScore === "number"
          ? Math.max(0, Math.min(1, entry.importanceScore))
          : 0.5,
      createdAt:
        typeof entry.createdAt === "string" && entry.createdAt.trim()
          ? entry.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof entry.updatedAt === "string" && entry.updatedAt.trim()
          ? entry.updatedAt
          : new Date().toISOString(),
    }))
    .filter((entry) => entry.content.trim());
}

function normalizeImportedChatSessions(input: unknown): ChatSessionRecord[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry) => entry && typeof entry === "object")
    .map((entry: any) => ({
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id : makeSessionId(),
      title:
        typeof entry.title === "string" && entry.title.trim()
          ? entry.title.slice(0, 80)
          : "Imported chat",
      messages: Array.isArray(entry.messages) ? entry.messages.filter(isValidChatMessage) : [],
      updatedAt:
        typeof entry.updatedAt === "string" && entry.updatedAt.trim()
          ? entry.updatedAt
          : new Date().toISOString(),
      tokenUsage:
        entry.tokenUsage && typeof entry.tokenUsage === "object"
          ? normalizeTokenUsage(entry.tokenUsage)
          : undefined,
      costEstimateUsd:
        typeof entry.costEstimateUsd === "number" && Number.isFinite(entry.costEstimateUsd)
          ? Math.max(0, entry.costEstimateUsd)
          : undefined,
    }))
    .filter((entry) => entry.messages.length > 0);
}

function normalizeImportedAuditEntries(input: unknown): AuditEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry) => entry && typeof entry === "object")
    .map((entry: any) => ({
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id : makeAuditId(),
      area:
        entry.area === "chat" ||
        entry.area === "workflow" ||
        entry.area === "tool" ||
        entry.area === "memory" ||
        entry.area === "settings" ||
        entry.area === "system"
          ? entry.area
          : "system",
      action:
        typeof entry.action === "string" && entry.action.trim()
          ? entry.action.trim()
          : "imported-event",
      status: entry.status === "error" ? "error" : "success",
      summary:
        typeof entry.summary === "string" && entry.summary.trim()
          ? entry.summary
          : "Imported audit entry",
      timestamp:
        typeof entry.timestamp === "string" && entry.timestamp.trim()
          ? entry.timestamp
          : new Date().toISOString(),
      targetId:
        typeof entry.targetId === "string" && entry.targetId.trim()
          ? entry.targetId
          : undefined,
    }));
}

function normalizeImportedExecutionHistory(input: unknown): ExecutionRecord[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry) => entry && typeof entry === "object")
    .map((entry: any) => ({
      id:
        typeof entry.id === "string" && entry.id.trim()
          ? entry.id
          : makeExecutionId(),
      kind:
        entry.kind === "workflow" || entry.kind === "tool"
          ? entry.kind
          : "chat",
      status: entry.status === "error" ? "error" : "success",
      title:
        typeof entry.title === "string" && entry.title.trim()
          ? entry.title.slice(0, 120)
          : "Imported run",
      summary:
        typeof entry.summary === "string" && entry.summary.trim()
          ? entry.summary
          : "Imported execution record",
      inputPreview:
        typeof entry.inputPreview === "string" ? entry.inputPreview : "",
      outputPreview:
        typeof entry.outputPreview === "string" && entry.outputPreview.trim()
          ? entry.outputPreview
          : undefined,
      sessionId:
        typeof entry.sessionId === "string" && entry.sessionId.trim()
          ? entry.sessionId
          : undefined,
      workflowId:
        typeof entry.workflowId === "string" && entry.workflowId.trim()
          ? entry.workflowId
          : undefined,
      toolName:
        typeof entry.toolName === "string" && entry.toolName.trim()
          ? entry.toolName
          : undefined,
      model:
        typeof entry.model === "string" && entry.model.trim()
          ? entry.model
          : undefined,
      memoryCount:
        typeof entry.memoryCount === "number" && Number.isFinite(entry.memoryCount)
          ? Math.max(0, entry.memoryCount)
          : 0,
      tokenUsage:
        entry.tokenUsage && typeof entry.tokenUsage === "object"
          ? normalizeTokenUsage(entry.tokenUsage)
          : undefined,
      costEstimateUsd:
        typeof entry.costEstimateUsd === "number" && Number.isFinite(entry.costEstimateUsd)
          ? Math.max(0, entry.costEstimateUsd)
          : undefined,
      durationMs:
        typeof entry.durationMs === "number" && Number.isFinite(entry.durationMs)
          ? Math.max(0, Math.round(entry.durationMs))
          : undefined,
      createdAt:
        typeof entry.createdAt === "string" && entry.createdAt.trim()
          ? entry.createdAt
          : new Date().toISOString(),
    }));
}

function normalizeImportedExecutionArtifacts(input: unknown): ExecutionArtifact[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry) => entry && typeof entry === "object")
    .map((entry: any) => ({
      executionId:
        typeof entry.executionId === "string" && entry.executionId.trim()
          ? entry.executionId
          : makeExecutionId(),
      kind:
        entry.kind === "workflow" || entry.kind === "tool"
          ? entry.kind
          : "chat",
      status: entry.status === "error" ? "error" : "success",
      createdAt:
        typeof entry.createdAt === "string" && entry.createdAt.trim()
          ? entry.createdAt
          : new Date().toISOString(),
      input: entry.input,
      output: entry.output,
      memoryContext: Array.isArray(entry.memoryContext)
        ? normalizeImportedMemoryEntries(entry.memoryContext)
        : undefined,
      trace: Array.isArray(entry.trace)
        ? entry.trace.filter((item: unknown) => typeof item === "string")
        : undefined,
      workflowSnapshot:
        entry.workflowSnapshot && typeof entry.workflowSnapshot === "object"
          ? entry.workflowSnapshot
          : undefined,
      sessionSnapshot: Array.isArray(entry.sessionSnapshot)
        ? entry.sessionSnapshot.filter(isValidChatMessage)
        : undefined,
      toolArgs:
        entry.toolArgs && typeof entry.toolArgs === "object"
          ? entry.toolArgs
          : undefined,
      metadata:
        entry.metadata && typeof entry.metadata === "object"
          ? entry.metadata
          : undefined,
      error:
        typeof entry.error === "string" && entry.error.trim()
          ? entry.error
          : undefined,
    }));
}

const MEMORY_ITEM_CHAR_CAP = 400;

function formatMemoryContext(memories: MemoryEntry[]) {
  if (memories.length === 0) return "";
  return memories
    .map((entry, index) => {
      const trimmed = entry.content.length > MEMORY_ITEM_CHAR_CAP
        ? `${entry.content.slice(0, MEMORY_ITEM_CHAR_CAP)}…`
        : entry.content;
      return `${index + 1}. [${entry.memoryType}] ${trimmed}`;
    })
    .join("\n");
}

function isWithinAllowedRoots(candidatePath: string) {
  const normalized = path.resolve(candidatePath).toLowerCase();
  return TOOL_WORKSPACE_ROOTS.some((root) => {
    const normalizedRoot = root.toLowerCase();
    return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}\\`);
  });
}

function sanitizeToolPath(inputPath: string) {
  const resolved = path.resolve(inputPath);
  if (!isWithinAllowedRoots(resolved)) {
    throw new Error("Path is outside the allowed Wings Of World tool workspaces.");
  }
  const normalized = resolved.toLowerCase();
  const basename = path.basename(resolved).toLowerCase();
  const relativeToProject = path.relative(PROJECT_ROOT, resolved);
  const relativeSegments = relativeToProject.split(path.sep).map((segment) => segment.toLowerCase());
  const relativeToDataDir = path.relative(DATA_DIR, resolved);

  if (
    basename === ".env" ||
    (basename.startsWith(".env.") && basename !== ".env.example") ||
    TOOL_BLOCKED_EXTENSIONS.includes(path.extname(resolved).toLowerCase())
  ) {
    throw new Error("Access to secrets and key material is blocked for Wings Of World tools.");
  }

  if (
    normalized === APP_AUTH_FILE.toLowerCase() ||
    normalized === CONFIG_FILE.toLowerCase() ||
    normalized === TELEGRAM_STATE_FILE.toLowerCase() ||
    normalized === TELEGRAM_LOCK_FILE.toLowerCase()
  ) {
    throw new Error("Access to protected Wings Of World system files is blocked for tools.");
  }

  if (
    !relativeToDataDir.startsWith("..") &&
    !path.isAbsolute(relativeToDataDir) &&
    basename === "config.json"
  ) {
    throw new Error("Access to protected Wings Of World configuration files is blocked for tools.");
  }

  if (
    !relativeToProject.startsWith("..") &&
    !path.isAbsolute(relativeToProject) &&
    relativeSegments.some((segment) =>
      [".git", ".corepack", "logs"].includes(segment),
    )
  ) {
    throw new Error("Access to protected project internals is blocked for tools.");
  }
  return resolved;
}

async function runMacroLoop(task: string, options: { saveAs?: string; maxLoops?: number } = {}) {
  let currentState = "System initialized. No data yet.";
  const maxLoops = options.maxLoops || 8;
  const trace: any[] = [];
  const ollamaUrl = "http://localhost:11434/api/generate";
  const availableTools = getAgenticToolDefinitions()
    .map(t => `${t.name}: ${t.description}`)
    .join("\n");
  
  trace.push({ step: 0, status: "started", task });

  for (let i = 0; i < maxLoops; i++) {
    const loopStart = Date.now();
    
    // 1. Context-Aware Prompting
    const prompt = `Objective: ${task}
Current Environment State: ${currentState}
Available Tools:
${availableTools}

Analyze carefully. If the objective is met, set action to "finished".
Respond ONLY with a JSON object.`;

    const systemPrompt = `You are a Professional Macro Orchestrator. 
Your goal is to complete the task using the most efficient tool calls.
Output JSON format: {"thought": "reasoning here", "action": "tool_name", "parameters": {}, "status": "running"|"finished"}`;

    try {
      const res = await fetch(ollamaUrl, {
        method: "POST",
        body: JSON.stringify({
          model: "llama3",
          system: systemPrompt,
          prompt: prompt,
          stream: false,
          format: "json"
        })
      });
      
      const data: any = await res.json();
      let decision;
      try {
        decision = JSON.parse(data.response);
      } catch (pErr) {
        // Fallback: try to extract JSON from text if AI didn't follow format
        const match = data.response.match(/\{[\s\S]*\}/);
        decision = match ? JSON.parse(match[0]) : null;
      }

      if (!decision) throw new Error("AI failed to provide a valid JSON decision");

      trace.push({
        step: i + 1,
        thought: decision.thought,
        action: decision.action,
        params: decision.parameters,
        tookMs: Date.now() - loopStart
      });

      if (decision.status === "finished" || decision.action === "finished") {
        break;
      }

      // 2. Dynamic Tool Execution
      let result = "";
      try {
        const toolResult = await executeToolWithCache(decision.action, decision.parameters || {});
        result = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
      } catch (err: any) {
        result = `Error executing ${decision.action}: ${err.message}`;
      }

      // 3. Compact State Compression
      currentState = `Loop ${i+1} result (${decision.action}): ${result.slice(0, 2000)}`;

    } catch (err: any) {
      trace.push({ step: i + 1, error: err.message });
      break;
    }
  }

  const finalResult = {
    task,
    status: "completed",
    steps: trace,
    finalState: currentState,
    completedAt: new Date().toISOString()
  };

  // 4. Persistence: Save to history and Obsidian
  appendMacroHistory(finalResult);
  saveToObsidian("Macros", `Macro: ${task}`, 
    `## Objective\n${task}\n\n## Final State\n${currentState}\n\n## Execution Trace\n${trace.map(s => s.error ? `!!! Error: ${s.error}` : `### Step ${s.step}: ${s.action}\n**Thought:** ${s.thought}\n**Params:** \`${JSON.stringify(s.params)}\`\n`).join("\n\n")}`,
    { status: "completed", stepsCount: trace.length }
  );

  // 5. If named, save as template
  if (options.saveAs) {
    const macros = loadMacros();
    const existing = macros.findIndex(m => m.name === options.saveAs);
    const macroData = { name: options.saveAs, task, updatedAt: new Date().toISOString() };
    if (existing >= 0) macros[existing] = macroData;
    else macros.push(macroData);
    saveMacros(macros);
  }

  return finalResult;
}

async function executeTool(name: string, args: Record<string, unknown>) {
  if (name === "calculator") {
    const expression =
      typeof args.expression === "string" ? args.expression.trim() : "";
    if (!expression) throw new Error("expression is required");
    if (!/^[0-9+\-*/().%\s]+$/.test(expression)) {
      throw new Error("Only numeric math expressions are allowed.");
    }
    const result = Function(`"use strict"; return (${expression});`)();
    if (typeof result !== "number" || !Number.isFinite(result)) {
      throw new Error("Expression did not evaluate to a finite number.");
    }
    return { expression, result };
  }

  if (name === "list_directory") {
    const target = sanitizeToolPath(
      typeof args.path === "string" && args.path.trim() ? args.path : "D:\\",
    );
    const entries = fs.readdirSync(target, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    }));
    return { path: target, entries };
  }

  if (name === "read_file") {
    const target = sanitizeToolPath(String(args.path || ""));
    const stat = fs.statSync(target);
    const maxBytes =
      typeof args.maxBytes === "number" && args.maxBytes > 0
        ? Math.min(args.maxBytes, 200_000)
        : 200_000;
    if (!stat.isFile()) throw new Error("Path is not a file.");
    if (stat.size > maxBytes) {
      throw new Error(`File is too large (${stat.size} bytes).`);
    }
    return {
      path: target,
      size: stat.size,
      content: fs.readFileSync(target, "utf-8"),
    };
  }

  if (name === "search_files") {
    const pattern = typeof args.pattern === "string" ? args.pattern.trim() : "";
    if (!pattern) throw new Error("pattern is required");
    const target = sanitizeToolPath(
      typeof args.path === "string" && args.path.trim()
        ? args.path
        : path.resolve(PROJECT_ROOT, ".."),
    );
    const { stdout, stderr } = await execFile(
      "rg",
      ["-n", "--no-heading", pattern, target],
      { maxBuffer: 1024 * 1024 },
    );
    return {
      path: target,
      pattern,
      matches: stdout.split(/\r?\n/).filter(Boolean).slice(0, 200),
      stderr: stderr.trim() || undefined,
    };
  }

  if (name === "write_file") {
    const target = sanitizeToolPath(String(args.path || ""));
    const content = typeof args.content === "string" ? args.content : "";
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf-8");
    return {
      path: target,
      bytesWritten: Buffer.byteLength(content, "utf-8"),
      status: "written",
    };
  }

  if (name === "web_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) throw new Error("query is required");
    const count = typeof args.count === "number" ? Math.min(Math.max(1, args.count), 10) : 5;
    return await runDuckDuckGoSearch(query, count);
  }

  if (name === "hermes_execute") {
    const task = typeof args.task === "string" ? args.task.trim() : "";
    if (!task) throw new Error("task description is required for Hermes");
    const cfg = loadConfig();
    const hermesModel =
      typeof args.model === "string" && args.model.trim()
        ? args.model.trim()
        : cfg.hermesModel || "gpt-5.4";
    if (typeof args.baseURL === "string" && args.baseURL.trim()) {
      throw new Error("Hermes baseURL must be configured in Settings; request-level baseURL is not allowed.");
    }
    const hermesBaseURL = cfg.hermesBaseURL || cfg.baseURL || "https://api.openai.com/v1";
    
    // Execute Hermes Agent via CLI
    const hermesPath = "D:\\hermes-agent-main\\run_agent.py";
    const { stdout, stderr } = await execFile(
      "python", 
      [
        hermesPath,
        "--query",
        task,
        "--model",
        hermesModel,
        "--base_url",
        hermesBaseURL,
        "--max_turns",
        "10",
      ],
      {
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          HERMES_MODEL: hermesModel,
          OPENAI_BASE_URL: hermesBaseURL,
          ...(cfg.apiKey ? { OPENAI_API_KEY: cfg.apiKey } : {}),
        },
      }
    );
    
    return {
      agent: "Hermes",
      task,
      model: hermesModel,
      output: stdout.trim(),
      error: stderr.trim() || undefined,
      status: "completed"
    };
  }

  if (name === "run_macro") {
    const task = typeof args.task === "string" ? args.task.trim() : "";
    if (!task) throw new Error("task is required for macro");
    return await runMacroLoop(task);
  }

  if (name === "remember_to_obsidian") {
    const title = String(args.title || "Untitled Note");
    const content = String(args.content || "");
    const category = (args.category as any) || "Knowledge";
    const path = saveToObsidian(category, title, content);
    return { status: "saved", path, title, category };
  }

  if (name === "search_knowledge") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) throw new Error("query is required");
    
    // Search in D:\MEMORY using ripgrep
    const target = "D:\\MEMORY";
    const { stdout } = await execFile(
      "rg",
      ["-i", "-l", query, target],
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    const files = stdout.split(/\r?\n/).filter(Boolean).slice(0, 5);
    const results = files.map(file => {
      const content = fs.readFileSync(file, "utf-8");
      return {
        file: path.basename(file),
        path: file,
        snippet: content.slice(0, 1000) + "..."
      };
    });

    return {
      query,
      count: results.length,
      matches: results
    };
  }

  if (name === "brave_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) throw new Error("query is required");
    const cfg = loadConfig();
    if (!cfg.braveApiKey) throw new Error("Brave API key not configured. Add it in Settings → Search Tools.");
    const count = typeof args.count === "number" ? Math.min(Math.max(1, args.count), 10) : 5;
    const country = typeof args.country === "string" ? args.country.trim() : "US";
    const freshness = typeof args.freshness === "string" ? args.freshness.trim() : undefined;
    return await runBraveSearch(query, count, country, freshness, cfg.braveApiKey);
  }

  if (name === "web_fetch") {
    const url = typeof args.url === "string" ? args.url.trim() : "";
    if (!url) throw new Error("url is required");
    const maxChars = typeof args.maxChars === "number" ? args.maxChars : undefined;
    return await fetchWebContent(url, { maxChars });
  }

  if (name === "extract_document") {
    const filePath = typeof args.path === "string" ? args.path.trim() : "";
    if (!filePath) throw new Error("path is required");
    if (!isWithinAllowedRoots(filePath)) {
      throw new Error(`Path is outside the allowed workspace roots: ${filePath}`);
    }
    const pageRange = typeof args.pageRange === "string" ? args.pageRange : undefined;
    const maxChars = typeof args.maxChars === "number" ? args.maxChars : undefined;
    return await extractDocument(filePath, { pageRange, maxChars });
  }

  if (name === "tavily_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) throw new Error("query is required");
    const cfg = loadConfig();
    if (!cfg.tavilyApiKey) throw new Error("Tavily API key not configured. Add it in Settings → Search Tools.");
    const maxResults = typeof args.maxResults === "number" ? args.maxResults : 5;
    const topic = args.topic === "news" ? "news" : "general";
    const timeRange = typeof args.timeRange === "string" ? args.timeRange : undefined;
    const includeAnswer = args.includeAnswer === false ? false : true;
    return await tavilySearch({
      apiKey: cfg.tavilyApiKey,
      query,
      maxResults,
      topic: topic as "general" | "news",
      timeRange: timeRange as any,
      includeAnswer,
    });
  }

  if (name === "generate_image") {
    return await generateImage(args);
  }

  throw new Error(`Unknown tool: ${name}`);
}

/**
 * Public tool entry point used by agentic loops, MCP, the workflow engine,
 * and HTTP handlers. Goes through the result cache when the per-tool policy
 * allows it; falls back to the raw `executeTool` for write/side-effect tools.
 */
async function executeToolWithCache(
  name: string,
  args: Record<string, unknown>,
  options: { bypassCache?: boolean; confirmed?: boolean } = {},
): Promise<unknown> {
  assertToolConfirmation(name, options);
  const outcome = await executeToolCached(getDb(), executeTool, name, args, {
    bypassCache: options.bypassCache,
  });
  return outcome.result;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/").replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "-").replace(/&mdash;/g, "--").replace(/&hellip;/g, "...")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeDdgUrl(rawUrl: string): string {
  try {
    const normalized = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
    const parsed = new URL(normalized);
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) return uddg;
  } catch { /* keep original */ }
  return rawUrl;
}

function parseDdgHtml(html: string): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const resultRegex = /<a\b(?=[^>]*\bclass="[^"]*\bresult__a\b[^"]*")([^>]*)>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a\b(?=[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*")[^>]*>([\s\S]*?)<\/a>/i;
  const nextRegex = /<a\b(?=[^>]*\bclass="[^"]*\bresult__a\b[^"]*")[^>]*>/i;
  const hrefRegex = /\bhref="([^"]*)"/i;
  for (const match of html.matchAll(resultRegex)) {
    const rawUrl = hrefRegex.exec(match[1] ?? "")?.[1] ?? "";
    const rawTitle = match[2] ?? "";
    const matchEnd = (match.index ?? 0) + match[0].length;
    const trailing = html.slice(matchEnd);
    const nextIdx = trailing.search(nextRegex);
    const scoped = nextIdx >= 0 ? trailing.slice(0, nextIdx) : trailing;
    const rawSnippet = snippetRegex.exec(scoped)?.[1] ?? "";
    const title = decodeHtmlEntities(stripHtml(rawTitle));
    const url = decodeDdgUrl(decodeHtmlEntities(rawUrl));
    const snippet = decodeHtmlEntities(stripHtml(rawSnippet));
    if (title && url) results.push({ title, url, snippet });
  }
  return results;
}

type SearchCacheEntry = { value: unknown; expiresAt: number };
const DDG_CACHE = new Map<string, SearchCacheEntry>();
const DDG_CACHE_MAX = 100;
const DDG_CACHE_TTL_MS = 5 * 60_000;

function ddgCacheSet(key: string, value: unknown) {
  if (DDG_CACHE.size >= DDG_CACHE_MAX) {
    const now = Date.now();
    for (const [k, entry] of DDG_CACHE) {
      if (entry.expiresAt <= now) { DDG_CACHE.delete(k); break; }
    }
    if (DDG_CACHE.size >= DDG_CACHE_MAX) {
      DDG_CACHE.delete(DDG_CACHE.keys().next().value!);
    }
  }
  DDG_CACHE.set(key, { value, expiresAt: Date.now() + DDG_CACHE_TTL_MS });
}

function siteNameFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || undefined;
  } catch { return undefined; }
}

async function runDuckDuckGoSearch(query: string, count: number) {
  const cacheKey = `ddg:${query}:${count}`;
  const cached = DDG_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = new URL("https://html.duckduckgo.com/html");
  url.searchParams.set("q", query);
  url.searchParams.set("kp", "-1");

  const startedAt = Date.now();
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo returned status ${response.status}`);
  }
  const html = await response.text();
  if (
    /g-recaptcha|are you a human|id="challenge-form"/i.test(html) &&
    !/class="[^"]*\bresult__a\b/i.test(html)
  ) {
    throw new Error("DuckDuckGo returned a bot-detection challenge. Try again later.");
  }
  const raw = parseDdgHtml(html).slice(0, count);
  const results = raw.map((r) => ({ ...r, siteName: siteNameFromUrl(r.url) }));
  const payload = {
    query,
    provider: "duckduckgo",
    count: results.length,
    tookMs: Date.now() - startedAt,
    results,
  };
  ddgCacheSet(cacheKey, payload);
  return payload;
}

async function runBraveSearch(
  query: string,
  count: number,
  country: string,
  freshness: string | undefined,
  apiKey: string,
) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  if (country) url.searchParams.set("country", country);
  if (freshness) url.searchParams.set("freshness", freshness);

  const startedAt = Date.now();
  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Brave Search error (${response.status}): ${detail || response.statusText}`);
  }
  const data = await response.json() as any;
  const results = (data?.web?.results || []).slice(0, count).map((r: any) => {
    const urlStr = String(r.url || "");
    return {
      title: String(r.title || ""),
      url: urlStr,
      snippet: String(r.description || ""),
      siteName: siteNameFromUrl(urlStr),
    };
  });
  return {
    query,
    provider: "brave",
    count: results.length,
    tookMs: Date.now() - startedAt,
    results,
  };
}

function topoOrder(wf: Workflow): WorkflowNode[] {
  const byId = new Map(wf.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, number>();
  for (const n of wf.nodes) incoming.set(n.id, 0);
  for (const e of wf.edges) {
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }

  const outgoing = new Map<string, string[]>();
  for (const e of wf.edges) {
    const arr = outgoing.get(e.source) ?? [];
    arr.push(e.target);
    outgoing.set(e.source, arr);
  }

  const order: WorkflowNode[] = [];
  const queue = wf.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const targetId of outgoing.get(node.id) ?? []) {
      incoming.set(targetId, (incoming.get(targetId) ?? 0) - 1);
      if ((incoming.get(targetId) ?? 0) === 0) {
        queue.push(byId.get(targetId)!);
      }
    }
  }

  if (order.length !== wf.nodes.length) {
    throw new Error("Workflow has a cycle");
  }
  return order;
}

async function executeWorkflow(
  wf: Workflow,
  initialInput: string,
  cfg: AppConfig,
): Promise<{
  outputs: Record<string, string>;
  trace: string[];
  memoryContext: MemoryEntry[];
  tokenUsage: TokenUsage;
  nodeUsage: Array<{
    nodeId: string;
    label: string;
    provider: string;
    model: string;
    usage: TokenUsage;
  }>;
}> {
  const order = topoOrder(wf);
  const outputs: Record<string, string> = {};
  const trace: string[] = [];
  const parents = new Map<string, string[]>();
  const memoryContext = buildMemoryContext(initialInput, 3);
  const memoryPrompt = formatMemoryContext(memoryContext);
  let workflowUsage: TokenUsage = { ...EMPTY_TOKEN_USAGE };
  const nodeUsage: Array<{
    nodeId: string;
    label: string;
    provider: string;
    model: string;
    usage: TokenUsage;
  }> = [];

  for (const edge of wf.edges) {
    const arr = parents.get(edge.target) ?? [];
    arr.push(edge.source);
    parents.set(edge.target, arr);
  }

  // Tracks branch outcome for `condition` nodes so edges with a `branch`
  // hint can be filtered. Nodes without a recorded branch always fire all
  // outgoing edges.
  const branchOutcome = new Map<string, "true" | "false">();

  const inputFor = (id: string) => {
    const incomingEdges = wf.edges.filter((e) => e.target === id);
    const eligibleEdges = pickBranchEdges(incomingEdges, branchOutcome);
    if (eligibleEdges.length === 0) {
      return incomingEdges.length === 0 ? initialInput : "";
    }
    return eligibleEdges.map((e) => outputs[e.source] ?? "").join("\n");
  };

  for (const node of order) {
    const input = inputFor(node.id);
    if (node.type === "trigger") {
      outputs[node.id] = node.data.input || initialInput;
      trace.push(`trigger:${node.id} -> ${outputs[node.id].slice(0, 80)}`);
      continue;
    }

    if (node.type === "llm") {
      const prompt = node.data.prompt || "You are a helpful assistant.";
      const providerCfg =
        node.data.provider === "fallback"
          ? getFallbackConfig(cfg) || cfg
          : cfg;
      const { content, providerMeta, usage } = await callChatCompletions(
        providerCfg,
        [
          {
            role: "system",
            content: memoryPrompt
              ? `${prompt}\n\nRelevant memory:\n${memoryPrompt}`
              : prompt,
          },
          { role: "user", content: input },
        ],
        node.data.model,
      );
      outputs[node.id] = content;
      workflowUsage = addTokenUsage(workflowUsage, usage);
      nodeUsage.push({
        nodeId: node.id,
        label: node.data.label,
        provider: providerMeta.provider,
        model: providerMeta.model,
        usage,
      });
      trace.push(
        `llm:${node.id} (${providerMeta.model}, provider:${providerMeta.provider}${providerMeta.usedFallback ? ", fallback" : ""}, memories:${memoryContext.length}, ${formatTokenUsage(usage)})`,
      );
      continue;
    }

    if (node.type === "condition") {
      const expression = node.data.condition || "true";
      const { outcome, error } = await evaluateBranchOutcome(expression, {
        input,
        context: { outputs, memoryContext },
      });
      branchOutcome.set(node.id, outcome);
      outputs[node.id] = input;
      trace.push(
        `condition:${node.id} -> ${outcome}` + (error ? ` (eval error: ${error})` : ""),
      );
      continue;
    }

    if (node.type === "loop") {
      const itemsExpr = node.data.itemsExpr || "input.split('\\n').filter(Boolean)";
      const bodyCode = node.data.bodyCode || "return context.item;";
      const maxIterations = node.data.maxIterations ?? 50;
      trace.push(`loop:${node.id} resolving items via "${itemsExpr.slice(0, 60)}"...`);
      const itemsResult = await evaluateLoopItems(
        itemsExpr,
        { input, context: { outputs, memoryContext } },
        maxIterations,
      );
      if (itemsResult.error) {
        outputs[node.id] = `Error: ${itemsResult.error}`;
        trace.push(`loop:${node.id} failed: ${itemsResult.error}`);
        continue;
      }
      const { results, errors } = await runLoopBody(itemsResult.items, bodyCode, {
        input,
        context: { outputs },
      });
      outputs[node.id] = JSON.stringify(results, null, 2);
      trace.push(
        `loop:${node.id} ran ${itemsResult.items.length} iteration(s)` +
          (errors > 0 ? `, ${errors} errored` : "") +
          (itemsResult.capped ? ` (capped from ${itemsResult.originalCount})` : ""),
      );
      continue;
    }

    if (node.type === "code") {
      const code = node.data.code || "return input;";
      trace.push(`code:${node.id} executing...`);
      const sandboxed = await runUserCode(code, { input, context: { outputs, memoryContext } }, {
        timeoutMs: 1500,
        memoryLimitMb: 32,
      });
      if (sandboxed.ok) {
        outputs[node.id] =
          typeof sandboxed.value === "string"
            ? sandboxed.value
            : JSON.stringify(sandboxed.value, null, 2);
        trace.push(
          `code:${node.id} result (${sandboxed.engine}, ${sandboxed.durationMs}ms): ${outputs[node.id].slice(0, 80)}`,
        );
      } else {
        outputs[node.id] = `Error: ${sandboxed.error || "unknown sandbox error"}`;
        trace.push(`code:${node.id} failed (${sandboxed.engine}): ${sandboxed.error}`);
      }
      continue;
    }

    if ((node.type as string) === "tool") {
      const toolName = (node.data as any).toolName || "";
      const toolArgsRaw = (node.data as any).toolArgs || "{}";
      trace.push(`tool:${node.id} calling ${toolName}...`);
      try {
        const argsResult = await evalToolArgs(toolArgsRaw, { input }, { timeoutMs: 500 });
        let args: Record<string, unknown> = {};
        if (argsResult.ok && argsResult.value && typeof argsResult.value === "object") {
          args = argsResult.value;
        } else {
          // Last-ditch fallback: try plain JSON parse so users typing the
          // simplest possible payload still work.
          try { args = JSON.parse(toolArgsRaw); } catch { args = {}; }
        }
        const toolResult = await executeToolWithCache(toolName, args);
        outputs[node.id] = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult, null, 2);
        trace.push(`tool:${node.id} executed ${toolName} successfully`);
      } catch (err: any) {
        outputs[node.id] = `Error: ${err.message}`;
        trace.push(`tool:${node.id} failed: ${err.message}`);
      }
      continue;
    }

    if ((node.type as string) === "telegram") {
      const explicitChatId = (node.data as any).chatId;
      // Use explicit chat id if provided, otherwise fallback to a context or default chat
      const targetChatId = explicitChatId || loadTelegramState().chats[0]?.chatId;
      
      if (!targetChatId) {
        outputs[node.id] = "Error: No Telegram chat ID provided and no active chats found.";
        trace.push(`telegram:${node.id} failed: no chat id`);
        continue;
      }

      trace.push(`telegram:${node.id} sending to ${targetChatId}...`);
      try {
        // Detect if input is a list of URLs to send as media group
        const lines = input.trim().split(/\n+/);
        const urls = lines.filter(l => /^https?:\/\//.test(l.trim()));
        
        if (urls.length > 1) {
          // If multiple URLs, use media group capability (via callTelegramApi)
          const mediaGroup = urls.slice(0, 10).map((url, i) => ({
            type: "photo", // default to photo
            media: url,
            ...(i === 0 ? { caption: `Workflow Output (${node.id})` } : {})
          }));
          await callTelegramApi("sendMediaGroup", {
            chat_id: targetChatId,
            media: mediaGroup
          });
        } else {
          await sendTelegramMessage(targetChatId, input, {
            action: "workflow-delivery",
            targetId: node.id
          });
        }
        
        outputs[node.id] = input; // pass through input
        trace.push(`telegram:${node.id} sent successfully`);
      } catch (err: any) {
        outputs[node.id] = `Error: ${err.message}`;
        trace.push(`telegram:${node.id} failed: ${err.message}`);
      }
      continue;
    }

    outputs[node.id] = input;
    trace.push(`output:${node.id}`);
  }

  if (memoryContext.length > 0) {
    trace.unshift(`memory:${memoryContext.length} relevant item(s) attached`);
  }
  trace.unshift(`tokens:${formatTokenUsage(workflowUsage)}`);

  return { outputs, trace, memoryContext, tokenUsage: workflowUsage, nodeUsage };
}

// ── Context Compression (ported from Hermes context_compressor.py) ──────────
const CHARS_PER_TOKEN = BUDGET_CHARS_PER_TOKEN;
const COMPRESS_TOKEN_THRESHOLD = 12_000;
const COMPRESS_TAIL_KEEP = 8;
const MESSAGE_CHAR_CAP = BUDGET_MESSAGE_CHAR_CAP;
// Prefix added to every compressed summary so the model treats it as history.
const COMPRESS_PREFIX =
  "[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were summarised below. " +
  "This is handoff context — treat it as background reference, NOT active instructions. " +
  "Do NOT re-answer questions from the summary; they were already handled. " +
  "Continue from the latest user message that appears AFTER this summary:";

const estimateMessagesTokens = budgetEstimateMessagesTokens;

const capMessageSizes = (messages: ChatMessage[]) => budgetCapMessageSizes(messages);

async function compressContextIfNeeded(
  cfg: AppConfig,
  messagesIn: ChatMessage[],
): Promise<ChatMessage[]> {
  const messages = capMessageSizes(messagesIn);
  if (estimateMessagesTokens(messages) <= COMPRESS_TOKEN_THRESHOLD) return messages;

  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  if (nonSystem.length <= COMPRESS_TAIL_KEEP) return messages;

  const toCompress = nonSystem.slice(0, nonSystem.length - COMPRESS_TAIL_KEEP);
  const tail = nonSystem.slice(nonSystem.length - COMPRESS_TAIL_KEEP);

  const summaryPrompt = [
    {
      role: "system" as const,
      content:
        "You are a conversation summarizer. Do NOT respond to any questions. " +
        "Write a compact summary of the conversation so far, preserving key decisions, " +
        "facts, code snippets, and any active task context. " +
        "Use markdown. Keep under 800 words.",
    },
    {
      role: "user" as const,
      content:
        "Summarize this conversation history:\n\n" +
        toCompress
          .map((m) => `${m.role.toUpperCase()}: ${(m.content as string).slice(0, 1500)}`)
          .join("\n\n"),
    },
  ];

  try {
    const { content: summary } = await callChatCompletions(cfg, summaryPrompt);
    const summaryMessage: ChatMessage = {
      role: "assistant",
      content: `${COMPRESS_PREFIX}\n\n${summary}`,
    };
    return [...systemMessages, summaryMessage, ...tail];
  } catch {
    // On failure, fall back to simple truncation — keep system + tail only.
    return [...systemMessages, ...tail];
  }
}

async function executeChatTurn(args: {
  cfg: AppConfig;
  messages: ChatMessage[];
  sessionId?: string;
  model?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  skillIds?: string[];
  resourceUris?: string[];
  onProgress?: (status: string) => void;
}) {
  const startedAt = Date.now();
  const { cfg, messages, onProgress } = args;
  if (messages.length === 0) {
    throw new Error("messages is required");
  }

  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message?.role === "user" && typeof message.content === "string");
  const memoryContext = lastUserMessage
    ? buildMemoryContext(lastUserMessage.content, 3)
    : [];
  let memoryPrompt = formatMemoryContext(memoryContext);

  if (lastUserMessage) {
    try {
      const vectors = loadVectorMemory();
      if (vectors.length > 0) {
        const queryVec = await embedText(cfg, lastUserMessage.content);
        const topHits = vectors
          .map((e) => ({ entry: e, score: cosineSimilarity(queryVec, e.embedding) }))
          .filter((h) => h.score > 0.3)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        if (topHits.length > 0) {
          const ragBlock = topHits
            .map((h, i) => {
              const t = h.entry.text.length > MEMORY_ITEM_CHAR_CAP
                ? `${h.entry.text.slice(0, MEMORY_ITEM_CHAR_CAP)}…`
                : h.entry.text;
              return `${i + 1}. (${h.score.toFixed(2)}) ${t}`;
            })
            .join("\n");
          memoryPrompt = memoryPrompt ? `${memoryPrompt}\n${ragBlock}` : ragBlock;
        }
      }
    } catch { /* RAG failure is non-fatal */ }
  }
  const normalizedSkillIds = normalizeSkillIds(args.skillIds);
  const skillPrompt = buildSkillPrompt(normalizedSkillIds);
  const normalizedResourceUris = Array.isArray(args.resourceUris)
    ? args.resourceUris
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index)
    : [];
  const appliedResources = normalizedResourceUris.map((uri) => readResource(uri));
  const resourcePrompt = appliedResources.length
    ? appliedResources
        .map(
          (resource, index) =>
            `Resource ${index + 1} - ${resource.uri}\n${truncateTelegramText(resource.text, 800)}`,
        )
        .join("\n\n")
    : "";
  const preparedMessages = [...messages];
  const expertPrompt = `You are Wings Of World, a Senior AI Architect and highly capable Assistant.
1. THINK BEFORE YOU ACT: Use your tools to verify facts, read files, or search your permanent knowledge base in D:\\MEMORY before concluding.
2. LONG-TERM MEMORY: You have access to search_knowledge. If the user refers to past projects, macros, or notes, search D:\\MEMORY first.
3. CHAIN OF THOUGHT: Break complex requests into clear steps before providing the final answer.
4. PRECISION: Provide exact, executable code without skipping parts.
5. TONE: Be professional, concise, and definitive.`;

  const augmentation = [
    expertPrompt,
    skillPrompt ? `Active skills:\n${skillPrompt}` : "",
    memoryPrompt ? `Relevant memory:\n${memoryPrompt}` : "",
    resourcePrompt ? `Attached resources:\n${resourcePrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const systemIndex = preparedMessages.findIndex((message) => message.role === "system");
  if (systemIndex >= 0) {
    preparedMessages[systemIndex] = {
      ...preparedMessages[systemIndex],
      content: `${preparedMessages[systemIndex].content}\n\n${augmentation}`,
    };
  } else {
    preparedMessages.unshift({
      role: "system",
      content: augmentation,
    });
  }

  const sessions = loadChatSessions();
  const existingSession =
    typeof args.sessionId === "string" && args.sessionId.trim()
      ? sessions.find((session) => session.id === args.sessionId?.trim())
      : undefined;
  const compressedMessages = await compressContextIfNeeded(cfg, preparedMessages);

  // Apply LLMLingua-style heuristic compression on top of the existing
  // context window guard. The latest user message stays verbatim; only
  // older system/memory/resource context gets pruned.
  const compressionLevel: CompressionLevel = (cfg.compressionLevel || "off") as CompressionLevel;
  let promptCompressionStats: { originalChars: number; compressedChars: number; ratio: number } | undefined;
  let messagesForLLM: ChatMessage[] = compressedMessages;
  if (compressionLevel !== "off") {
    const compressed = compressMessages(compressedMessages, {
      level: compressionLevel,
      minChars: cfg.compressionMinChars,
    });
    messagesForLLM = compressed.messages;
    promptCompressionStats = {
      originalChars: compressed.totalOriginalChars,
      compressedChars: compressed.totalCompressedChars,
      ratio: compressed.totalOriginalChars > 0
        ? compressed.totalCompressedChars / compressed.totalOriginalChars
        : 1,
    };
  }

  // 🔥 Upgrade from dumb chat to Agentic Loop with Tool Access
  // Codex Local is a CLI-backed provider, not an OpenAI-compatible HTTP target.
  const routingMode = (cfg.provider === "codex_local" ? "off" : (cfg.cascadeMode || "off")) as CascadeMode;
  let cascadeRecord: CascadeRecord | undefined;
  let content: string;
  let providerMeta: {
    provider: string;
    model: string;
    apiMode: string;
    usedFallback: boolean;
    baseURL: string;
  };
  let usage: TokenUsage;

  if (!args.model && routingMode !== "off") {
    const tiers = (cfg.cascadeTiers && (cfg.cascadeTiers.small || cfg.cascadeTiers.medium || cfg.cascadeTiers.large))
      ? cfg.cascadeTiers
      : defaultTiersFor(cfg.baseURL || "", cfg.provider);
    const cascade = await runCascade(
      {
        messages: messagesForLLM,
        tiers,
        mode: routingMode,
        escalationThreshold: cfg.cascadeEscalationThreshold,
      },
      {
        generate: async (target, options) => {
          onProgress?.(`Routing via ${options.tier}: ${target.model}`);
          const targetCfg = configForModelTarget(cfg, target);
          const routed = await runAgenticLoop(
            targetCfg,
            messagesForLLM,
            target.model,
            onProgress,
          );
          return {
            content: routed.content,
            tokensTotal: routed.usage.totalTokens,
          };
        },
      },
    );
    cascadeRecord = cascade.record;
    const finalAttempt = cascade.record.attempts[cascade.record.attempts.length - 1];
    if (cascade.finalTarget && finalAttempt) {
      const finalCfg = configForModelTarget(cfg, cascade.finalTarget);
      content = cascade.content;
      usage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: finalAttempt.tokensTotal || estimateTokens(cascade.content),
      };
      providerMeta = {
        provider: finalCfg.provider,
        model: cascade.finalTarget.model,
        apiMode: getApiMode(finalCfg),
        usedFallback: false,
        baseURL: finalCfg.baseURL,
      };
    } else {
      const direct = await runAgenticLoop(cfg, messagesForLLM, undefined, onProgress);
      content = direct.content;
      providerMeta = direct.providerMeta;
      usage = direct.usage;
    }
  } else {
    const direct = await runAgenticLoop(
      cfg,
      messagesForLLM,
      args.model,
      onProgress,
    );
    content = direct.content;
    providerMeta = direct.providerMeta;
    usage = direct.usage;
  }
  const sessionId =
    typeof args.sessionId === "string" && args.sessionId.trim()
      ? args.sessionId.trim()
      : makeSessionId();
  const persistedMessages = [
    ...messages,
    { role: "assistant" as const, content },
  ];
  const titleSource =
    lastUserMessage?.content?.trim() ||
    persistedMessages.find((message) => message.role === "user")?.content ||
    "New chat";
  const title = titleSource.slice(0, 60);
  const runCostEstimateUsd = estimateCostUsd(
    providerMeta.model,
    usage,
    cfg.pricingOverrides,
  );
  const nextSession: ChatSessionRecord = {
    id: sessionId,
    title,
    messages: persistedMessages,
    updatedAt: new Date().toISOString(),
    tokenUsage: addTokenUsage(existingSession?.tokenUsage, usage),
    costEstimateUsd: Number(
      ((existingSession?.costEstimateUsd || 0) + runCostEstimateUsd).toFixed(6),
    ),
  };
  const nextSessions = [
    nextSession,
    ...sessions.filter((session) => session.id !== sessionId),
  ].slice(0, 50);
  saveChatSessions(nextSessions);
  const execution = appendExecutionRecord({
    kind: "chat",
    status: "success",
    title: title || "Chat run",
    summary: `Reply generated for ${sessionId}`,
    inputPreview: lastUserMessage?.content?.slice(0, 280) || "",
    outputPreview: content.slice(0, 280),
    sessionId,
    model: providerMeta.model,
    memoryCount: memoryContext.length,
    tokenUsage: usage,
    costEstimateUsd: runCostEstimateUsd,
    durationMs: Date.now() - startedAt,
  });
  appendExecutionArtifact({
    executionId: execution.id,
    kind: "chat",
    status: "success",
    createdAt: execution.createdAt,
    input: { lastUserMessage: lastUserMessage?.content || "", preparedMessages },
    output: { content },
    memoryContext,
    sessionSnapshot: persistedMessages,
    metadata: {
      sessionId,
      model: providerMeta.model,
      skillIds: normalizedSkillIds,
      skillSummary: formatSkillSummary(normalizedSkillIds),
      resourceUris: normalizedResourceUris,
      apiMode: providerMeta.apiMode,
      provider: providerMeta.provider,
      usedFallback: providerMeta.usedFallback,
      providerBaseURL: providerMeta.baseURL,
      tokenUsage: usage,
      source: args.source || "app",
      cascade: cascadeRecord,
      promptCompression: promptCompressionStats,
      ...(args.metadata || {}),
    },
  });
  appendAuditEntry({
    area: "chat",
    action: "reply",
    status: "success",
    summary: `Replied in ${sessionId} via ${providerMeta.provider}${providerMeta.usedFallback ? " fallback" : ""} with ${memoryContext.length} memory item(s), skills:${normalizedSkillIds.length || 0}, resources:${normalizedResourceUris.length || 0}, ${usage.totalTokens} tokens, ${formatCostUsd(runCostEstimateUsd)}, ${Date.now() - startedAt}ms`,
    targetId: sessionId,
  });

  return {
    content,
    memoryContext,
    appliedResources,
    sessionId,
    preparedMessages,
    persistedMessages,
    title,
    providerMeta,
    appliedSkills: getSkillsByIds(normalizedSkillIds),
    tokenUsage: usage,
    sessionTokenUsage: nextSession.tokenUsage || usage,
    runCostEstimateUsd,
    sessionCostEstimateUsd: nextSession.costEstimateUsd || runCostEstimateUsd,
    promptCompression: promptCompressionStats,
    cascade: cascadeRecord,
  };
}

function appendFailedChatExecution(args: {
  error: unknown;
  messages: ChatMessage[];
  sessionId?: string;
  model?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}) {
  const lastUserMessage = [...args.messages]
    .reverse()
    .find((message) => message?.role === "user" && typeof message.content === "string");
  const execution = appendExecutionRecord({
    kind: "chat",
    status: "error",
    title: "Chat run failed",
    summary:
      args.error instanceof Error ? args.error.message : String(args.error),
    inputPreview: lastUserMessage?.content?.slice(0, 280) || "",
    sessionId:
      typeof args.sessionId === "string" && args.sessionId.trim()
        ? args.sessionId.trim()
        : undefined,
    model:
      typeof args.model === "string" && args.model.trim()
        ? args.model.trim()
        : undefined,
    memoryCount: 0,
  });
  appendExecutionArtifact({
    executionId: execution.id,
    kind: "chat",
    status: "error",
    createdAt: execution.createdAt,
    input: { lastUserMessage: lastUserMessage?.content || "", messages: args.messages },
    error: args.error instanceof Error ? args.error.message : String(args.error),
    sessionSnapshot: args.messages.filter(isValidChatMessage),
    metadata: {
      sessionId:
        typeof args.sessionId === "string" && args.sessionId.trim()
          ? args.sessionId.trim()
          : undefined,
      model:
        typeof args.model === "string" && args.model.trim()
          ? args.model.trim()
          : undefined,
      apiMode: getApiMode(loadConfig()),
      source: args.source || "app",
      ...(args.metadata || {}),
    },
  });
  appendAuditEntry({
    area: "chat",
    action: "reply",
    status: "error",
    summary: args.error instanceof Error ? args.error.message : String(args.error),
  });
}

function isTelegramEnabled() {
  return Boolean(TELEGRAM_BOT_TOKEN.trim());
}

function isTelegramChatAllowed(chatId: string) {
  if (TELEGRAM_ALLOWED_CHAT_IDS.length === 0) return true;
  return TELEGRAM_ALLOWED_CHAT_IDS.includes(chatId);
}

async function callTelegramApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  if (!isTelegramEnabled()) {
    throw new Error("Telegram bot token is not configured.");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const text = await response.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Telegram returned non-JSON: ${text.slice(0, 200)}`);
    }
  }
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.description || `Telegram ${response.status}`);
  }
  return data.result as T;
}

async function sendTelegramMessage(
  chatId: string,
  text: string,
  context?: { action?: string; targetId?: string },
  options?: { replyMarkup?: TelegramReplyMarkup },
) {
  const startedAt = Date.now();
  try {
    const result = await callTelegramApi<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text: truncateTelegramText(text),
      reply_markup: options?.replyMarkup,
    });
    appendAuditEntry({
      area: "system",
      action: context?.action || "telegram-delivery",
      status: "success",
      summary: `Telegram delivery succeeded for chat ${chatId} in ${Date.now() - startedAt}ms`,
      targetId: context?.targetId || chatId,
    });
    return result;
  } catch (error) {
    appendAuditEntry({
      area: "system",
      action: context?.action || "telegram-delivery",
      status: "error",
      summary: `Telegram delivery failed for chat ${chatId} in ${Date.now() - startedAt}ms: ${error instanceof Error ? error.message : String(error)}`,
      targetId: context?.targetId || chatId,
    });
    throw error;
  }
}

function getTelegramChatSession(chatId: string) {
  return loadTelegramState().chats.find((entry) => entry.chatId === chatId);
}

function truncateTelegramText(text: string, limit = TELEGRAM_MESSAGE_LIMIT) {
  const normalized = text.trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function parseTelegramCommand(text: string): ParsedTelegramCommand | null {
  const normalized = text.trim();
  if (!normalized.startsWith("/")) return null;
  const [token, ...rest] = normalized.split(/\s+/);
  const rawName = token.slice(1).split("@")[0]?.trim().toLowerCase();
  if (!rawName) return null;
  return {
    name: rawName,
    args: rest.join(" ").trim(),
  };
}

function validateTelegramInput(text: string, command: ParsedTelegramCommand | null) {
  if (text.length > TELEGRAM_INPUT_LIMIT) {
    return `Telegram message is too long. Keep messages under ${TELEGRAM_INPUT_LIMIT} characters.`;
  }
  if (command?.args && command.args.length > TELEGRAM_COMMAND_ARG_LIMIT) {
    return `Telegram command arguments are too long. Keep command arguments under ${TELEGRAM_COMMAND_ARG_LIMIT} characters.`;
  }
  return null;
}

function registerTelegramInboundActivity(chatId: string) {
  const now = Date.now();
  const cooldownUntil = TELEGRAM_RATE_LIMIT_UNTIL.get(chatId) || 0;
  if (cooldownUntil > now) {
    return { allowed: false, retryAfterMs: cooldownUntil - now };
  }

  const recent = (TELEGRAM_RECENT_ACTIVITY.get(chatId) || []).filter(
    (timestamp) => now - timestamp <= TELEGRAM_RATE_LIMIT_WINDOW_MS,
  );
  recent.push(now);
  TELEGRAM_RECENT_ACTIVITY.set(chatId, recent);

  if (recent.length > TELEGRAM_RATE_LIMIT_MAX_MESSAGES) {
    const until = now + TELEGRAM_RATE_LIMIT_COOLDOWN_MS;
    TELEGRAM_RATE_LIMIT_UNTIL.set(chatId, until);
    return { allowed: false, retryAfterMs: TELEGRAM_RATE_LIMIT_COOLDOWN_MS };
  }

  return {
    allowed: true,
    remaining: Math.max(0, TELEGRAM_RATE_LIMIT_MAX_MESSAGES - recent.length),
  };
}

function formatTelegramTimestamp(value?: string) {
  if (!value) return "-";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Date(timestamp).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildTelegramMemorySource(chatId: string, sessionId?: string) {
  return sessionId ? `telegram:${chatId}:${sessionId}` : `telegram:${chatId}`;
}

function createMemoryEntry(input: {
  content: string;
  memoryType?: MemoryEntry["memoryType"];
  source: string;
  importanceScore?: number;
}) {
  const now = new Date().toISOString();
  return {
    id: makeMemoryId(),
    content: input.content.trim(),
    memoryType: input.memoryType || "context",
    source: input.source,
    importanceScore:
      typeof input.importanceScore === "number"
        ? Math.max(0, Math.min(1, input.importanceScore))
        : 0.7,
    createdAt: now,
    updatedAt: now,
  } satisfies MemoryEntry;
}

function saveMemoryEntry(entry: MemoryEntry) {
  const entries = loadMemoryEntries();
  saveMemoryEntries([entry, ...entries.filter((item) => item.id !== entry.id)].slice(0, 500));
  appendAuditEntry({
    area: "memory",
    action: "save",
    status: "success",
    summary: `Saved memory ${entry.id} from ${entry.source}`,
    targetId: entry.id,
  });
  return entry;
}

function getTelegramSessionSummary(chatId: string) {
  const current = getTelegramChatSession(chatId);
  if (!current) {
    return "No Telegram session yet.\nSend a normal message to start one, or use /new to create a fresh session.";
  }
  const session = loadChatSessions().find((entry) => entry.id === current.sessionId);
  const lastExecution = loadExecutionHistory().find(
    (entry) => entry.kind === "chat" && entry.sessionId === current.sessionId,
  );
  const userMessageCount =
    session?.messages.filter((message) => message.role === "user").length || 0;
  return [
    `Session ID: ${current.sessionId}`,
    `Chat: ${current.title || current.username || current.chatId}`,
    `Last activity: ${formatTelegramTimestamp(current.lastMessageAt)}`,
    `User messages: ${userMessageCount}`,
    `Skills: ${formatSkillSummary(current.activeSkillIds)}`,
    `Usage: ${session?.tokenUsage ? formatTokenUsage(session.tokenUsage) : "No usage yet"}`,
    `Estimated cost: ${formatCostUsd(session?.costEstimateUsd || 0)}`,
    lastExecution?.durationMs ? `Last latency: ${lastExecution.durationMs}ms` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function describeTelegramSession(chatId: string) {
  return getTelegramSessionSummary(chatId);
}

function getTelegramCommandHelp() {
  return [
    "Wings Of World Telegram commands:",
    "/start - connect and pin the command menu",
    "/menu - show the quick-action keyboard again",
    "/help - command list with examples",
    "/status - current Telegram session summary",
    "/session - richer session details",
    "/new - start a fresh session",
    "/reset - alias for /new",
    "/model - active provider and fallback status",
    "/usage - token and cost usage for this Telegram session",
    "/memory - memory backend, count, and freshest notes",
    "/skills - list available skills",
    "/skill <id>|clear - set or clear active skills for this chat",
    "/prompts - list prompt templates",
    "/prompt <id> [topic] - render a prompt template",
    "/resources - list context resources",
    "/resource <uri> - read a resource snapshot",
    "/tasks - list open human tasks",
    "/todo <text> - create a human task",
    "/done <taskId> - mark a human task done",
    "/projects - list recent project requests",
    "/project plan ... - draft a project request",
    "/project status <requestId> - inspect a project request",
    "/project approve <requestId> - create the project files for real",
    "/remember <text> - save a note into Wings Of World memory",
    "/find <query> - search top memory matches",
    "/health - provider and Telegram health",
    "",
    "Examples:",
    "/remember User prefers concise status reports.",
    "/skill operator",
    "/prompt incident_triage telegram bot is silent",
    "/resource wings://system/health",
    "/todo Restart the modem in the server room.",
    "/done task_123456_abcd",
    "/project plan name=CRM-System | stack=Next.js + Node | features=auth,dashboard",
    "/project approve prj_123456_abcd",
    "/find telegram fallback",
  ].join("\n");
}

function getTelegramUsageSummary(chatId: string) {
  const current = getTelegramChatSession(chatId);
  if (!current) return "No Telegram session yet. Send a message first.";
  const session = loadChatSessions().find((entry) => entry.id === current.sessionId);
  if (!session?.tokenUsage) {
    return "No token usage has been recorded for this Telegram session yet.";
  }
  const lastExecution = loadExecutionHistory().find(
    (entry) => entry.kind === "chat" && entry.sessionId === current.sessionId,
  );
  return [
    `Session ${current.sessionId}`,
    formatTokenUsage(session.tokenUsage),
    `Estimated cost: ${formatCostUsd(session.costEstimateUsd || 0)}`,
    lastExecution?.durationMs ? `Last reply latency: ${lastExecution.durationMs}ms` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function getTelegramModelSummary() {
  const cfg = loadConfig();
  return [
    `Primary: ${cfg.provider} / ${cfg.model}`,
    `Fallback: ${cfg.fallbackEnabled ? `${cfg.fallbackProvider} / ${cfg.fallbackModel}` : "disabled"}`,
  ].join("\n");
}

function buildTelegramModelKeyboard(page = 0, tab?: ModelCategory): TelegramInlineKeyboardMarkup {
  const cfg = loadConfig();
  // Default the tab to whichever category the active model belongs to so the
  // user lands on a tab they can see is currently selected.
  const activeIdx = TELEGRAM_MODEL_PRESETS.findIndex(
    (p) => p.provider === cfg.provider && p.model === cfg.model,
  );
  const inferredTab = activeIdx >= 0 ? findPresetCategory(TELEGRAM_MODEL_PRESETS, activeIdx) : "direct";
  return buildModelKeyboard({
    presets: TELEGRAM_MODEL_PRESETS,
    pageSize: TELEGRAM_MODEL_BUTTONS_PER_PAGE,
    page,
    tab: tab ?? inferredTab,
    active: { provider: cfg.provider, model: cfg.model },
  });
}

function getTelegramSkillsSummary() {
  return [
    "Available Wings Of World skills:",
    ...getSkillCatalog().map(
      (skill) => `${skill.id} - ${skill.title}: ${skill.summary}`,
    ),
  ].join("\n");
}

function getTelegramSkillSelectionSummary(chatId: string) {
  return `Active skills: ${formatSkillSummary(getTelegramChatSession(chatId)?.activeSkillIds)}`;
}

function getTelegramPromptsSummary() {
  return [
    "Available prompt templates:",
    ...getPromptCatalog().map(
      (prompt) => `${prompt.id} - ${prompt.title}: ${prompt.description}`,
    ),
  ].join("\n");
}

function getTelegramResourcesSummary() {
  return [
    "Available resources:",
    ...getResourceCatalog().map(
      (resource) => `${resource.uri} - ${resource.name}: ${resource.description}`,
    ),
  ].join("\n");
}

function summarizeHumanTasks(limit = 5) {
  const tasks = loadHumanTasks();
  const pending = tasks.filter((task) => task.status === "pending" || task.status === "in_progress");
  return [
    `Human tasks: ${tasks.length} total / ${pending.length} open`,
    ...(pending.slice(0, limit).map(
      (task, index) => {
        const route = task.command ? `/${task.command.route}` : "";
        return `${index + 1}. [${task.priority}${route}] ${task.id} - ${task.title} (${task.status})`;
      },
    )),
    ...(pending.length === 0 ? ["No open human tasks."] : []),
  ].join("\n");
}

function slugifyProjectName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `project-${Date.now()}`;
}

function ensureProjectsRoot() {
  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
}

function resolveProjectPath(candidateName: string, requestedPath?: string) {
  ensureProjectsRoot();
  const fallbackPath = path.join(PROJECTS_ROOT, candidateName);
  const resolved = path.resolve(requestedPath?.trim() || fallbackPath);
  const relative = path.relative(PROJECTS_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Project path must stay inside ${PROJECTS_ROOT}.`);
  }
  return resolved;
}

function parseProjectSpecFromTelegram(args: string) {
  const tokens = args
    .split(/\s*[|;]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const named = new Map<string, string>();
  const unnamed: string[] = [];
  for (const token of tokens) {
    const separatorIndex = token.indexOf("=");
    if (separatorIndex > 0) {
      named.set(
        token.slice(0, separatorIndex).trim().toLowerCase(),
        token.slice(separatorIndex + 1).trim(),
      );
    } else {
      unnamed.push(token);
    }
  }

  const name = (named.get("name") || unnamed[0] || "").trim();
  if (!name) {
    throw new Error(
      "Usage:\n/project plan name=CRM-System | stack=Next.js + Node | features=auth,dashboard | notes=optional\n\nThen approve with:\n/project approve <requestId>",
    );
  }

  const slug = slugifyProjectName(name);
  const stack = (named.get("stack") || "General project").trim();
  const features = (named.get("features") || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 12);
  const notes = named.get("notes")?.trim();
  const requestedPath = (named.get("path") || "").trim() || path.join(PROJECTS_ROOT, slug);
  const projectPath = resolveProjectPath(slug, requestedPath);
  return {
    name: name.slice(0, 120),
    slug,
    stack: stack.slice(0, 200),
    features,
    requestedPath,
    projectPath,
    notes: notes ? notes.slice(0, 500) : undefined,
  };
}

function buildProjectRequestSummary(request: ProjectRequest) {
  return [
    `Project request ${request.id}`,
    `Status: ${request.status}`,
    `Name: ${request.spec.name}`,
    `Path: ${request.spec.projectPath}`,
    `Stack: ${request.spec.stack}`,
    `Features: ${request.spec.features.length ? request.spec.features.join(", ") : "none listed"}`,
    request.spec.notes ? `Notes: ${request.spec.notes}` : undefined,
    request.status === "draft" ? `Approve with:\n/project approve ${request.id}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function listProjectRequestsSummary(limit = 8) {
  const requests = loadProjectRequests().slice(0, limit);
  if (requests.length === 0) {
    return "No project requests yet.\nUse /project plan name=MyApp | stack=Next.js + Node | features=auth,dashboard";
  }
  return [
    "Recent project requests:",
    ...requests.map(
      (request, index) =>
        `${index + 1}. [${request.status}] ${request.id} - ${request.spec.name} -> ${request.spec.projectPath}`,
    ),
  ].join("\n");
}

function createProjectRequest(input: {
  source: string;
  requestedBy?: string;
  chatId?: string;
  spec: ProjectRequestSpec;
}) {
  const now = new Date().toISOString();
  const request: ProjectRequest = {
    id: makeProjectRequestId(),
    status: "draft",
    source: input.source,
    requestedBy: input.requestedBy,
    chatId: input.chatId,
    createdAt: now,
    updatedAt: now,
    summary: `Planned ${input.spec.name} (${input.spec.stack})`,
    spec: input.spec,
  };
  const requests = loadProjectRequests();
  saveProjectRequests([request, ...requests].slice(0, 300));
  appendAuditEntry({
    area: "system",
    action: "project-request-create",
    status: "success",
    summary: `Created draft project request ${request.id} for ${request.spec.name}`,
    targetId: request.id,
  });
  return request;
}

function writeProjectFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function createProjectScaffold(request: ProjectRequest) {
  ensureProjectsRoot();
  if (fs.existsSync(request.spec.projectPath)) {
    const existingEntries = fs.readdirSync(request.spec.projectPath);
    if (existingEntries.length > 0) {
      throw new Error(
        `Project path already exists and is not empty: ${request.spec.projectPath}`,
      );
    }
  }
  fs.mkdirSync(request.spec.projectPath, { recursive: true });
  const createdFiles: string[] = [];
  const createdAt = new Date().toISOString();
  const briefFeatures = request.spec.features.length
    ? request.spec.features.map((feature) => `- ${feature}`).join("\n")
    : "- Define the initial feature list";

  const readmePath = path.join(request.spec.projectPath, "README.md");
  writeProjectFile(
    readmePath,
    `# ${request.spec.name}\n\n## Stack\n${request.spec.stack}\n\n## Features\n${briefFeatures}\n\n## Notes\n${request.spec.notes || "No notes provided."}\n`,
  );
  createdFiles.push(readmePath);

  const docsDir = path.join(request.spec.projectPath, "docs");
  const briefPath = path.join(docsDir, "PROJECT-BRIEF.md");
  writeProjectFile(
    briefPath,
    `# Project Brief\n\n## Objective\n- Build ${request.spec.name}\n\n## Stack\n- ${request.spec.stack}\n\n## Requested Features\n${briefFeatures}\n\n## Notes\n- ${request.spec.notes || "No extra notes"}\n\n## Requested Via\n- ${request.source}\n- ${createdAt}\n`,
  );
  createdFiles.push(briefPath);

  const backlogPath = path.join(docsDir, "BACKLOG.md");
  writeProjectFile(
    backlogPath,
    `# Backlog\n\n## Setup\n- [ ] Create runtime and dependency baseline\n- [ ] Confirm repository structure\n\n## First Features\n${request.spec.features.length ? request.spec.features.map((feature) => `- [ ] ${feature}`).join("\n") : "- [ ] Define first feature set"}\n`,
  );
  createdFiles.push(backlogPath);

  const architecturePath = path.join(docsDir, "ARCHITECTURE.md");
  writeProjectFile(
    architecturePath,
    `# Architecture\n\n## Overview\n- Project: ${request.spec.name}\n- Stack: ${request.spec.stack}\n\n## Initial Boundaries\n- Replace this section with real module and deployment decisions.\n`,
  );
  createdFiles.push(architecturePath);

  const srcKeepPath = path.join(request.spec.projectPath, "src", ".gitkeep");
  writeProjectFile(srcKeepPath, "");
  createdFiles.push(srcKeepPath);

  if (fs.existsSync(OBSIDIAN_VAULT_PATH)) {
    fs.mkdirSync(OBSIDIAN_PROJECTS_DIR, { recursive: true });
    const obsidianNotePath = path.join(OBSIDIAN_PROJECTS_DIR, `${request.spec.slug}.md`);
    writeProjectFile(
      obsidianNotePath,
      `---\ntype: project-brief\nproject: ${request.spec.name}\nstatus: planned\ncreated: ${createdAt}\n---\n\n# ${request.spec.name}\n\n## Path\n- \`${request.spec.projectPath}\`\n\n## Stack\n- ${request.spec.stack}\n\n## Features\n${briefFeatures}\n\n## Notes\n- ${request.spec.notes || "No extra notes"}\n\n## Source\n- ${request.source}\n`,
    );
    createdFiles.push(obsidianNotePath);
  }

  return createdFiles;
}

function approveProjectRequest(requestId: string) {
  const requests = loadProjectRequests();
  const current = requests.find((entry) => entry.id === requestId);
  if (!current) {
    throw new Error(`Project request not found: ${requestId}`);
  }
  if (current.status === "created") {
    return current;
  }
  const now = new Date().toISOString();
  appendAuditEntry({
    area: "system",
    action: "project-request-approve",
    status: "success",
    summary: `Approved project request ${current.id} for ${current.spec.name}`,
    targetId: current.id,
  });
  try {
    const createdFiles = createProjectScaffold(current);
    const next: ProjectRequest = {
      ...current,
      status: "created",
      approvedAt: current.approvedAt || now,
      executedAt: now,
      updatedAt: now,
      createdFiles,
      error: undefined,
    };
    saveProjectRequests(requests.map((entry) => (entry.id === requestId ? next : entry)));
    appendAuditEntry({
      area: "system",
      action: "project-create",
      status: "success",
      summary: `Created project ${next.spec.name} at ${next.spec.projectPath}`,
      targetId: next.id,
    });
    return next;
  } catch (error) {
    const next: ProjectRequest = {
      ...current,
      status: "error",
      approvedAt: current.approvedAt || now,
      updatedAt: now,
      error: error instanceof Error ? error.message : String(error),
    };
    saveProjectRequests(requests.map((entry) => (entry.id === requestId ? next : entry)));
    appendAuditEntry({
      area: "system",
      action: "project-create",
      status: "error",
      summary: next.error || "Project creation failed",
      targetId: next.id,
    });
    throw error;
  }
}

function getTelegramMemorySummary() {
  const memories = loadMemoryEntries();
  const latest = memories.slice(0, 3);
  return [
    `Memory backend: ${obsidianMemoryEnabled() ? "Obsidian" : "local json"}`,
    `Items: ${memories.length}`,
    ...(latest.length > 0
      ? ["Recent memory:", ...latest.map((entry, index) => `${index + 1}. [${entry.memoryType}] ${truncateTelegramText(entry.content, 120)}`)]
      : ["Recent memory: none"]),
  ].join("\n");
}

function getTelegramHealthSummary() {
  const cfg = loadConfig();
  const providerHealth = getProviderHealthSnapshot(cfg);
  return [
    `Primary configured: ${providerHealth.primary.configured ? "yes" : "no"}`,
    `Primary: ${providerHealth.primary.provider} / ${providerHealth.primary.model}`,
    `Fallback: ${providerHealth.fallback.enabled ? `${providerHealth.fallback.provider} / ${providerHealth.fallback.model}` : "disabled"}`,
    providerHealth.lastIssue
      ? `Last issue: ${truncateTelegramText(providerHealth.lastIssue.summary, 280)}`
      : "Last issue: none",
  ].join("\n");
}

function searchTelegramMemory(query: string, limit = 5) {
  const matches = buildMemoryContext(query, limit);
  if (matches.length === 0) {
    return `No memory matches found for "${query}".`;
  }
  return [
    `Top memory matches for "${query}":`,
    ...matches.map(
      (entry, index) =>
        `${index + 1}. [${entry.memoryType}] ${truncateTelegramText(entry.content, 140)}\nsource: ${entry.source}`,
    ),
  ].join("\n");
}

function logTelegramCommand(chatId: string, command: string, args?: string) {
  appendAuditEntry({
    area: "system",
    action: "telegram-command",
    status: "success",
    summary: args ? `/${command} ${truncateTelegramText(args, 80)}` : `/${command}`,
    targetId: chatId,
  });
}

async function configureTelegramCommands() {
  if (!isTelegramEnabled()) return;
  await callTelegramApi("setMyCommands", {
    commands: [
      { command: "start", description: "Start Wings Of World in Telegram" },
      { command: "menu", description: "Show quick action keyboard" },
      { command: "help", description: "Show command list" },
      { command: "status", description: "Show current session" },
      { command: "session", description: "Show detailed session summary" },
      { command: "new", description: "Start a new session" },
      { command: "reset", description: "Reset the current session" },
      { command: "model", description: "Show active model and fallback" },
      { command: "usage", description: "Show token usage" },
      { command: "memory", description: "Show memory backend summary" },
      { command: "skills", description: "List available skills" },
      { command: "skill", description: "Select skills for this chat" },
      { command: "prompts", description: "List prompt templates" },
      { command: "prompt", description: "Render a prompt template" },
      { command: "resources", description: "List available resources" },
      { command: "resource", description: "Read a resource snapshot" },
      { command: "tasks", description: "List human tasks" },
      { command: "todo", description: "Create a human task" },
      { command: "done", description: "Close a human task" },
      { command: "projects", description: "List project requests" },
      { command: "project", description: "Plan or approve a project" },
      { command: "remember", description: "Save a note into memory" },
      { command: "find", description: "Search memory notes" },
      { command: "health", description: "Show provider and bot health" },
    ],
  });
}

function upsertTelegramChatState(next: TelegramChatState) {
  const state = loadTelegramState();
  state.chats = [
    next,
    ...state.chats.filter((entry) => entry.chatId !== next.chatId),
  ].slice(0, 100);
  state.lastPollAt = new Date().toISOString();
  state.lastError = undefined;
  saveTelegramState(state);
}

interface TelegramCallbackDeps {
  answerCallback?: (callbackQueryId: string, options?: { text?: string; showAlert?: boolean }) => Promise<void>;
  editMessage?: (chatId: string, messageId: number, text: string, replyMarkup?: TelegramReplyMarkup) => Promise<void>;
}

async function answerTelegramCallback(callbackQueryId: string, options?: { text?: string; showAlert?: boolean }): Promise<void> {
  await callTelegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: options?.text,
    show_alert: options?.showAlert ?? false,
  });
}

async function editTelegramMessage(chatId: string, messageId: number, text: string, replyMarkup?: TelegramReplyMarkup): Promise<void> {
  await callTelegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: truncateTelegramText(text),
    reply_markup: replyMarkup,
  });
}

async function handleTelegramCallback(
  callback: any,
  deps?: TelegramCallbackDeps,
): Promise<void> {
  const id = String(callback?.id || "");
  const chatId = String(callback?.message?.chat?.id || "");
  const messageId = Number(callback?.message?.message_id || 0);
  const data = typeof callback?.data === "string" ? callback.data : "";
  if (!id || !chatId || !data) return;

  const answer = deps?.answerCallback || answerTelegramCallback;
  const edit = deps?.editMessage || editTelegramMessage;

  if (!isTelegramChatAllowed(chatId)) {
    await answer(id, { text: "This chat is not allowed.", showAlert: true });
    return;
  }

  appendAuditEntry({
    area: "system",
    action: "telegram-callback",
    status: "success",
    summary: `Callback ${data} from chat ${chatId}`,
    targetId: chatId,
  });

  if (data.startsWith("tg:menu:")) {
    const menuType = data.slice("tg:menu:".length);
    await answer(id);
    switch (menuType) {
      case "chat":
        await edit(chatId, messageId, "🤖 *AI Chat Mode*\nSend any message to start talking with the AI.");
        break;
      case "macros":
        await edit(chatId, messageId, "⚡ *Macro Templates*\nSelect a saved macro to execute system tasks autonomously:", buildTelegramMacroMenu());
        break;
      case "workflows":
        const workflows = loadWorkflows() as any[];
        await edit(chatId, messageId, "🌊 *Your Workflows*\nSelect a workflow to execute:", buildTelegramWorkflowMenu(workflows));
        break;
// ... (later in the function)
  if (data.startsWith("tg:macro:run:")) {
    const macroName = data.slice("tg:macro:run:".length);
    const macros = loadMacros();
    const macro = macros.find(m => m.name === macroName);
    if (!macro) {
      await answer(id, { text: "Macro not found", showAlert: true });
      return;
    }
    await answer(id, { text: `Running Macro: ${macroName}` });
    await edit(chatId, messageId, `⏳ *Autonomous Macro Running...*\nObjective: ${macro.task}`);
    
    try {
      const result = await runMacroLoop(macro.task);
      const summary = result.steps.map(s => `• ${s.action}: ${s.thought?.slice(0, 50)}...`).join("\n");
      await edit(chatId, messageId, `✅ *Macro Complete: ${macroName}*\n\n*Steps:*\n${summary}\n\n*Final State:*\n${result.finalState.slice(0, 1000)}`, buildTelegramMainMenu());
    } catch (err: any) {
      await edit(chatId, messageId, `❌ *Macro Failed*\nError: ${err.message}`, buildTelegramMainMenu());
    }
    return;
  }
      case "tools":
        await edit(chatId, messageId, `🛠️ *Available Tools*\n${TOOL_DEFINITIONS.map(t => `• ${t.name}`).join("\n")}\n\nUse them via AI chat or Workflows.`);
        break;
      case "agents":
        await edit(chatId, messageId, `🧠 *Agent System*\n${AGENT_CATALOG.map((a: any) => `• ${a.title} (${a.status})`).join("\n")}`);
        break;
      case "memory":
        await edit(chatId, messageId, getTelegramMemorySummary());
        break;
      case "usage":
        await edit(chatId, messageId, getTelegramUsageSummary(chatId));
        break;
      case "settings":
        await edit(chatId, messageId, "⚙️ *System Settings*\nSettings are managed via the Wings Of World Web UI for security.");
        break;
      case "help":
        await edit(chatId, messageId, getTelegramCommandHelp());
        break;
      case "main":
        await edit(chatId, messageId, "⚡ *Wings Of World Dashboard*\nSelect an action below to interact with your AI system.", buildTelegramMainMenu());
        break;
    }
    return;
  }

  if (data.startsWith("tg:wf:run:")) {
    const workflowId = data.slice("tg:wf:run:".length);
    const workflows = loadWorkflows() as any[];
    const wf = workflows.find((w: any) => w.id === workflowId);
    if (!wf) {
      await answer(id, { text: "Workflow not found", showAlert: true });
      return;
    }
    await answer(id, { text: `Running: ${wf.name}` });
    await edit(chatId, messageId, `⏳ *Executing Workflow...*\nName: ${wf.name}\nID: ${workflowId}`);
    
    try {
      const config = loadConfig();
      const result = await executeWorkflow(wf, "Triggered from Telegram", config);
      const output = Object.values(result.outputs).at(-1) || "No output";
      await edit(chatId, messageId, `✅ *Workflow Complete*\n\n*Result:*\n${output.slice(0, 3000)}`, buildTelegramMainMenu());
    } catch (err: any) {
      await edit(chatId, messageId, `❌ *Workflow Failed*\nError: ${err.message}`, buildTelegramMainMenu());
    }
    return;
  }

  const action = parseModelCallback(data, TELEGRAM_MODEL_PRESETS);
  const editKeyboard = async (page: number, tab?: ModelCategory) => {
    if (!messageId) return;
    try {
      await edit(
        chatId,
        messageId,
        `${getTelegramModelSummary()}\n\nTap a button to switch:`,
        buildTelegramModelKeyboard(page, tab),
      );
    } catch { /* ignore — message may be too old to edit */ }
  };

  switch (action.type) {
    case "noop":
      await answer(id);
      return;
    case "close":
      await answer(id, { text: "Closed" });
      if (messageId) {
        try { await edit(chatId, messageId, getTelegramModelSummary()); } catch { /* ignore */ }
      }
      return;
    case "page":
      await answer(id);
      await editKeyboard(action.page);
      return;
    case "nav":
      await answer(id);
      await editKeyboard(action.page, action.tab);
      return;
    case "tab":
      await answer(id, { text: action.tab === "openrouter" ? "OpenRouter" : "Direct API" });
      await editKeyboard(0, action.tab);
      return;
    case "set": {
      const cfg = loadConfig();
      const next: AppConfig = {
        ...cfg,
        provider: action.preset.provider as AppConfig["provider"],
        model: action.preset.model,
        baseURL: action.preset.baseURL || cfg.baseURL,
        updatedAt: new Date().toISOString(),
      };
      saveConfig(next);
      appendAuditEntry({
        area: "settings",
        action: "telegram-model-switch",
        status: "success",
        summary: `Switched to ${action.preset.provider}/${action.preset.model} via Telegram`,
        targetId: chatId,
      });
      await answer(id, { text: `Switched to ${action.preset.label}` });
      const presetCategory = findPresetCategory(TELEGRAM_MODEL_PRESETS, action.index);
      // Compute the page within the active tab, not the global preset list.
      const tabPresets = filterPresetsByCategory(TELEGRAM_MODEL_PRESETS, presetCategory);
      const localPosition = tabPresets.findIndex(
        (p) => p.provider === action.preset.provider && p.model === action.preset.model,
      );
      const tabPage = Math.max(0, Math.floor(localPosition / TELEGRAM_MODEL_BUTTONS_PER_PAGE));
      await editKeyboard(tabPage, presetCategory);
      return;
    }
    default:
      await answer(id);
      return;
  }
}

async function transcribeTelegramVoice(fileId: string, cfg: AppConfig): Promise<string> {
  try {
    // 1. Get file path from Telegram
    const fileRes = await callTelegramApi<any>("getFile", { file_id: fileId });
    if (!fileRes?.file_path) throw new Error("Could not get file path from Telegram");
    
    // 2. Download the voice file
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileRes.file_path}`;
    const audioRes = await fetch(fileUrl);
    if (!audioRes.ok) throw new Error("Failed to download voice message");
    
    // 3. Prepare form data for Whisper API (using OpenAI as default standard)
    // You must have an OpenAI API key configured for this feature to work fully.
    const buffer = await audioRes.arrayBuffer();
    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: "audio/ogg" }), "voice.ogg");
    formData.append("model", "whisper-1");
    
    // Fallback to OpenAI Whisper if local model doesn't support audio
    const apiKey = cfg.provider === "openai" ? cfg.apiKey : process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI API Key is missing. Please add it to process voice messages.");

    const whisperUrl = "https://api.openai.com/v1/audio/transcriptions";
    const transRes = await fetch(whisperUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: formData as any,
    });
    
    if (!transRes.ok) throw new Error("Transcription failed");
    const data = await transRes.json();
    return data.text || "";
  } catch (err: any) {
    throw new Error(`Voice Error: ${err.message}`);
  }
}

async function handleTelegramMessage(
  message: any,
  deps?: {
    sendMessage?: typeof sendTelegramMessage;
  },
) {
  const chatId = String(message?.chat?.id || "");
  let text = typeof message?.text === "string" ? message.text.trim() : "";
  const reply = deps?.sendMessage || sendTelegramMessage;

  // Voice Message Intercept
  if (message?.voice && !text) {
    try {
      await callTelegramApi("sendChatAction", { chat_id: chatId, action: "typing" });
      const cfg = loadConfig();
      text = await transcribeTelegramVoice(message.voice.file_id, cfg);
      await reply(chatId, `🎙️ *Voice Transcribed:*\n_${text}_`);
    } catch (err: any) {
      await reply(chatId, `❌ *Voice Error:*\n${err.message}`);
      return;
    }
  }

  if (!chatId || !text) return;
  const command = parseTelegramCommand(text);

  appendAuditEntry({
    area: "system",
    action: "telegram-receive",
    status: "success",
    summary: `Telegram message received in chat ${chatId}: ${text.slice(0, 80)}`,
    targetId: chatId,
  });

  if (!isTelegramChatAllowed(chatId)) {
    await reply(chatId, "This Telegram chat is not allowed to use Wings Of World.", {
      action: "telegram-delivery",
      targetId: chatId,
    });
    return;
  }

  const validationError = validateTelegramInput(text, command);
  if (validationError) {
    appendAuditEntry({
      area: "system",
      action: "telegram-guard",
      status: "error",
      summary: validationError,
      targetId: chatId,
    });
    await reply(chatId, validationError, {
      action: "telegram-delivery",
      targetId: chatId,
    }, { replyMarkup: TELEGRAM_REPLY_KEYBOARD });
    return;
  }

  const rateLimitState = registerTelegramInboundActivity(chatId);
  if (!rateLimitState.allowed) {
    const retrySeconds = Math.max(1, Math.ceil((rateLimitState.retryAfterMs || 1_000) / 1_000));
    appendAuditEntry({
      area: "system",
      action: "telegram-rate-limit",
      status: "error",
      summary: `Rate limited Telegram chat ${chatId}; retry after ${retrySeconds}s`,
      targetId: chatId,
    });
    await reply(
      chatId,
      `Too many Telegram messages too quickly. Wait about ${retrySeconds}s and try again.`,
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
    );
    return;
  }

  if (command?.name === "start") {
    logTelegramCommand(chatId, command.name);
    await reply(
      chatId,
      "Wings Of World is connected.\n\nUse /menu for quick buttons, /help for examples, /remember to save notes, and /find to search memory from Telegram.",
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
    );
    return;
  }

  if (command?.name === "menu" || text === "🏠 Menu") {
    logTelegramCommand(chatId, "menu");
    await reply(
      chatId,
      "⚡ *Wings Of World Dashboard*\nSelect an action below to interact with your AI system.",
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: buildTelegramMainMenu() },
    );
    return;
  }

  if (command?.name === "workflows" || text === "🌊 Workflows") {
    logTelegramCommand(chatId, "workflows");
    const workflows = loadWorkflows() as any[];
    if (workflows.length === 0) {
      await reply(chatId, "No workflows found. Create one in the Visual Editor first!");
      return;
    }
    await reply(
      chatId,
      "🌊 *Your Workflows*\nTap a workflow to execute it with the default trigger.",
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: buildTelegramWorkflowMenu(workflows) },
    );
    return;
  }

  if (command?.name === "status" || text === "🧠 Status") {
    logTelegramCommand(chatId, "status");
    await reply(chatId, getTelegramHealthSummary(), { action: "telegram-delivery" });
    return;
  }

  if (command?.name === "usage" || text === "📊 Usage") {
    logTelegramCommand(chatId, "usage");
    await reply(chatId, getTelegramUsageSummary(chatId), { action: "telegram-delivery" });
    return;
  }

  if (command?.name === "model" || text === "⚙️ Model") {
    logTelegramCommand(chatId, "model");
    const summary = `${getTelegramModelSummary()}\n\nTap a button to switch:`;
    await reply(
      chatId,
      summary,
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: buildTelegramModelKeyboard(0) },
    );
    return;
  }

  if (command?.name === "memory" || text === "📝 Memory") {
    logTelegramCommand(chatId, "memory");
    await reply(chatId, getTelegramMemorySummary(), { action: "telegram-delivery" });
    return;
  }

  if (command?.name === "help") {
    logTelegramCommand(chatId, command.name);
    await reply(chatId, getTelegramCommandHelp(), {
      action: "telegram-delivery",
      targetId: chatId,
    }, { replyMarkup: TELEGRAM_REPLY_KEYBOARD });
    return;
  }

  if (command?.name === "status") {
    logTelegramCommand(chatId, command.name);
    await reply(chatId, describeTelegramSession(chatId), {
      action: "telegram-delivery",
      targetId: chatId,
    });
    return;
  }

  if (command?.name === "session") {
    logTelegramCommand(chatId, command.name);
    await reply(chatId, getTelegramSessionSummary(chatId), {
      action: "telegram-delivery",
      targetId: chatId,
    });
    return;
  }

  if (command?.name === "new" || command?.name === "reset") {
    logTelegramCommand(chatId, command.name);
    const now = new Date().toISOString();
    upsertTelegramChatState({
      chatId,
      sessionId: makeSessionId(),
      username:
        typeof message?.from?.username === "string" ? message.from.username : undefined,
      title:
        typeof message?.chat?.title === "string"
          ? message.chat.title
          : typeof message?.from?.first_name === "string"
            ? message.from.first_name
            : "Telegram",
      lastMessageAt: now,
    });
    await reply(chatId, "Started a new Wings Of World Telegram session.", {
      action: "telegram-delivery",
      targetId: chatId,
    });
    return;
  }

  if (command?.name === "model") {
    logTelegramCommand(chatId, command.name);
    const summary = `${getTelegramModelSummary()}\n\nTap a button to switch:`;
    await reply(
      chatId,
      summary,
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: buildTelegramModelKeyboard(0) },
    );
    return;
  }

  if (command?.name === "usage") {
    logTelegramCommand(chatId, command.name);
    await reply(chatId, getTelegramUsageSummary(chatId), {
      action: "telegram-delivery",
      targetId: chatId,
    });
    return;
  }

  if (command?.name === "memory") {
    logTelegramCommand(chatId, command.name);
    await reply(chatId, getTelegramMemorySummary(), {
      action: "telegram-delivery",
      targetId: chatId,
    });
    return;
  }

  if (command?.name === "skills") {
    logTelegramCommand(chatId, command.name);
    await reply(
      chatId,
      `${getTelegramSkillsSummary()}\n\n${getTelegramSkillSelectionSummary(chatId)}`,
      {
        action: "telegram-delivery",
        targetId: chatId,
      },
      { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
    );
    return;
  }

  if (command?.name === "prompts") {
    logTelegramCommand(chatId, command.name);
    await reply(
      chatId,
      getTelegramPromptsSummary(),
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
    );
    return;
  }

  if (command?.name === "prompt") {
    logTelegramCommand(chatId, command.name, command.args);
    if (!command.args) {
      await reply(
        chatId,
        `Usage:\n/prompt <id> [topic]\n\n${getTelegramPromptsSummary()}`,
        { action: "telegram-delivery", targetId: chatId },
        { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
      );
      return;
    }
    const [promptId, ...topicParts] = command.args.split(/\s+/);
    try {
      const rendered = renderPromptTemplate(promptId.trim(), topicParts.join(" "));
      await reply(
        chatId,
        `Prompt: ${rendered.title}\nSuggested skills: ${formatSkillSummary(rendered.suggestedSkills)}\n\n${rendered.rendered}`,
        { action: "telegram-delivery", targetId: chatId },
      );
    } catch (error) {
      await reply(
        chatId,
        error instanceof Error ? error.message : String(error),
        { action: "telegram-delivery", targetId: chatId },
        { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
      );
    }
    return;
  }

  if (command?.name === "skill") {
    logTelegramCommand(chatId, command.name, command.args);
    if (!command.args) {
      await reply(
        chatId,
        `${getTelegramSkillSelectionSummary(chatId)}\n\nUsage:\n/skill <id>\n/skill id1,id2\n/skill clear`,
        { action: "telegram-delivery", targetId: chatId },
        { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
      );
      return;
    }
    const current = getTelegramChatSession(chatId);
    const requested =
      command.args.trim().toLowerCase() === "clear"
        ? []
        : normalizeSkillIds(
            command.args
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            { telegramOnly: true },
          );
    if (command.args.trim().toLowerCase() !== "clear" && requested.length === 0) {
      await reply(
        chatId,
        `No valid skill ids found.\n\n${getTelegramSkillsSummary()}`,
        { action: "telegram-delivery", targetId: chatId },
        { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
      );
      return;
    }
    if (current) {
      upsertTelegramChatState({
        ...current,
        activeSkillIds: requested,
        lastMessageAt: new Date().toISOString(),
      });
    } else {
      upsertTelegramChatState({
        chatId,
        sessionId: makeSessionId(),
        username:
          typeof message?.from?.username === "string" ? message.from.username : undefined,
        title:
          typeof message?.chat?.title === "string"
            ? message.chat.title
            : typeof message?.from?.first_name === "string"
              ? message.from.first_name
              : "Telegram",
        lastMessageAt: new Date().toISOString(),
        activeSkillIds: requested,
      });
    }
    await reply(
      chatId,
      `Updated Telegram chat skills.\n${getTelegramSkillSelectionSummary(chatId)}`,
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
    );
    return;
  }

  if (command?.name === "resources") {
    logTelegramCommand(chatId, command.name);
    await reply(
      chatId,
      getTelegramResourcesSummary(),
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
    );
    return;
  }

  if (command?.name === "resource") {
    logTelegramCommand(chatId, command.name, command.args);
    if (!command.args) {
      await reply(
        chatId,
        `Usage:\n/resource <uri>\n\n${getTelegramResourcesSummary()}`,
        { action: "telegram-delivery", targetId: chatId },
        { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
      );
      return;
    }
    try {
      const resource = readResource(command.args.trim());
      await reply(
        chatId,
        `Resource: ${resource.uri}\n\n${truncateTelegramText(resource.text, 3200)}`,
        { action: "telegram-delivery", targetId: chatId },
      );
    } catch (error) {
      await reply(
        chatId,
        error instanceof Error ? error.message : String(error),
        { action: "telegram-delivery", targetId: chatId },
        { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
      );
    }
    return;
  }

  if (command?.name === "tasks") {
    logTelegramCommand(chatId, command.name);
    await reply(
      chatId,
      summarizeHumanTasks(),
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
    );
    return;
  }

  if (command?.name === "todo") {
    logTelegramCommand(chatId, command.name, command.args);
    if (!command.args) {
      await reply(
        chatId,
        "Usage:\n/todo <text>\n\nExample:\n/todo Restart the VPN gateway in the office.",
        { action: "telegram-delivery", targetId: chatId },
        { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
      );
      return;
    }
    const now = new Date().toISOString();
    const owner = typeof message?.from?.username === "string" ? message.from.username : undefined;
    const plan = buildCommandPlan({
      command: command.args,
      owner,
      source: `telegram:${chatId}`,
    });
    const task: HumanTask = {
      id: makeHumanTaskId(),
      title: truncateTelegramText(plan.title, 120),
      details: plan.detailsMarkdown,
      status: "pending",
      priority: plan.priority,
      source: `telegram:${chatId}`,
      owner,
      command: plan,
      createdAt: now,
      updatedAt: now,
    };
    const tasks = loadHumanTasks();
    saveHumanTasks([task, ...tasks].slice(0, 500));
    appendAuditEntry({
      area: "system",
      action: "human-task-create",
      status: "success",
      summary: `Created human task ${task.id}: ${task.title}`,
      targetId: task.id,
    });
    await reply(
      chatId,
      `Created command task.\n${task.id}\n${task.title}\nRoute: ${plan.route}\nRisk: ${plan.riskLevel}`,
      { action: "telegram-delivery", targetId: task.id },
    );
    return;
  }

  if (command?.name === "done") {
    logTelegramCommand(chatId, command.name, command.args);
    if (!command.args) {
      await reply(
        chatId,
        "Usage:\n/done <taskId>",
        { action: "telegram-delivery", targetId: chatId },
        { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
      );
      return;
    }
    const taskId = command.args.trim();
    const tasks = loadHumanTasks();
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask) {
      await reply(
        chatId,
        `Human task not found: ${taskId}`,
        { action: "telegram-delivery", targetId: chatId },
      );
      return;
    }
    const now = new Date().toISOString();
    let nextTask: HumanTask;
    try {
      nextTask = transitionHumanTask(currentTask, "done", now);
    } catch (error) {
      await reply(
        chatId,
        error instanceof Error ? error.message : String(error),
        { action: "telegram-delivery", targetId: taskId },
      );
      return;
    }
    saveHumanTasks(tasks.map((task) => (task.id === taskId ? nextTask : task)));
    appendAuditEntry({
      area: "system",
      action: "human-task-complete",
      status: "success",
      summary: `Completed human task ${taskId}`,
      targetId: taskId,
    });
    await reply(
      chatId,
      `Marked human task done.\n${taskId}`,
      { action: "telegram-delivery", targetId: taskId },
    );
    return;
  }

  if (command?.name === "projects") {
    logTelegramCommand(chatId, command.name);
    await reply(
      chatId,
      listProjectRequestsSummary(),
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
    );
    return;
  }

  if (command?.name === "project") {
    logTelegramCommand(chatId, command.name, command.args);
    if (!command.args) {
      await reply(
        chatId,
        "Usage:\n/project plan name=CRM-System | stack=Next.js + Node | features=auth,dashboard | notes=optional\n/project status <requestId>\n/project approve <requestId>",
        { action: "telegram-delivery", targetId: chatId },
        { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
      );
      return;
    }

    const [actionToken, ...restTokens] = command.args.split(/\s+/);
    const action = actionToken?.trim().toLowerCase();
    const remainder = restTokens.join(" ").trim();

    if (action === "plan") {
      try {
        const spec = parseProjectSpecFromTelegram(remainder);
        const request = createProjectRequest({
          source: `telegram:${chatId}`,
          requestedBy:
            typeof message?.from?.username === "string"
              ? message.from.username
              : typeof message?.from?.first_name === "string"
                ? message.from.first_name
                : undefined,
          chatId,
          spec,
        });
        await reply(
          chatId,
          `${buildProjectRequestSummary(request)}\n\nNothing has been created yet.`,
          { action: "telegram-delivery", targetId: request.id },
          { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
        );
      } catch (error) {
        await reply(
          chatId,
          error instanceof Error ? error.message : String(error),
          { action: "telegram-delivery", targetId: chatId },
          { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
        );
      }
      return;
    }

    if (action === "status") {
      const requestId = remainder;
      if (!requestId) {
        await reply(
          chatId,
          "Usage:\n/project status <requestId>",
          { action: "telegram-delivery", targetId: chatId },
          { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
        );
        return;
      }
      const request = loadProjectRequests().find((entry) => entry.id === requestId);
      await reply(
        chatId,
        request ? buildProjectRequestSummary(request) : `Project request not found: ${requestId}`,
        { action: "telegram-delivery", targetId: requestId || chatId },
        request ? undefined : { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
      );
      return;
    }

    if (action === "approve") {
      const requestId = remainder;
      if (!requestId) {
        await reply(
          chatId,
          "Usage:\n/project approve <requestId>",
          { action: "telegram-delivery", targetId: chatId },
          { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
        );
        return;
      }
      try {
        const approved = approveProjectRequest(requestId);
        await reply(
          chatId,
          `${buildProjectRequestSummary(approved)}\nCreated files: ${approved.createdFiles?.length || 0}`,
          { action: "telegram-delivery", targetId: requestId },
          { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
        );
      } catch (error) {
        await reply(
          chatId,
          error instanceof Error ? error.message : String(error),
          { action: "telegram-delivery", targetId: requestId },
          { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
        );
      }
      return;
    }

    await reply(
      chatId,
      "Unknown project action.\nUse:\n/project plan ...\n/project status <requestId>\n/project approve <requestId>",
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
    );
    return;
  }

  if (command?.name === "remember") {
    logTelegramCommand(chatId, command.name, command.args);
    if (!command.args) {
      await reply(
        chatId,
        "Usage:\n/remember <text>\n\nExample:\n/remember User prefers concise Telegram summaries.",
        { action: "telegram-delivery", targetId: chatId },
        { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
      );
      return;
    }
    const current = getTelegramChatSession(chatId);
    const entry = saveMemoryEntry(
      createMemoryEntry({
        content: command.args,
        memoryType: "context",
        source: buildTelegramMemorySource(chatId, current?.sessionId),
        importanceScore: 0.75,
      }),
    );
    await reply(
      chatId,
      `Saved to memory.\nID: ${entry.id}\nSource: ${entry.source}\nContent: ${truncateTelegramText(entry.content, 220)}`,
      { action: "telegram-delivery", targetId: entry.id },
    );
    return;
  }

  if (command?.name === "find") {
    logTelegramCommand(chatId, command.name, command.args);
    if (!command.args) {
      await reply(
        chatId,
        "Usage:\n/find <query>\n\nExample:\n/find telegram provider fallback",
        { action: "telegram-delivery", targetId: chatId },
        { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
      );
      return;
    }
    await reply(chatId, searchTelegramMemory(command.args), {
      action: "telegram-delivery",
      targetId: chatId,
    });
    return;
  }

  if (command?.name === "health") {
    logTelegramCommand(chatId, command.name);
    await reply(chatId, getTelegramHealthSummary(), {
      action: "telegram-delivery",
      targetId: chatId,
    });
    return;
  }

  if (command) {
    appendAuditEntry({
      area: "system",
      action: "telegram-command",
      status: "error",
      summary: `Unknown Telegram command: /${command.name}`,
      targetId: chatId,
    });
    await reply(
      chatId,
      `Unknown command: /${command.name}\n\nUse /help to see supported commands or /menu to pin shortcuts.`,
      { action: "telegram-delivery", targetId: chatId },
      { replyMarkup: TELEGRAM_REPLY_KEYBOARD },
    );
    return;
  }

  const current = getTelegramChatSession(chatId);
  const sessionId = current?.sessionId || makeSessionId();
  const existingSession = loadChatSessions().find((entry) => entry.id === sessionId);
  const baseMessages = existingSession?.messages || [];
  const nextMessages = [...baseMessages, { role: "user" as const, content: text }];
  const generationStartedAt = Date.now();

  // Show "typing..." status while AI is thinking
  const typingInterval = setInterval(() => {
    callTelegramApi("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  }, 4000);
  callTelegramApi("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

  // Show initial status message to user
  let statusMessageId: number | undefined;
  try {
    const sent = await reply(chatId, "⏳ *Wings Of World is initializing...*", { action: "telegram-delivery" });
    statusMessageId = Number(sent.message_id);
  } catch { /* ignore */ }

  try {
    const result = await executeChatTurn({
      cfg: loadConfig(),
      messages: nextMessages,
      sessionId,
      skillIds: current?.activeSkillIds,
      source: "telegram",
      onProgress: async (status) => {
        if (statusMessageId) {
          await editTelegramMessage(chatId, statusMessageId, status).catch(() => {});
        }
      },
      metadata: {
        telegramChatId: chatId,
        telegramUserId: message?.from?.id,
        skillIds: current?.activeSkillIds || [],
      },
    });

    if (statusMessageId) {
      await callTelegramApi("deleteMessage", { chat_id: chatId, message_id: statusMessageId }).catch(() => {});
    }

    clearInterval(typingInterval);
    appendAuditEntry({
      area: "chat",
      action: "telegram-generate",
      status: "success",
      summary: `Telegram reply generated for chat ${chatId} via ${result.providerMeta.provider}${result.providerMeta.usedFallback ? " fallback" : ""} in ${Date.now() - generationStartedAt}ms`,
      targetId: result.sessionId,
    });
    upsertTelegramChatState({
      chatId,
      sessionId: result.sessionId,
      username:
        typeof message?.from?.username === "string" ? message.from.username : undefined,
      title:
        typeof message?.chat?.title === "string"
          ? message.chat.title
          : typeof message?.from?.first_name === "string"
            ? message.from.first_name
            : "Telegram",
      lastMessageAt: new Date().toISOString(),
      activeSkillIds: current?.activeSkillIds || [],
    });
    await reply(chatId, result.content, {
      action: "telegram-delivery",
      targetId: result.sessionId,
    });
  } catch (error) {
    clearInterval(typingInterval);
    appendAuditEntry({
      area: "chat",
      action: "telegram-generate",
      status: "error",
      summary: `Telegram generation failed in ${Date.now() - generationStartedAt}ms: ${error instanceof Error ? error.message : String(error)}`,
      targetId: sessionId,
    });
    appendFailedChatExecution({
      error,
      messages: nextMessages,
      sessionId,
      source: "telegram",
      metadata: {
        telegramChatId: chatId,
        telegramUserId: message?.from?.id,
      },
    });
    const rawMessage = error instanceof Error ? error.message : String(error);
    const isRateLimit = /\b429\b|rate[- ]?limit/i.test(rawMessage);
    const isAuth = /\b40[13]\b|API key|invalid api/i.test(rawMessage);
    let friendly: string;
    let attachKeyboard = false;
    if (isRateLimit) {
      friendly = [
        "⏳ Provider is rate-limited right now.",
        "Tap a different model below to try a working one — or wait a moment and resend.",
        "",
        rawMessage.slice(0, 400),
      ].join("\n");
      attachKeyboard = true;
    } else if (isAuth) {
      friendly = [
        "🔑 The provider rejected the API key.",
        "Open Wings Of World -> Settings to update it, or pick a different model below.",
        "",
        rawMessage.slice(0, 400),
      ].join("\n");
      attachKeyboard = true;
    } else {
      friendly = `Wings Of World could not reply: ${rawMessage}`;
    }
    await reply(
      chatId,
      friendly,
      { action: "telegram-delivery", targetId: sessionId },
      attachKeyboard ? { replyMarkup: buildTelegramModelKeyboard(0) } : undefined,
    );
  }
}

type ScheduledTaskKind = SharedScheduledTaskKind;
type ScheduledTask = SharedScheduledTask;

function loadScheduledTasks(): ScheduledTask[] {
  ensureDataDir();
  return schLoadScheduledTasks(SCHEDULED_TASKS_FILE);
}

function saveScheduledTasks(tasks: ScheduledTask[]) {
  ensureDataDir();
  schSaveScheduledTasks(SCHEDULED_TASKS_FILE, tasks);
}

const makeScheduledTaskId = schMakeScheduledTaskId;

function buildScheduledTaskDeps() {
  return {
    runChat: async (prompt: string, model?: string) => {
      const cfg = loadConfig();
      const result = await runAgenticLoop(
        cfg,
        [{ role: "user", content: prompt }] as ChatMessage[],
        model,
      );
      return { content: result.content };
    },
    sendWebhook: async (url: string, payload: unknown) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      return { ok: res.ok, status: res.status };
    },
    runMacro: async (macroName: string) => {
      const macros = loadMacros();
      const macro = macros.find((entry: any) => entry?.name === macroName);
      const objective = typeof macro?.task === "string" && macro.task.trim() ? macro.task : macroName;
      return runMacroLoop(objective);
    },
    runAgent: async (prompt: string, model?: string) => {
      const hermesPath = "D:\\hermes-agent-main\\run_agent.py";
      if (fs.existsSync(hermesPath)) {
        const result = await executeToolWithCache(
          "hermes_execute",
          {
            task: prompt,
            ...(model ? { model } : {}),
          },
          { confirmed: true },
        );
        const output =
          result && typeof result === "object" && "output" in result
            ? String((result as { output?: unknown }).output ?? "")
            : JSON.stringify(result);
        return {
          engine: "Hermes",
          content: output || "Hermes completed without text output.",
        };
      }

      const cfg = loadConfig();
      const result = await runAgenticLoop(
        cfg,
        [
          {
            role: "user",
            content: [
              "Run this as an autonomous scheduled agent task.",
              "Create concrete evidence in the response and avoid unsafe side effects unless explicitly requested.",
              "",
              prompt,
            ].join("\n"),
          },
        ] as ChatMessage[],
        model,
      );
      return { engine: "Wings Agent", content: result.content };
    },
    dispatchCommand: async (task: ScheduledTask, command: string) => {
      const plan = buildCommandPlan({
        command,
        owner: task.owner,
        source: `scheduled-task:${task.id}`,
      });
      const now = new Date().toISOString();
      const commandTask: HumanTask = {
        id: makeHumanTaskId(),
        title: plan.title.slice(0, 200),
        details: plan.detailsMarkdown,
        status: "pending",
        priority: plan.priority,
        source: `scheduled-task:${task.id}`,
        owner: plan.owner,
        command: plan,
        createdAt: now,
        updatedAt: now,
      };
      saveHumanTasks([commandTask, ...loadHumanTasks()].slice(0, 500));
      return { taskId: commandTask.id, route: plan.route, riskLevel: plan.riskLevel };
    },
  };
}

async function runScheduledTask(task: ScheduledTask): Promise<{ ok: boolean; summary: string }> {
  return schRunScheduledTask(task, buildScheduledTaskDeps());
}

async function registerBackendCronAgentTask(task: ScheduledTask) {
  const cronArgs = [...buildBackendCronAgentArgs(task), "--json"];
  const cli = backendBridge.resolveBackendCronCli();
  const args = [...cli.baseArgs, ...cronArgs];
  const command = formatBackendCronCommand(
    cli.command,
    [...cli.baseArgs, ...redactBackendCronAgentArgs(cronArgs)],
  );
  const { stdout, stderr } = await execFile(cli.command, args, {
    cwd: cli.cwd,
    env: process.env,
    maxBuffer: 2 * 1024 * 1024,
    timeout: 60_000,
  });
  return {
    ok: true as const,
    command: command.display,
    stdout: stdout.trim(),
    stderr: stderr.trim() || undefined,
  };
}

let stopScheduledTaskRunner: (() => void) | null = null;

function startScheduledTaskRunner() {
  if (stopScheduledTaskRunner) return;
  ensureDataDir();
  stopScheduledTaskRunner = schStartRunner({
    filePath: SCHEDULED_TASKS_FILE,
    ...buildScheduledTaskDeps(),
    onComplete: (task, outcome) => {
      appendAuditEntry({
        area: "scheduled-task",
        action: task.kind,
        status: outcome.ok ? "success" : "error",
        summary: `[${task.name}] ${outcome.summary}`,
        targetId: task.id,
      });
    },
  });
}

type WebhookConfig = SharedWebhookConfig;
type WebhookEvent = SharedWebhookEvent;

function loadWebhooks(): WebhookConfig[] {
  ensureDataDir();
  return whLoadWebhooks(WEBHOOKS_FILE);
}

function saveWebhooks(hooks: WebhookConfig[]) {
  ensureDataDir();
  whSaveWebhooks(WEBHOOKS_FILE, hooks);
}

function loadWebhookEvents(): WebhookEvent[] {
  ensureDataDir();
  return whLoadWebhookEvents(WEBHOOK_EVENTS_FILE);
}

function saveWebhookEvents(events: WebhookEvent[]) {
  ensureDataDir();
  whSaveWebhookEvents(WEBHOOK_EVENTS_FILE, events);
}

const makeWebhookId = whMakeWebhookId;
const makeWebhookEventId = whMakeWebhookEventId;
const makeWebhookSecret = whMakeWebhookSecret;
const verifyWebhookSignature = whVerifySignature;

type VectorMemoryEntry = SharedVectorMemoryEntry;

function loadVectorMemory(): VectorMemoryEntry[] {
  ensureDataDir();
  return vecLoadVectorMemory(VECTOR_MEMORY_FILE);
}

function saveVectorMemory(entries: VectorMemoryEntry[]) {
  ensureDataDir();
  vecSaveVectorMemory(VECTOR_MEMORY_FILE, entries);
}

const makeVectorMemoryId = vecMakeVectorMemoryId;
const cosineSimilarity = vecCosineSimilarity;
const hashEmbedding = vecHashEmbedding;

async function embedText(cfg: AppConfig, text: string): Promise<number[]> {
  return vecEmbedText(
    { provider: cfg.provider, baseURL: cfg.baseURL, apiKey: cfg.apiKey },
    text,
  );
}

function startTelegramPolling() {
  if (!isTelegramEnabled()) return;
  if (!TELEGRAM_POLLING_ENABLED) {
    removeTelegramPollerLock();
    const state = loadTelegramState();
    saveTelegramState({
      ...state,
      lastPollAt: new Date().toISOString(),
      lastError: undefined,
    });
    appendAuditEntry({
      area: "system",
      action: "telegram-poll",
      status: "success",
      summary: "Telegram polling disabled by WINGS_OF_WORLD_TELEGRAM_POLLING=false",
    });
    return;
  }

  const lockStatus = acquireTelegramPollerLock();
  if (!lockStatus.ok) {
    const lockReason = lockStatus.reason || "Telegram poller lock is held by another local instance.";
    const state = loadTelegramState();
    saveTelegramState({
      ...state,
      lastPollAt: new Date().toISOString(),
      lastError: lockReason,
    });
    appendAuditEntry({
      area: "system",
      action: "telegram-poll",
      status: "error",
      summary: lockReason,
    });
    return;
  }

  let isPolling = false;
  const heartbeatInterval = setInterval(() => {
    refreshTelegramPollerLock();
  }, 10_000);

  const cleanup = () => {
    clearInterval(heartbeatInterval);
    releaseTelegramPollerLock();
  };

  process.once("exit", cleanup);
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  const poll = async () => {
    if (isPolling) return;
    isPolling = true;
    try {
      refreshTelegramPollerLock();
      const state = loadTelegramState();
      const updates = await callTelegramApi<any[]>("getUpdates", {
        offset: state.offset,
        timeout: 25,
        allowed_updates: ["message", "callback_query"],
      });
      let nextOffset = state.offset;
      for (const update of updates) {
        if (typeof update?.update_id === "number") {
          nextOffset = Math.max(nextOffset, update.update_id + 1);
        }
        if (update?.message) {
          await handleTelegramMessage(update.message);
        } else if (update?.callback_query) {
          await handleTelegramCallback(update.callback_query);
        }
      }
      saveTelegramState({
        ...loadTelegramState(),
        offset: nextOffset,
        lastPollAt: new Date().toISOString(),
        lastError: undefined,
      });
    } catch (error) {
      const state = loadTelegramState();
      saveTelegramState({
        ...state,
        lastPollAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : String(error),
      });
      appendAuditEntry({
        area: "system",
        action: "telegram-poll",
        status: "error",
        summary: error instanceof Error ? error.message : String(error),
      });
    } finally {
      isPolling = false;
      refreshTelegramPollerLock();
      setTimeout(poll, 1_500);
    }
  };

  appendAuditEntry({
    area: "system",
    action: "telegram-poll",
    status: "success",
    summary: "Telegram polling started",
  });
  configureTelegramCommands().catch((error) => {
    appendAuditEntry({
      area: "system",
      action: "telegram-commands",
      status: "error",
      summary: error instanceof Error ? error.message : String(error),
    });
  });
  poll();
}

function bootstrapSqlite() {
  ensureDataDir();
  initDb(SQLITE_FILE);
  const db = getDb();
  // One-time migration from JSON files (idempotent — INSERT OR IGNORE).
  try {
    if (fs.existsSync(AUDIT_FILE)) {
      const raw = JSON.parse(fs.readFileSync(AUDIT_FILE, "utf-8"));
      if (Array.isArray(raw) && raw.length > 0) {
        const inserted = migrateAuditFromJson(db, raw as SharedAuditEntry[]);
        if (inserted > 0) console.log(`[sqlite] migrated ${inserted} audit entries from JSON`);
      }
    }
  } catch (err) {
    console.warn("[sqlite] audit migration skipped:", (err as Error)?.message || err);
  }
  try {
    if (fs.existsSync(EXECUTION_HISTORY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(EXECUTION_HISTORY_FILE, "utf-8"));
      if (Array.isArray(raw) && raw.length > 0) {
        const inserted = migrateExecutionFromJson(db, raw as SharedExecutionRecord[]);
        if (inserted > 0) console.log(`[sqlite] migrated ${inserted} execution records from JSON`);
      }
    }
  } catch (err) {
    console.warn("[sqlite] execution-history migration skipped:", (err as Error)?.message || err);
  }
}

const SERVER_START_TIME = Date.now();

async function startServer() {
  bootstrapSqlite();
  ensureSpendSchema(getDb());
  ensureTracingSchema(getDb());
  ensureCacheSchema(getDb());
  ensureTokensSchema(getDb());
  ensureDatasetSchema(getDb());
  ensureAdversarialSchema(getDb());
  ensureExperimentSchema(getDb());
  ensureToolCacheSchema(getDb());
  ensureConsolidationSchema(getDb());
  const tracer = new Tracer(getDb());
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(requestLogger);
  app.use(makeTokenAuthMiddleware(getDb()));
  app.use((req, res, next) => {
    res.on("finish", () => {
      const dur = Date.now() - (req.startTime || Date.now());
      recordRequest(req.path, res.statusCode, dur);
    });
    next();
  });
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Origin-Agent-Cluster", "?1");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        `connect-src 'self' http://127.0.0.1:${PORT} ws://127.0.0.1:${PORT}`,
      ].join("; "),
    );
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    );
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
    }
    if (shouldProtectRemotePath(req.path)) {
      res.setHeader("Cache-Control", "no-store");
    }
    if (shouldRestrictToLoopback(req) && !isLoopbackRequest(req)) {
      return res.status(403).json({
        error: "This Wings Of World API route is restricted to local loopback requests.",
      });
    }
    if (shouldProtectRemotePath(req.path)) {
      const auth = getAppAuthSession(req);
      const authenticated = Boolean(auth.enabled && auth.authenticated);
      const remoteDecision = evaluateRemoteAccess({
        pathname: req.path,
        isLoopback: isLoopbackRequest(req),
        authEnabled: auth.enabled,
        authenticated,
        allowAnonymousApi: shouldAllowAnonymousApiRequest(req),
      });
      if (!remoteDecision.allow) {
        return res.status(remoteDecision.status).json({ error: remoteDecision.error });
      }
      if (auth.enabled && !auth.authenticated) {
        if (auth.invalidReason === "binding-mismatch") {
          return res.status(401).json({
            error: "This Wings Of World session is no longer valid for the current client. Sign in again.",
          });
        }
        if (req.path === "/metrics" || (req.path.startsWith("/api/") && !shouldAllowAnonymousApiRequest(req))) {
          return res.status(401).json({
            error:
              req.path === "/metrics"
                ? "Wings Of World app authentication is required for metrics."
                : "Wings Of World app authentication is required for this API route.",
          });
        }
      }
      if (auth.enabled && auth.authenticated && auth.session) {
        touchAuthenticatedSession(auth.state, auth.session.id);
      }
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/", apiLimiter);
  const server = createServer(app);

  // Liveness — process is up. Always cheap, no dependencies.
  app.get(["/healthz", "/health"], (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  // Readiness — process can serve traffic (DB reachable, config loaded).
  app.get("/readyz", (_req, res) => {
    try {
      getDb().prepare("SELECT 1").get();
      const cfg = loadConfig();
      const authState = persistPrunedAuthState();
      const publicAuthReady = !isPublicBindHost(HOST) || isAppAuthEnabled(authState);
      const ok = Boolean(cfg.provider) && publicAuthReady;
      res.status(ok ? 200 : 503).json({
        ok,
        provider: cfg.provider,
        hasApiKey: Boolean(cfg.apiKey),
        publicAccessReady: publicAuthReady,
        appAuthEnabled: isAppAuthEnabled(authState),
        time: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(503).json({ ok: false, error: err?.message || String(err) });
    }
  });

  // Metrics — JSON snapshot for humans, Prometheus text for scrapers.
  app.get("/metrics", (req, res) => {
    if (req.query.format === "prometheus" || (req.header("accept") || "").includes("text/plain")) {
      res.setHeader("Content-Type", "text/plain; version=0.0.4");
      res.send(toPrometheus());
      return;
    }
    res.json(metricsSnapshot());
  });

  app.get("/api/spend", (_req, res) => {
    const cfg = loadConfig();
    const dailyUsd = Number(cfg.spendDailyUsd) || 5;
    const monthlyUsd = cfg.spendMonthlyUsd ? Number(cfg.spendMonthlyUsd) : undefined;
    res.json(getSpendStatus(getDb(), { dailyUsd, monthlyUsd }));
  });

  // ── Tracing ──────────────────────────────────────────────────────────
  app.get("/api/traces", (req: Request, res: Response) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
    res.json({ traces: tracer.listRecentTraces(limit) });
  });

  app.get("/api/traces/:id", (req: Request, res: Response) => {
    const spans = tracer.getTrace(req.params.id);
    if (spans.length === 0) return res.status(404).json({ error: "Trace not found" });
    res.json({ traceId: req.params.id, spans });
  });

  // ── Semantic cache ───────────────────────────────────────────────────
  app.get("/api/cache", (_req, res) => {
    res.json({ stats: getCacheStats(getDb()), entries: listCacheEntries(getDb(), 100).map((e) => ({
      id: e.id, prompt: e.prompt.slice(0, 200), model: e.model, hits: e.hits,
      tokensSaved: e.tokensSaved, costSavedUsd: e.costSavedUsd,
      createdAt: e.createdAt, lastHitAt: e.lastHitAt,
    })) });
  });

  app.post("/api/cache/clear", (_req, res) => {
    const removed = clearCache(getDb());
    res.json({ ok: true, removed });
  });

  app.post("/api/cache/prune", (req: Request, res: Response) => {
    const days = Number(req.body?.days) || 30;
    const removed = pruneCache(getDb(), days);
    res.json({ ok: true, removed, retentionDays: days });
  });

  // ── API tokens ───────────────────────────────────────────────────────
  app.get("/api/tokens", (_req, res) => {
    res.json({ tokens: listApiTokens(getDb()), scopes: ALL_SCOPES });
  });

  app.post("/api/tokens", (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name || "").trim();
      const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes.filter((s: any) => typeof s === "string") : [];
      const expiresInDays = req.body?.expiresInDays ? Number(req.body.expiresInDays) : undefined;
      if (!name) return res.status(400).json({ error: "name is required" });
      if (scopes.length === 0) return res.status(400).json({ error: "at least one scope is required" });
      const result = createApiToken(getDb(), { name, scopes: scopes as Scope[], expiresInDays });
      res.json({ token: result.token, secret: result.secret });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || String(err) });
    }
  });

  app.post("/api/tokens/:id/revoke", (req: Request, res: Response) => {
    const ok = revokeApiToken(getDb(), req.params.id);
    if (!ok) return res.status(404).json({ error: "Token not found or already revoked" });
    res.json({ ok: true });
  });

  app.delete("/api/tokens/:id", (req: Request, res: Response) => {
    const ok = deleteApiToken(getDb(), req.params.id);
    res.json({ ok });
  });

  // ── Eval datasets + replay ───────────────────────────────────────────
  app.get("/api/datasets", (_req, res) => {
    res.json({ datasets: listDatasets(getDb()) });
  });

  app.post("/api/datasets", (req: Request, res: Response) => {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });
    const ds = createDataset(getDb(), { name, description: req.body?.description });
    res.json({ dataset: ds });
  });

  app.delete("/api/datasets/:id", (req: Request, res: Response) => {
    res.json({ ok: deleteEvalDataset(getDb(), req.params.id) });
  });

  app.get("/api/datasets/:id/items", (req: Request, res: Response) => {
    res.json({ items: listDatasetItems(getDb(), req.params.id) });
  });

  app.post("/api/datasets/:id/items", (req: Request, res: Response) => {
    const input = String(req.body?.input || "").trim();
    if (!input) return res.status(400).json({ error: "input is required" });
    const item = addDatasetItem(getDb(), req.params.id, {
      input,
      expectedOutput: req.body?.expectedOutput,
      context: req.body?.context,
      metadata: req.body?.metadata,
    });
    res.json({ item });
  });

  app.delete("/api/datasets/items/:id", (req: Request, res: Response) => {
    res.json({ ok: deleteDatasetItem(getDb(), req.params.id) });
  });

  app.post("/api/datasets/:id/replay", chatLimiter, async (req: Request, res: Response) => {
    try {
      const cfg = loadConfig();
      const model = String(req.body?.model || cfg.model);
      const evalIds = Array.isArray(req.body?.evalIds) ? req.body.evalIds.map(String) : [];
      const concurrency = Number(req.body?.concurrency) || 3;
      const judge = buildGuardrailJudge();
      const generate = async ({ input, context }: { input: string; context?: string }, m: string) => {
        const start = Date.now();
        const messages: ChatMessage[] = context
          ? [
              { role: "system", content: `Use the following context to answer.\n\n${context}` },
              { role: "user", content: input },
            ]
          : [{ role: "user", content: input }];
        const { content } = await callChatCompletions(cfg, messages, m);
        return { output: content, durationMs: Date.now() - start };
      };
      const run = await runReplay(getDb(), { datasetId: req.params.id, model, evalIds, concurrency }, { generate, judge });
      res.json({ run });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.get("/api/datasets/:id/runs", (req: Request, res: Response) => {
    const runs = listReplayRuns(getDb(), req.params.id).map((r) => ({ ...r, passRate: runPassRate(r) }));
    res.json({ runs });
  });

  app.get("/api/replay-runs/:id", (req: Request, res: Response) => {
    const run = getReplayRun(getDb(), req.params.id);
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json({ run: { ...run, passRate: runPassRate(run) }, results: getReplayResults(getDb(), req.params.id) });
  });

  // ── Adversarial / red-team ───────────────────────────────────────────
  app.get("/api/adversarial/probes", (req: Request, res: Response) => {
    const categories = req.query.categories
      ? String(req.query.categories).split(",").filter(Boolean) as AttackCategory[]
      : undefined;
    res.json({ probes: listProbes({ categories }) });
  });

  app.post("/api/adversarial/run", chatLimiter, async (req: Request, res: Response) => {
    try {
      const cfg = loadConfig();
      const model = String(req.body?.model || cfg.model);
      const categories = Array.isArray(req.body?.categories) ? (req.body.categories as AttackCategory[]) : undefined;
      const judge = buildGuardrailJudge();
      const generate = async (prompt: string, m: string, context?: string) => {
        const start = Date.now();
        const messages: ChatMessage[] = context
          ? [
              { role: "system", content: `Use the following context to answer.\n\n${context}` },
              { role: "user", content: prompt },
            ]
          : [{ role: "user", content: prompt }];
        const { content } = await callChatCompletions(cfg, messages, m);
        return { output: content, durationMs: Date.now() - start };
      };
      const report = await runAdversarialSuite({ model, categories }, { generate, judge });
      persistAdversarialReport(getDb(), report);
      res.json({ report });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.get("/api/adversarial/reports", (_req, res) => {
    res.json({ reports: listAdversarialReports(getDb(), 50) });
  });

  // ── A/B experiments ──────────────────────────────────────────────────
  app.get("/api/experiments", (_req, res) => {
    res.json({ experiments: listExperiments(getDb()) });
  });

  app.post("/api/experiments", (req: Request, res: Response) => {
    try {
      const exp = createExperiment(getDb(), {
        name: String(req.body?.name || "").trim() || "Untitled experiment",
        description: req.body?.description,
        arms: Array.isArray(req.body?.arms) ? req.body.arms : [],
      });
      res.json({ experiment: exp });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || String(err) });
    }
  });

  app.patch("/api/experiments/:id/status", (req: Request, res: Response) => {
    const status = String(req.body?.status || "");
    if (!["draft", "running", "paused", "complete"].includes(status)) {
      return res.status(400).json({ error: "invalid status" });
    }
    setExperimentStatus(getDb(), req.params.id, status as any);
    res.json({ ok: true });
  });

  app.delete("/api/experiments/:id", (req: Request, res: Response) => {
    res.json({ ok: deleteExperiment(getDb(), req.params.id) });
  });

  app.get("/api/experiments/:id/stats", (req: Request, res: Response) => {
    const exp = getExperiment(getDb(), req.params.id);
    if (!exp) return res.status(404).json({ error: "Experiment not found" });
    res.json({ experiment: exp, stats: getExperimentStats(getDb(), req.params.id) });
  });

  app.post("/api/experiments/:id/assign", (req: Request, res: Response) => {
    const exp = getExperiment(getDb(), req.params.id);
    if (!exp) return res.status(404).json({ error: "Experiment not found" });
    const key = String(req.body?.key || req.body?.sessionId || req.ip || "anonymous");
    const arm = pickArm(exp, key);
    res.json({ experimentId: exp.id, arm, key });
  });

  // ── Cost attribution ─────────────────────────────────────────────────
  app.get("/api/cost/overview", (req: Request, res: Response) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    res.json(costOverview(getDb(), days));
  });

  app.get("/api/cost/forecast", (req: Request, res: Response) => {
    const lookback = Math.min(30, Math.max(1, Number(req.query.lookback) || 7));
    res.json(costForecast(getDb(), lookback));
  });

  // ── Hermes workspace sync ────────────────────────────────────────────
  function getHermesEnv(cfg: AppConfig): NodeJS.ProcessEnv {
    if (!cfg.hermesHomeOverride) return process.env;
    return { ...process.env, HERMES_HOME: cfg.hermesHomeOverride };
  }

  app.get("/api/hermes/sync/status", (_req, res) => {
    const cfg = loadConfig();
    const paths = describeHermesPaths(getHermesEnv(cfg));
    let factCount: number | null = null;
    if (paths.dbExists) {
      try {
        const db = ensureHermesDb(paths.dbPath);
        try {
          const row = db.prepare(`SELECT COUNT(*) AS n FROM facts`).get() as { n: number };
          factCount = row.n;
        } finally {
          db.close();
        }
      } catch (err) {
        logger.warn({ err }, "hermes status: failed to read facts");
      }
    }
    res.json({
      enabled: Boolean(cfg.hermesSyncEnabled),
      homeDir: paths.homeDir,
      dbPath: paths.dbPath,
      homeExists: paths.homeExists,
      dbExists: paths.dbExists,
      hermesFactCount: factCount,
      wingsMemoryCount: loadMemoryEntries().length,
    });
  });

  app.post("/api/hermes/sync/push", (_req, res) => {
    try {
      const cfg = loadConfig();
      const paths = describeHermesPaths(getHermesEnv(cfg));
      const db = ensureHermesDb(paths.dbPath);
      try {
        const stats = pushToHermes(db, loadMemoryEntries() as HermesWingsMemoryEntry[]);
        appendAuditEntry({
          area: "memory",
          action: "hermes-push",
          status: "success",
          summary: `pushed ${stats.inserted} new + ${stats.updated} updated, ${stats.unchanged} unchanged`,
        });
        res.json({ ok: true, stats, dbPath: paths.dbPath });
      } finally {
        db.close();
      }
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  app.post("/api/hermes/sync/pull", (_req, res) => {
    try {
      const cfg = loadConfig();
      const paths = describeHermesPaths(getHermesEnv(cfg));
      if (!paths.dbExists) {
        return res.status(404).json({ ok: false, error: `Hermes DB not found at ${paths.dbPath}` });
      }
      const db = ensureHermesDb(paths.dbPath);
      let merged: HermesWingsMemoryEntry[];
      let stats;
      try {
        const incoming = pullFromHermes(db);
        const result = mergeIntoWings(loadMemoryEntries() as HermesWingsMemoryEntry[], incoming);
        merged = result.merged;
        stats = result.stats;
      } finally {
        db.close();
      }
      saveMemoryEntries(merged as MemoryEntry[]);
      appendAuditEntry({
        area: "memory",
        action: "hermes-pull",
        status: "success",
        summary: `pulled ${stats.inserted} new + ${stats.updated} updated`,
      });
      res.json({ ok: true, stats, totalAfter: merged.length });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  app.post("/api/hermes/sync/full", async (_req, res) => {
    try {
      const cfg = loadConfig();
      const paths = describeHermesPaths(getHermesEnv(cfg));
      const db = ensureHermesDb(paths.dbPath);
      try {
        const report = await bidirectionalSync({
          hermesDb: db,
          wingsEntries: loadMemoryEntries() as HermesWingsMemoryEntry[],
          persistWings: (merged) => saveMemoryEntries(merged as MemoryEntry[]),
        });
        appendAuditEntry({
          area: "memory",
          action: "hermes-sync",
          status: "success",
          summary: `push:${report.push.inserted}/${report.push.updated} pull:${report.pull.inserted}/${report.pull.updated}`,
        });
        res.json({ ok: true, ...report, dbPath: paths.dbPath });
      } finally {
        db.close();
      }
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  // ── Guardrails / Evals (Future AGI catalog) ──────────────────────────
  function buildGuardrailJudge() {
    return makeGuardrailJudge(async (prompt: string) => {
      const cfg = loadConfig();
      const judgeModel = cfg.guardrailModel || cfg.model;
      const { content } = await callChatCompletions(
        cfg,
        [
          { role: "system", content: "You are an evaluation judge. Be strict, concise, and decisive. End your response with 'Verdict: Passed' or 'Verdict: Failed'." },
          { role: "user", content: prompt },
        ],
        judgeModel,
      );
      return content;
    });
  }

  app.get("/api/evals", (_req, res) => {
    const evals = listGuardrailEvals().map((e) => ({
      id: e.id,
      description: e.description,
      tags: e.tags,
      requiredKeys: e.requiredKeys,
      output: e.output,
      type: e.evalType,
    }));
    res.json({ evals, presets: Object.keys(POLICY_PRESETS) });
  });

  app.get("/api/evals/:id", (req: Request, res: Response) => {
    const def = getGuardrailEval(req.params.id);
    if (!def) return res.status(404).json({ error: "Unknown eval id" });
    res.json(def);
  });

  app.post("/api/evals/run", chatLimiter, async (req: Request, res: Response) => {
    try {
      const id = String(req.body?.id || "").trim();
      const values = (req.body?.values && typeof req.body.values === "object") ? req.body.values : {};
      if (!id) return res.status(400).json({ error: "id is required" });
      const def = getGuardrailEval(id);
      if (!def) return res.status(404).json({ error: `Unknown eval id: ${id}` });
      const verdict = await runGuardrailEval(def, { values }, buildGuardrailJudge());
      res.json({ verdict });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post("/api/evals/run-batch", chatLimiter, async (req: Request, res: Response) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      const values = (req.body?.values && typeof req.body.values === "object") ? req.body.values : {};
      if (ids.length === 0) return res.status(400).json({ error: "ids array is required" });
      const verdicts = await runGuardrailEvals(ids, { values }, buildGuardrailJudge());
      res.json({ verdicts });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post("/api/guardrails/check", chatLimiter, async (req: Request, res: Response) => {
    try {
      const presetName = (req.body?.preset || "basic") as keyof typeof POLICY_PRESETS;
      const policy: GuardrailPolicy = POLICY_PRESETS[presetName] || POLICY_PRESETS.basic;
      const judge = buildGuardrailJudge();
      const userMessage = String(req.body?.userMessage || "");
      const output = String(req.body?.output || "");
      const context = req.body?.context ? String(req.body.context) : undefined;
      const reports: GuardrailReport[] = [];
      if (userMessage) {
        reports.push(await runPreChecks(policy, { userMessage, context }, judge));
      }
      if (output) {
        reports.push(await runPostChecks(policy, { userMessage, output, context }, judge));
      }
      res.json({ preset: presetName, policy, reports });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.get("/api/auth/status", (req: Request, res: Response) => {
    const auth = getAppAuthSession(req);
    res.json({
      enabled: auth.enabled,
      authenticated: auth.authenticated,
      canBootstrap: !auth.enabled,
      sessionExpiresAt: auth.session?.expiresAt || null,
    });
  });

  app.post("/api/auth/bootstrap", (req: Request, res: Response) => {
    const lockout = getAuthLockout(req);
    if (lockout) {
      return res.status(429).json({
        error: `Too many app-auth attempts. Try again in ${lockout.retryAfterSeconds} seconds.`,
      });
    }
    const state = persistPrunedAuthState();
    if (isAppAuthEnabled(state)) {
      return res.status(400).json({ error: "Wings Of World app authentication is already enabled." });
    }
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    try {
      validateAppPasswordRules(password);
      const salt = randomBytes(16).toString("hex");
      const nextState: AppAuthState = {
        passwordSalt: salt,
        passwordHash: hashPassword(password, salt),
        sessions: [],
        updatedAt: new Date().toISOString(),
      };
      const session = createAppAuthSession(nextState, req);
      clearFailedAuthAttempts(req);
      appendAuditEntry({
        area: "settings",
        action: "enable-app-auth",
        status: "success",
        summary: "Enabled local Wings Of World app authentication",
      });
      res.json({
        ok: true,
        token: session.token,
        status: {
          enabled: true,
          authenticated: true,
          canBootstrap: false,
          sessionExpiresAt: session.session.expiresAt,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || String(err) });
    }
  });

  app.post("/api/auth/login", (req: Request, res: Response) => {
    const lockout = getAuthLockout(req);
    if (lockout) {
      appendAuditEntry({
        area: "settings",
        action: "app-auth-login",
        status: "error",
        summary: `Blocked local app login attempt during lockout (${lockout.retryAfterSeconds}s remaining)`,
      });
      return res.status(429).json({
        error: `Too many app-auth attempts. Try again in ${lockout.retryAfterSeconds} seconds.`,
      });
    }
    const state = persistPrunedAuthState();
    if (!isAppAuthEnabled(state)) {
      return res.status(400).json({ error: "Wings Of World app authentication is not enabled yet." });
    }
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const valid =
      secureCompareHex(state.passwordHash, hashPassword(password, state.passwordSalt || ""));
    if (!valid) {
      const attempt = recordFailedAuthAttempt(req);
      appendAuditEntry({
        area: "settings",
        action: "app-auth-login",
        status: "error",
        summary:
          attempt.lockedUntil > Date.now()
            ? "Failed local app login attempt and triggered temporary lockout"
            : "Failed local app login attempt",
      });
      if (attempt.lockedUntil > Date.now()) {
        return res.status(429).json({
          error: `Too many app-auth attempts. Try again in ${Math.max(1, Math.ceil((attempt.lockedUntil - Date.now()) / 1000))} seconds.`,
        });
      }
      return res.status(401).json({ error: "Incorrect password." });
    }
    clearFailedAuthAttempts(req);
    const session = createAppAuthSession(state, req);
    appendAuditEntry({
      area: "settings",
      action: "app-auth-login",
      status: "success",
      summary: "Local app login succeeded",
    });
    res.json({
      ok: true,
      token: session.token,
      status: {
        enabled: true,
        authenticated: true,
        canBootstrap: false,
        sessionExpiresAt: session.session.expiresAt,
      },
    });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const token = extractAppAuthToken(req);
    const state = persistPrunedAuthState();
    if (!isAppAuthEnabled(state) || !token) {
      return res.json({ ok: true });
    }
    const tokenHash = hashSessionToken(token);
    const nextState: AppAuthState = {
      ...state,
      sessions: state.sessions.filter((entry) => !secureCompareHex(entry.tokenHash, tokenHash)),
      updatedAt: new Date().toISOString(),
    };
    saveAppAuthState(nextState);
    appendAuditEntry({
      area: "settings",
      action: "app-auth-logout",
      status: "success",
      summary: "Local app session logged out",
    });
    res.json({ ok: true });
  });

  app.post("/api/auth/change-password", (req: Request, res: Response) => {
    const auth = getAppAuthSession(req);
    if (!auth.enabled || !auth.authenticated) {
      return res.status(401).json({ error: "Authentication is required." });
    }
    const currentPassword =
      typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword =
      typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const currentValid = secureCompareHex(
      auth.state.passwordHash,
      hashPassword(currentPassword, auth.state.passwordSalt || ""),
    );
    if (!currentValid) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    try {
      validateAppPasswordRules(newPassword);
      const salt = randomBytes(16).toString("hex");
      const nextState: AppAuthState = {
        passwordSalt: salt,
        passwordHash: hashPassword(newPassword, salt),
        sessions: [],
        updatedAt: new Date().toISOString(),
      };
      const session = createAppAuthSession(nextState, req);
      appendAuditEntry({
        area: "settings",
        action: "app-auth-change-password",
        status: "success",
        summary: "Changed local Wings Of World app password",
      });
      res.json({
        ok: true,
        token: session.token,
        status: {
          enabled: true,
          authenticated: true,
          canBootstrap: false,
          sessionExpiresAt: session.session.expiresAt,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || String(err) });
    }
  });

  app.get("/api/settings", (_req, res) => {
    res.json(publicConfig(loadConfig()));
  });

  app.put("/api/settings", (req: Request, res: Response) => {
    try {
      const next = normalizeConfigPatch(req.body ?? {}, loadConfig());
      validateConfig(next);
      saveConfig(next);
      appendAuditEntry({
        area: "settings",
        action: "save",
        status: "success",
        summary: `Saved provider=${next.provider} model=${next.model}`,
      });
      res.json(publicConfig(next));
    } catch (err: any) {
      appendAuditEntry({
        area: "settings",
        action: "save",
        status: "error",
        summary: err?.message || String(err),
      });
      res.status(400).json({ error: err?.message || String(err) });
    }
  });

  app.post("/api/settings/test", async (req: Request, res: Response) => {
    try {
      const cfg = normalizeConfigPatch(req.body ?? {}, loadConfig());
      validateConfig(cfg);
      const { content, providerMeta } = await callChatCompletions(cfg, [
        { role: "system", content: "Reply with the single word: ok" },
        { role: "user", content: "ping" },
      ], undefined, { allowOfflineFallback: false });
      appendAuditEntry({
        area: "settings",
        action: "test-connection",
        status: "success",
        summary: `Provider test succeeded for ${providerMeta.provider}${providerMeta.usedFallback ? " fallback" : ""}`,
      });
      res.json({ ok: true, reply: content, providerMeta });
    } catch (err: any) {
      const message = err?.message || String(err);
      // Best-effort recovery of structured fields the friendly formatter
      // emitted into the message — keeps the test endpoint useful for the
      // UI even after the error has been re-thrown as a generic Error.
      const upstreamMatch = message.match(/Upstream (\d+)/);
      const status = upstreamMatch ? Number(upstreamMatch[1]) : 0;
      const isRateLimit = status === 429 || /rate[- ]?limit/i.test(message);
      const isAuth = status === 401 || status === 403;
      const retryMatch = message.match(/Retry after ~?(\d+)s/i);
      const providerMatch = message.match(/Provider:\s*([^\n]+)/);
      const errorClass = isRateLimit ? "rate_limit" : isAuth ? "auth" : status >= 500 ? "server" : status >= 400 ? "client" : "unknown";
      const hintMatch = message.match(/(Provider hit a temporary[^\n]*|Provider rejected[^\n]*|Provider had[^\n]*)/);
      appendAuditEntry({
        area: "settings",
        action: "test-connection",
        status: "error",
        summary: message,
      });
      res.status(400).json({
        ok: false,
        error: message,
        status,
        errorClass,
        retryAfterSeconds: retryMatch ? Number(retryMatch[1]) : undefined,
        upstreamProvider: providerMatch ? providerMatch[1].trim() : undefined,
        hint: hintMatch ? hintMatch[1] : undefined,
      });
    }
  });

  app.get("/api/models/openrouter", async (_req, res) => {
    try {
      const models = await loadOpenRouterCatalog();
      res.json({ models });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err), models: [] });
    }
  });

  app.post("/api/chat", chatLimiter, async (req: Request, res: Response) => {
    const rootSpan = tracer.startSpan({
      name: "POST /api/chat",
      kind: "request",
      attributes: { requestId: req.id },
    });
    try {
      const cfg = loadConfig();
      const dailyUsd = Number(cfg.spendDailyUsd) || 5;
      const monthlyUsd = cfg.spendMonthlyUsd ? Number(cfg.spendMonthlyUsd) : undefined;
      const status = getSpendStatus(getDb(), { dailyUsd, monthlyUsd });
      if (status.blocked) {
        req.log?.warn({ ...status }, "spend cap blocked chat");
        rootSpan.end({ status: "error", attributes: { reason: "spend-cap" } });
        return res.status(402).json({ error: status.reason, spend: status });
      }
      const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

      // Optional semantic cache lookup. Disabled per-request via { cache: false }.
      const cacheEnabled = req.body?.cache !== false;
      const lastUser = [...messages].reverse().find((m: any) => m?.role === "user");
      const cacheKey = typeof lastUser?.content === "string" ? lastUser.content : "";
      if (cacheEnabled && cacheKey) {
        const cacheSpan = rootSpan.child({ name: "cache.lookup", kind: "custom" });
        try {
          const exact = cacheLookupExact(getDb(), cacheKey, cfg.model);
          if (exact) {
            cacheRecordHit(getDb(), exact.id);
            cacheSpan.end({ status: "ok", attributes: { hit: "exact" } });
            rootSpan.end({ status: "ok", attributes: { cache: "hit" } });
            return res.json({
              content: exact.response,
              cache: { hit: true, kind: "exact", entryId: exact.id },
              providerMeta: { model: exact.model, provider: cfg.provider, apiMode: getApiMode(cfg), usedFallback: false, baseURL: cfg.baseURL },
            });
          }
          // Semantic similarity check using existing embedText helper.
          const queryVec = await embedText(cfg, cacheKey);
          const semantic = cacheLookupSemantic(getDb(), queryVec, { model: cfg.model });
          if (semantic.hit && semantic.entry) {
            cacheRecordHit(getDb(), semantic.entry.id);
            cacheSpan.end({ status: "ok", attributes: { hit: "semantic", similarity: semantic.similarity } });
            rootSpan.end({ status: "ok", attributes: { cache: "semantic" } });
            return res.json({
              content: semantic.entry.response,
              cache: { hit: true, kind: "semantic", entryId: semantic.entry.id, similarity: semantic.similarity },
              providerMeta: { model: semantic.entry.model, provider: cfg.provider, apiMode: getApiMode(cfg), usedFallback: false, baseURL: cfg.baseURL },
            });
          }
          cacheSpan.end({ status: "ok", attributes: { hit: "miss" } });
        } catch (err) {
          cacheSpan.end({ status: "error", error: String(err) });
        }
      }
      const skillIds = normalizeSkillIds(req.body?.skillIds);
      const resourceUris = Array.isArray(req.body?.resourceUris)
        ? req.body.resourceUris.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];
      const result = await executeChatTurn({
        cfg,
        messages,
        sessionId: req.body?.sessionId,
        model: req.body?.model,
        skillIds,
        resourceUris,
      });
      recordSpend(getDb(), {
        costUsd: result.runCostEstimateUsd || 0,
        totalTokens: result.tokenUsage?.totalTokens,
        model: result.providerMeta?.model,
        kind: "chat",
      });
      recordLlmCall({
        promptTokens: result.tokenUsage?.promptTokens,
        completionTokens: result.tokenUsage?.completionTokens,
        costUsd: result.runCostEstimateUsd || 0,
      });

      // Best-effort populate semantic cache for next time.
      if (cacheEnabled && cacheKey && result.content) {
        try {
          const vec = await embedText(cfg, cacheKey);
          cacheStoreEntry(getDb(), {
            prompt: cacheKey,
            response: result.content,
            model: result.providerMeta?.model || cfg.model,
            embedding: vec,
          });
        } catch (err) {
          req.log?.debug({ err }, "cache write failed");
        }
      }

      // Optional output guardrail post-check.
      let guardrailReport: GuardrailReport | undefined;
      const presetName = (req.body?.guardrailPreset || cfg.guardrailPreset || "off") as keyof typeof POLICY_PRESETS;
      const policy = POLICY_PRESETS[presetName];
      if (policy && policy.outputEvals.length > 0) {
        const lastUser = [...messages].reverse().find((m: any) => m?.role === "user");
        try {
          guardrailReport = await runPostChecks(
            policy,
            {
              userMessage: typeof lastUser?.content === "string" ? lastUser.content : "",
              output: result.content,
              context: (result.memoryContext || []).map((m: any) => m?.content || "").join("\n"),
            },
            buildGuardrailJudge(),
          );
          req.log?.info({ guardrails: summarizeReport(guardrailReport) }, "guardrails post-check");
          if (guardrailReport.blocked) {
            return res.status(409).json({
              error: "Output blocked by guardrails",
              blockingEvals: guardrailReport.blockingEvals,
              guardrails: guardrailReport,
            });
          }
        } catch (err: any) {
          req.log?.warn({ err }, "guardrails post-check failed");
        }
      }

      rootSpan.end({
        status: "ok",
        attributes: {
          model: result.providerMeta?.model,
          tokens: result.tokenUsage?.totalTokens || 0,
          costUsd: result.runCostEstimateUsd || 0,
        },
      });

      res.json({
        traceId: rootSpan.span.traceId,
        content: result.content,
        memoryContext: result.memoryContext,
        appliedResources: result.appliedResources,
        sessionId: result.sessionId,
        appliedSkills: result.appliedSkills,
        tokenUsage: result.tokenUsage,
        guardrails: guardrailReport,
        cache: { hit: false },
        cascade: result.cascade,
        promptCompression: result.promptCompression,
        sessionTokenUsage: result.sessionTokenUsage,
        runCostEstimateUsd: result.runCostEstimateUsd,
        sessionCostEstimateUsd: result.sessionCostEstimateUsd,
        providerMeta: result.providerMeta,
      });
    } catch (err: any) {
      rootSpan.end({ status: "error", error: err?.message || String(err) });
      const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      appendFailedChatExecution({
        error: err,
        messages,
        sessionId: req.body?.sessionId,
        model: req.body?.model,
      });
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post("/api/feedback", (req: Request, res: Response) => {
    const executionId =
      typeof req.body?.executionId === "string" && req.body.executionId.trim()
        ? req.body.executionId.trim()
        : undefined;
    const sessionId =
      typeof req.body?.sessionId === "string" && req.body.sessionId.trim()
        ? req.body.sessionId.trim()
        : undefined;
    const rating =
      req.body?.rating === "up" || req.body?.rating === "down" || req.body?.rating === "neutral"
        ? req.body.rating
        : "neutral";
    const note =
      typeof req.body?.note === "string" && req.body.note.trim()
        ? req.body.note.trim().slice(0, 1000)
        : "";
    const targetId = executionId || sessionId || makeExecutionId();
    appendAuditEntry({
      area: "chat",
      action: "feedback",
      status: rating === "down" ? "error" : "success",
      summary: `Feedback ${rating}${note ? `: ${note.slice(0, 180)}` : ""}`,
      targetId,
    });
    if (note && rating === "down") {
      saveMemoryEntry(createMemoryEntry({
        content: `Negative feedback for ${targetId}: ${note}`,
        memoryType: "insight",
        source: `feedback:${targetId}`,
        importanceScore: 0.8,
      }));
    }
    res.json({ ok: true, targetId, rating });
  });

  app.post("/api/chat/stream", chatLimiter, async (req: Request, res: Response) => {
    try {
      const cfg = loadConfig();
      const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const messages = rawMessages
        .filter((m: any) => m && typeof m.content === "string" && typeof m.role === "string")
        .map((m: any) => ({ role: m.role, content: m.content }));
      if (messages.length === 0) {
        return res.status(400).json({ error: "messages array is required" });
      }
      const modelOverride = typeof req.body?.model === "string" ? req.body.model : undefined;
      const model = modelOverride || cfg.model;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      (res as any).flushHeaders?.();

      const sendEvent = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      let aborted = false;
      req.on("close", () => { aborted = true; });

      if (cfg.provider === "anthropic") {
        const systemMsg = messages.find((m: any) => m.role === "system")?.content;
        const conv = messages
          .filter((m: any) => m.role !== "system")
          .map((m: any) => ({ role: m.role, content: m.content }));
        const url = `${cfg.baseURL.replace(/\/$/, "")}/messages`;
        const upstream = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": cfg.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: systemMsg,
            messages: conv,
            stream: true,
          }),
        });
        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text().catch(() => "");
          sendEvent("error", { error: `Upstream ${upstream.status}: ${errText.slice(0, 500)}` });
          res.end();
          return;
        }
        const reader = (upstream.body as any).getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";
        while (!aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const payload = dataLine.slice(5).trim();
            if (!payload) continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.type === "content_block_delta" && evt.delta?.text) {
                full += evt.delta.text;
                sendEvent("delta", { text: evt.delta.text });
              } else if (evt.type === "message_stop") {
                sendEvent("done", { content: full });
              }
            } catch { /* ignore parse errors */ }
          }
        }
        res.end();
        return;
      }

      const url = `${cfg.baseURL.replace(/\/$/, "")}/chat/completions`;
      const upstream = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({ model, messages, stream: true, temperature: 0.2 }),
      });
      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text().catch(() => "");
        sendEvent("error", { error: `Upstream ${upstream.status}: ${errText.slice(0, 500)}` });
        res.end();
        return;
      }
      const reader = (upstream.body as any).getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      while (!aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload);
            const delta = evt?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              full += delta;
              sendEvent("delta", { text: delta });
            }
          } catch { /* ignore parse errors */ }
        }
      }
      sendEvent("done", { content: full });
      res.end();
    } catch (err: any) {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ error: err?.message || String(err) })}\n\n`);
      } catch { /* response may be closed */ }
      res.end();
    }
  });

  app.post("/api/mcp", async (req: Request, res: Response) => {
    const response = await mcpHandle(req.body || {}, {
      listTools: () => getAgenticToolDefinitions().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: toolParamsToJsonSchema(t.parameters as Record<string, unknown>),
      })),
      callTool: (name, args) => executeTool(name, args),
      listPrompts: () => getPromptCatalog().map((p) => ({
        name: p.id,
        description: p.description || p.title,
      })),
    });
    res.json(response);
  });

  app.post("/api/chat/agent", chatLimiter, async (req: Request, res: Response) => {
    try {
      const cfg = loadConfig();
      const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const messages: ChatMessage[] = rawMessages
        .filter((m: any) => m && typeof m.content === "string" && typeof m.role === "string")
        .map((m: any) => ({ role: m.role, content: m.content }));
      if (messages.length === 0) {
        return res.status(400).json({ error: "messages array is required" });
      }
      const modelOverride = typeof req.body?.model === "string" ? req.body.model : undefined;
      const result = await runAgenticLoop(cfg, messages, modelOverride);
      res.json({
        content: result.content,
        trace: result.trace,
        tokenUsage: result.usage,
        providerMeta: result.providerMeta,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // ── Smart model cascade ──────────────────────────────────────────────
  function resolveCascadeTiers(cfg: AppConfig): CascadeTierConfig {
    const userTiers = cfg.cascadeTiers || {};
    const hasAny = userTiers.small || userTiers.medium || userTiers.large;
    if (hasAny) return userTiers;
    return defaultTiersFor(cfg.baseURL || "", cfg.provider);
  }

  // ── Optimization summary (unified ROI dashboard) ─────────────────────
  app.get("/api/optimization/summary", (req: Request, res: Response) => {
    try {
      const cfg = loadConfig();
      const windowDays = Math.min(90, Math.max(1, Number(req.query.days) || 7));
      const tiers = (cfg.cascadeTiers && (cfg.cascadeTiers.small || cfg.cascadeTiers.medium || cfg.cascadeTiers.large))
        ? cfg.cascadeTiers
        : defaultTiersFor(cfg.baseURL || "", cfg.provider);
      const largeModel = tiers.large?.model;
      const largeRatePer1k = largeModel
        ? getModelRatePer1KTokens(largeModel, cfg.pricingOverrides)
        : 0;
      const summary = buildOptimizationSummary({
        db: getDb(),
        windowDays,
        cascade: {
          mode: (cfg.cascadeMode || "off") as any,
          tiers,
          largeRatePer1k,
        },
        compression: {
          level: (cfg.compressionLevel || "off") as any,
          minChars: cfg.compressionMinChars ?? 600,
        },
        serverStartTime: SERVER_START_TIME,
      });
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // ── Tool result cache ────────────────────────────────────────────────
  app.get("/api/tool-cache/stats", (_req, res) => {
    res.json({
      ...getToolCacheStats(getDb()),
      policies: DEFAULT_TOOL_CACHE_POLICIES,
    });
  });

  app.get("/api/tool-cache/entries", (req: Request, res: Response) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
    res.json({ entries: listToolCacheEntries(getDb(), limit) });
  });

  app.post("/api/tool-cache/clear", (req: Request, res: Response) => {
    const tool = typeof req.body?.tool === "string" ? req.body.tool.trim() : undefined;
    const removed = clearToolCache(getDb(), tool);
    appendAuditEntry({
      area: "tool",
      action: "tool-cache-clear",
      status: "success",
      summary: `Cleared ${removed} entries${tool ? ` for ${tool}` : ""}`,
    });
    res.json({ ok: true, removed, tool: tool ?? null });
  });

  app.post("/api/tool-cache/prune", (req: Request, res: Response) => {
    const maxEntries = req.body?.maxEntries ? Number(req.body.maxEntries) : undefined;
    const removed = pruneToolCache(getDb(), { maxEntries });
    res.json({ ok: true, removed });
  });

  // ── Memory consolidation (sleep cycle) ───────────────────────────────
  /** Convert Wings MemoryEntry to the consolidatable shape. */
  function toConsolidatable(entry: MemoryEntry): ConsolidatableEntry {
    return {
      id: entry.id,
      content: entry.content,
      importanceScore: entry.importanceScore,
      retrievalCount: 0, // Wings memory model has no retrieval counter; treat as 0
      updatedAt: entry.updatedAt,
      createdAt: entry.createdAt,
    };
  }

  app.post("/api/memory/consolidate", chatLimiter, async (req: Request, res: Response) => {
    try {
      const cfg = loadConfig();
      const dryRun = req.body?.dryRun !== false; // default true — safe by default
      const options: ConsolidationOptions = {
        similarityThreshold: req.body?.similarityThreshold ? Number(req.body.similarityThreshold) : undefined,
        minClusterSize: req.body?.minClusterSize ? Number(req.body.minClusterSize) : undefined,
        dropAfterDays: req.body?.dropAfterDays ? Number(req.body.dropAfterDays) : undefined,
        dropImportanceBelow: req.body?.dropImportanceBelow ? Number(req.body.dropImportanceBelow) : undefined,
        dryRun,
      };
      const entries = loadMemoryEntries().map(toConsolidatable);
      if (entries.length === 0) {
        return res.json({ ok: true, message: "No memories to consolidate.", entries: 0 });
      }

      const outcome = await consolidateMemories(entries, options, {
        embed: (text) => embedText(cfg, text),
        mergeCluster: async (members) => {
          const prompt = buildMergePrompt(members);
          const { content } = await callChatCompletions(cfg, [
            { role: "system", content: "You merge duplicate memories into a single canonical entry. Preserve every concrete fact." },
            { role: "user", content: prompt },
          ]);
          return content.trim();
        },
      });

      const runId = persistConsolidationRun(getDb(), outcome);

      if (!outcome.dryRun) {
        // Persist the new memory list. Convert back to Wings MemoryEntry shape;
        // unknowns default to "fact" (consolidation produces facts).
        const before = loadMemoryEntries();
        const byId = new Map(before.map((e) => [e.id, e]));
        const next: MemoryEntry[] = outcome.resultEntries.map((e) => {
          const original = byId.get(e.id);
          return {
            id: e.id,
            content: e.content,
            memoryType: original?.memoryType ?? "fact",
            source: original?.source ?? "consolidation",
            importanceScore: e.importanceScore ?? 0.5,
            createdAt: e.createdAt ?? original?.createdAt ?? new Date().toISOString(),
            updatedAt: e.updatedAt ?? new Date().toISOString(),
          };
        });
        saveMemoryEntries(next);
      }

      appendAuditEntry({
        area: "memory",
        action: outcome.dryRun ? "consolidate-dry-run" : "consolidate",
        status: "success",
        summary: `${outcome.merged.length} cluster(s) merged, ${outcome.drops.length} dropped, ${outcome.plan.totalEntries}→${outcome.plan.reducedEntries}`,
        targetId: runId,
      });

      res.json({ ok: true, runId, ...outcome });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  app.get("/api/memory/consolidation/history", (req: Request, res: Response) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const runs = listConsolidationRuns(getDb(), limit).map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      dryRun: r.dryRun,
      totalBefore: r.totalBefore,
      totalAfter: r.totalAfter,
      clustersMerged: r.clustersMerged,
      entriesDropped: r.entriesDropped,
      durationMs: r.durationMs,
    }));
    res.json({ runs });
  });

  app.get("/api/memory/consolidation/:id", (req: Request, res: Response) => {
    const run = getConsolidationRun(getDb(), req.params.id);
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json({ run });
  });

  // ── Prompt compression (LLMLingua-style) ─────────────────────────────
  app.get("/api/compress/config", (_req, res) => {
    const cfg = loadConfig();
    res.json({
      level: cfg.compressionLevel || "off",
      minChars: cfg.compressionMinChars ?? 600,
    });
  });

  app.post("/api/compress/preview", (req: Request, res: Response) => {
    try {
      const text = String(req.body?.text || "");
      const level = (req.body?.level || "light") as CompressionLevel;
      const minChars = req.body?.minChars ? Number(req.body.minChars) : undefined;
      if (!text) return res.status(400).json({ error: "text is required" });
      const result = compressText(text, { level, minChars });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post("/api/compress/messages", (req: Request, res: Response) => {
    try {
      const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const level = (req.body?.level || "light") as CompressionLevel;
      const minChars = req.body?.minChars ? Number(req.body.minChars) : undefined;
      if (messages.length === 0) return res.status(400).json({ error: "messages array is required" });
      const result = compressMessages(messages, { level, minChars });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.get("/api/cascade/config", (_req, res) => {
    const cfg = loadConfig();
    res.json({
      mode: cfg.cascadeMode || "off",
      tiers: resolveCascadeTiers(cfg),
      escalationThreshold: cfg.cascadeEscalationThreshold ?? 0.55,
    });
  });

  app.post("/api/chat/cascade", chatLimiter, async (req: Request, res: Response) => {
    const rootSpan = tracer.startSpan({
      name: "POST /api/chat/cascade",
      kind: "request",
      attributes: { requestId: req.id },
    });
    try {
      const cfg = loadConfig();
      const messages: ChatMessage[] = Array.isArray(req.body?.messages)
        ? req.body.messages
            .filter((m: any) => m && typeof m.content === "string" && typeof m.role === "string")
            .map((m: any) => ({ role: m.role, content: m.content }))
        : [];
      if (messages.length === 0) {
        rootSpan.end({ status: "error" });
        return res.status(400).json({ error: "messages array is required" });
      }

      const mode = (req.body?.mode || cfg.cascadeMode || "balanced") as CascadeMode;
      const tiers = (req.body?.tiers as CascadeTierConfig) || resolveCascadeTiers(cfg);
      const threshold = Number(req.body?.escalationThreshold ?? cfg.cascadeEscalationThreshold ?? 0.55);

      const cascade = await runCascade(
        { messages, tiers, mode, escalationThreshold: threshold },
        {
          generate: async (target, opts) => {
            const subSpan = rootSpan.child({
              name: `cascade.${opts.tier}`,
              kind: "llm",
              attributes: { tier: opts.tier, model: target.model, provider: target.provider },
            });
            try {
              const callerCfg: AppConfig = {
                ...cfg,
                provider: target.provider as AppConfig["provider"],
                model: target.model,
                baseURL: target.baseURL || cfg.baseURL,
              };
              const { content, providerMeta, usage } = await callChatCompletions(
                callerCfg,
                messages,
                target.model,
              );
              subSpan.setAttributes({
                tokens: usage?.totalTokens || 0,
                providerActual: providerMeta?.provider,
              });
              recordSpend(getDb(), {
                costUsd: estimateCostUsd(target.model, usage, cfg.pricingOverrides),
                totalTokens: usage?.totalTokens,
                model: target.model,
                kind: `cascade-${opts.tier}`,
              });
              recordLlmCall({
                promptTokens: usage?.promptTokens,
                completionTokens: usage?.completionTokens,
                costUsd: estimateCostUsd(target.model, usage, cfg.pricingOverrides),
              });
              subSpan.end({ status: "ok" });
              return { content, tokensTotal: usage?.totalTokens };
            } catch (err: any) {
              subSpan.end({ status: "error", error: err?.message });
              throw err;
            }
          },
        },
      );

      rootSpan.end({
        status: "ok",
        attributes: {
          mode,
          startingTier: cascade.record.startingTier,
          finalTier: cascade.record.finalTier,
          escalations: cascade.record.escalations,
          complexity: cascade.record.complexity.complexity,
        },
      });

      // If cascade was off / no tiers configured, fall back to plain chat.
      if (!cascade.finalTarget) {
        const result = await callChatCompletions(cfg, messages);
        return res.json({
          traceId: rootSpan.span.traceId,
          content: result.content,
          providerMeta: result.providerMeta,
          tokenUsage: result.usage,
          cascade: { record: cascade.record, fallback: true },
        });
      }

      res.json({
        traceId: rootSpan.span.traceId,
        content: cascade.content,
        cascade: { record: cascade.record, fallback: false },
        finalTarget: cascade.finalTarget,
      });
    } catch (err: any) {
      rootSpan.end({ status: "error", error: err?.message });
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.get("/api/cascade/stats", (req: Request, res: Response) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    // Aggregate spend rows that came from the cascade. Each tier gets its
    // own `kind` (cascade-small / cascade-medium / cascade-large) so we can
    // compare costs per tier directly from spend_log.
    const rows = getDb().prepare(
      `SELECT kind,
              COUNT(*)                        AS calls,
              COALESCE(SUM(cost_usd), 0)      AS total_usd,
              COALESCE(SUM(tokens_total), 0)  AS total_tokens
       FROM spend_log
       WHERE timestamp >= ? AND kind LIKE 'cascade-%'
       GROUP BY kind
       ORDER BY kind ASC`,
    ).all(since) as Array<{ kind: string; calls: number; total_usd: number; total_tokens: number }>;

    const tiers: Record<string, { calls: number; totalUsd: number; totalTokens: number }> = {};
    for (const row of rows) {
      const tier = row.kind.replace(/^cascade-/, "");
      tiers[tier] = {
        calls: row.calls,
        totalUsd: Number(row.total_usd.toFixed(6)),
        totalTokens: row.total_tokens,
      };
    }

    const totalCalls = rows.reduce((sum, r) => sum + r.calls, 0);
    const totalUsd = rows.reduce((sum, r) => sum + r.total_usd, 0);
    const smallShare = totalCalls > 0 ? (tiers.small?.calls ?? 0) / totalCalls : 0;
    const mediumShare = totalCalls > 0 ? (tiers.medium?.calls ?? 0) / totalCalls : 0;
    const largeShare = totalCalls > 0 ? (tiers.large?.calls ?? 0) / totalCalls : 0;

    // Estimate savings vs always-large by comparing per-tier total_usd to
    // what those same tokens would have cost at large-tier rate.
    const cfg = loadConfig();
    const tiersConfig = resolveCascadeTiers(cfg);
    const largeModel = tiersConfig.large?.model;
    const largeRate = largeModel ? getModelRatePer1KTokens(largeModel, cfg.pricingOverrides) : 0;
    let projectedAlwaysLarge = 0;
    for (const row of rows) {
      projectedAlwaysLarge += (row.total_tokens / 1000) * largeRate;
    }
    const estimatedSavingsUsd = Math.max(0, projectedAlwaysLarge - totalUsd);

    res.json({
      days,
      windowStart: since,
      tiers,
      totals: { calls: totalCalls, totalUsd: Number(totalUsd.toFixed(6)) },
      shares: { small: smallShare, medium: mediumShare, large: largeShare },
      projectedAlwaysLargeUsd: Number(projectedAlwaysLarge.toFixed(6)),
      estimatedSavingsUsd: Number(estimatedSavingsUsd.toFixed(6)),
    });
  });

  app.get("/api/scheduled-tasks", (_req, res) => {
    res.json({ tasks: loadScheduledTasks(), presets: SCH_PRESETS, templates: SCH_TEMPLATES });
  });

  app.post("/api/scheduled-tasks/preview", (req: Request, res: Response) => {
    try {
      const validation = schValidateInput(req.body);
      if (!validation.ok) return res.status(400).json({ error: validation.error });
      const task: ScheduledTask = {
        id: "preview",
        createdAt: new Date().toISOString(),
        ...validation.task,
      };
      res.json({ task, nextRuns: schPreviewTask(task, 5) });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || String(err) });
    }
  });

  app.post("/api/scheduled-tasks", (req: Request, res: Response) => {
    try {
      const validation = schValidateInput(req.body);
      if (!validation.ok) return res.status(400).json({ error: validation.error });
      const task: ScheduledTask = {
        id: makeScheduledTaskId(),
        createdAt: new Date().toISOString(),
        ...validation.task,
      };
      const tasks = loadScheduledTasks();
      tasks.push(task);
      saveScheduledTasks(tasks);
      appendAuditEntry({
        area: "scheduled-task",
        action: "create",
        status: "success",
        summary: `Created ${task.kind} schedule ${task.id}: ${task.name}`,
        targetId: task.id,
      });
      res.json({ task });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || String(err) });
    }
  });

  app.patch("/api/scheduled-tasks/:id", (req: Request, res: Response) => {
    const tasks = loadScheduledTasks();
    const task = tasks.find((t) => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    const body = { ...task, ...(req.body || {}) };
    const validation = schValidateInput(body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });
    Object.assign(task, {
      ...validation.task,
      id: task.id,
      createdAt: task.createdAt,
      lastRunAt: task.lastRunAt,
      lastStatus: task.lastStatus,
      lastSummary: task.lastSummary,
      lastDurationMs: task.lastDurationMs,
      runCount: task.runCount,
      failureCount: task.failureCount,
      consecutiveFailures: task.consecutiveFailures,
      recentRuns: task.recentRuns,
    });
    saveScheduledTasks(tasks);
    appendAuditEntry({
      area: "scheduled-task",
      action: "update",
      status: "success",
      summary: `Updated schedule ${task.id}: ${task.name}`,
      targetId: task.id,
    });
    res.json({ task, nextRuns: schPreviewTask(task, 5) });
  });

  app.delete("/api/scheduled-tasks/:id", (req: Request, res: Response) => {
    const before = loadScheduledTasks();
    const tasks = before.filter((t) => t.id !== req.params.id);
    saveScheduledTasks(tasks);
    if (before.length !== tasks.length) {
      appendAuditEntry({
        area: "scheduled-task",
        action: "delete",
        status: "success",
        summary: `Deleted schedule ${req.params.id}`,
        targetId: req.params.id,
      });
    }
    res.json({ ok: true });
  });

  app.post("/api/scheduled-tasks/:id/run", async (req: Request, res: Response) => {
    const tasks = loadScheduledTasks();
    const task = tasks.find((t) => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    try {
      const outcome = await runScheduledTask(task);
      const nextTask = schRecordOutcome(task, outcome);
      Object.assign(task, nextTask);
      saveScheduledTasks(tasks);
      res.json({ task, outcome });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post("/api/scheduled-tasks/:id/register-backend", async (req: Request, res: Response) => {
    const tasks = loadScheduledTasks();
    const task = tasks.find((t) => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    try {
      const result = await registerBackendCronAgentTask(task);
      appendAuditEntry({
        area: "scheduled-task",
        action: "register-backend",
        status: "success",
        summary: `Registered ${task.id} in Wings_Backend cron`,
        targetId: task.id,
      });
      res.json(result);
    } catch (err: any) {
      appendAuditEntry({
        area: "scheduled-task",
        action: "register-backend",
        status: "error",
        summary: err?.message || String(err),
        targetId: task.id,
      });
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.get("/api/webhooks", (_req, res) => {
    const hooks = loadWebhooks().map((h) => ({
      id: h.id,
      name: h.name,
      skillId: h.skillId,
      forwardToPrompt: h.forwardToPrompt,
      createdAt: h.createdAt,
      secretMasked: whMaskSecret(h.secret),
    }));
    res.json({ webhooks: hooks });
  });

  app.post("/api/webhooks", (req: Request, res: Response) => {
    const body = req.body || {};
    const hook: WebhookConfig = {
      id: makeWebhookId(),
      name: String(body.name || "").trim() || "Untitled webhook",
      secret: makeWebhookSecret(),
      skillId: typeof body.skillId === "string" ? body.skillId : undefined,
      forwardToPrompt: typeof body.forwardToPrompt === "string" ? body.forwardToPrompt : undefined,
      createdAt: new Date().toISOString(),
    };
    const hooks = loadWebhooks();
    hooks.push(hook);
    saveWebhooks(hooks);
    res.json({ webhook: { ...hook } });
  });

  app.delete("/api/webhooks/:id", (req: Request, res: Response) => {
    const hooks = loadWebhooks().filter((h) => h.id !== req.params.id);
    saveWebhooks(hooks);
    res.json({ ok: true });
  });

  app.get("/api/webhooks/events", (_req, res) => {
    res.json({ events: loadWebhookEvents().slice(-100).reverse() });
  });

  app.post("/api/webhooks/ingest/:id", webhookIngestLimiter, express.raw({ type: "*/*", limit: "2mb" }), async (req: Request, res: Response) => {
    const hooks = loadWebhooks();
    const hook = hooks.find((h) => h.id === req.params.id);
    if (!hook) return res.status(404).json({ error: "Unknown webhook" });
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const signature = String(
      req.header("x-wings-of-world-signature") ||
      req.header("x-wings-signature") ||
      req.header("x-hub-signature-256") ||
      "",
    );
    const valid = verifyWebhookSignature(hook.secret, rawBody.toString("utf-8"), signature);
    const payload = whParseBody(rawBody);
    const event: WebhookEvent = {
      id: makeWebhookEventId(),
      webhookId: hook.id,
      receivedAt: new Date().toISOString(),
      signatureValid: valid,
      payload,
    };
    if (valid && hook.forwardToPrompt) {
      try {
        const cfg = loadConfig();
        const prompt = `${hook.forwardToPrompt}\n\nPayload:\n${JSON.stringify(payload).slice(0, 4000)}`;
        const result = await runAgenticLoop(cfg, [{ role: "user", content: prompt }] as ChatMessage[]);
        event.processedSummary = result.content.slice(0, 280);
      } catch (err: any) {
        event.processedSummary = `error: ${err?.message || String(err)}`;
      }
    }
    const events = loadWebhookEvents();
    events.push(event);
    saveWebhookEvents(events);
    appendAuditEntry({
      area: "webhook",
      action: "ingest",
      status: valid ? "success" : "error",
      summary: `[${hook.name}] ${valid ? "valid signature" : "invalid signature"}`,
      targetId: hook.id,
    });
    if (!valid) return res.status(401).json({ error: "Invalid signature" });
    res.json({ ok: true, eventId: event.id, processed: Boolean(event.processedSummary) });
  });

  app.get("/api/vector-memory", (_req, res) => {
    const entries = loadVectorMemory().map((e) => ({
      id: e.id,
      text: e.text,
      createdAt: e.createdAt,
      metadata: e.metadata,
    }));
    res.json({ entries });
  });

  app.post("/api/vector-memory", async (req: Request, res: Response) => {
    try {
      const text = String(req.body?.text || "").trim();
      if (!text) return res.status(400).json({ error: "text is required" });
      const cfg = loadConfig();
      const embedding = await embedText(cfg, text);
      const entry: VectorMemoryEntry = {
        id: makeVectorMemoryId(),
        text,
        embedding,
        createdAt: new Date().toISOString(),
        metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : undefined,
      };
      const entries = loadVectorMemory();
      entries.push(entry);
      saveVectorMemory(entries);
      res.json({ entry: { id: entry.id, text: entry.text, createdAt: entry.createdAt } });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post("/api/vector-memory/search", async (req: Request, res: Response) => {
    try {
      const query = String(req.body?.query || "").trim();
      const topK = Math.min(20, Math.max(1, Number(req.body?.topK) || 5));
      if (!query) return res.status(400).json({ error: "query is required" });
      const cfg = loadConfig();
      const queryVec = await embedText(cfg, query);
      const entries = loadVectorMemory();
      const scored = entries
        .map((e) => ({ entry: e, score: cosineSimilarity(queryVec, e.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(({ entry, score }) => ({
          id: entry.id,
          text: entry.text,
          score,
          createdAt: entry.createdAt,
          metadata: entry.metadata,
        }));
      res.json({ results: scored });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.delete("/api/vector-memory/:id", (req: Request, res: Response) => {
    const entries = loadVectorMemory().filter((e) => e.id !== req.params.id);
    saveVectorMemory(entries);
    res.json({ ok: true });
  });

  app.get("/api/skills", (_req, res) => {
    res.json({
      skills: getSkillCatalog().map((skill) => ({
        id: skill.id,
        title: skill.title,
        summary: skill.summary,
        whenToUse: skill.whenToUse,
        telegramEnabled: Boolean(skill.telegramEnabled),
      })),
    });
  });

  app.get("/api/prompts", (_req, res) => {
    res.json({
      prompts: getPromptCatalog().map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        description: prompt.description,
        suggestedSkills: normalizeSkillIds(prompt.suggestedSkills),
        telegramEnabled: Boolean(prompt.telegramEnabled),
      })),
    });
  });

  app.post("/api/prompts/render", (req: Request, res: Response) => {
    try {
      const templateId =
        typeof req.body?.id === "string" ? req.body.id.trim() : "";
      if (!templateId) {
        return res.status(400).json({ error: "id is required" });
      }
      const topic = typeof req.body?.topic === "string" ? req.body.topic : "";
      res.json({ prompt: renderPromptTemplate(templateId, topic) });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || String(err) });
    }
  });

  app.get("/api/resources", (_req, res) => {
    res.json({ resources: getResourceCatalog() });
  });

  app.get("/api/resources/read", (req: Request, res: Response) => {
    try {
      const uri = typeof req.query.uri === "string" ? req.query.uri.trim() : "";
      if (!uri) {
        return res.status(400).json({ error: "uri is required" });
      }
      res.json({ resource: readResource(uri) });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || String(err) });
    }
  });

  if (ENABLE_TEST_ROUTES) {
    app.post("/api/test/telegram/simulate", async (req: Request, res: Response) => {
      if (!isLoopbackRequest(req)) {
        return res.status(403).json({ error: "test route is loopback-only" });
      }
      const outbound: Array<{
        chatId: string;
        text: string;
        context?: { action?: string; targetId?: string };
        replyMarkup?: TelegramReplyMarkup;
      }> = [];
      try {
        await handleTelegramMessage(req.body?.message ?? {}, {
          sendMessage: async (chatId, text, context, options) => {
            outbound.push({
              chatId,
              text,
              context,
              replyMarkup: options?.replyMarkup,
            });
            return { message_id: outbound.length };
          },
        });
        res.json({
          ok: true,
          outbound,
          telegramState: loadTelegramState(),
          humanTasks: loadHumanTasks(),
          projectRequests: loadProjectRequests(),
          memories: loadMemoryEntries().slice(0, 20),
        });
      } catch (err: any) {
        res.status(500).json({
          ok: false,
          error: err?.message || String(err),
          outbound,
        });
      }
    });
  }

  app.get("/api/chat/sessions", (_req, res) => {
    const sessions = loadChatSessions().map((session) => ({
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
      messageCount: session.messages.filter((message) => message.role !== "system").length,
      tokenUsage: session.tokenUsage || EMPTY_TOKEN_USAGE,
      costEstimateUsd: session.costEstimateUsd || 0,
    }));
    res.json({ sessions });
  });

  app.get("/api/executions", (req: Request, res: Response) => {
    const kind =
      req.query.kind === "chat" ||
      req.query.kind === "workflow" ||
      req.query.kind === "tool"
        ? req.query.kind
        : undefined;
    const targetId =
      typeof req.query.targetId === "string" && req.query.targetId.trim()
        ? req.query.targetId.trim()
        : undefined;
    const limitRaw =
      typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
    const entries = loadExecutionHistory()
      .filter((entry) => (kind ? entry.kind === kind : true))
      .filter((entry) => {
        if (!targetId) return true;
        return (
          entry.sessionId === targetId ||
          entry.workflowId === targetId ||
          entry.toolName === targetId
        );
      })
      .slice(0, limit);
    res.json({ entries });
  });

  app.get("/api/executions/:id/artifact", (req: Request, res: Response) => {
    const artifact = loadExecutionArtifacts().find(
      (entry) => entry.executionId === req.params.id,
    );
    if (!artifact) {
      return res.status(404).json({ error: "execution artifact not found" });
    }
    res.json({ artifact });
  });

  app.get("/api/analytics", (req: Request, res: Response) => {
    const rawDays = typeof req.query.days === "string" ? Number(req.query.days) : 30;
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 90) : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);

    const executions = loadExecutionHistory().filter(
      (e) => new Date(e.createdAt) >= cutoff,
    );

    const byDay = new Map<string, { sessions: number; input: number; output: number }>();
    const byModel = new Map<string, { sessions: number; input: number; output: number }>();
    const byKind = new Map<string, number>();
    let totalInput = 0;
    let totalOutput = 0;
    let totalApiCalls = 0;

    for (const exec of executions) {
      const day = exec.createdAt.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, { sessions: 0, input: 0, output: 0 });
      const d = byDay.get(day)!;
      d.sessions++;
      d.input += exec.tokenUsage?.promptTokens || 0;
      d.output += exec.tokenUsage?.completionTokens || 0;

      const model = exec.model || "unknown";
      if (!byModel.has(model)) byModel.set(model, { sessions: 0, input: 0, output: 0 });
      const m = byModel.get(model)!;
      m.sessions++;
      m.input += exec.tokenUsage?.promptTokens || 0;
      m.output += exec.tokenUsage?.completionTokens || 0;

      byKind.set(exec.kind, (byKind.get(exec.kind) || 0) + 1);
      totalInput += exec.tokenUsage?.promptTokens || 0;
      totalOutput += exec.tokenUsage?.completionTokens || 0;
      totalApiCalls++;
    }

    // Fill missing days with zeros for a complete daily series
    const dailyFilled: Array<{ day: string; sessions: number; input_tokens: number; output_tokens: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0, 10);
      const entry = byDay.get(dayStr);
      dailyFilled.push({
        day: dayStr,
        sessions: entry?.sessions || 0,
        input_tokens: entry?.input || 0,
        output_tokens: entry?.output || 0,
      });
    }

    const successCount = executions.filter((e) => e.status === "success").length;
    const errorCount = executions.filter((e) => e.status === "error").length;
    const totalCostUsd = executions.reduce((sum, e) => sum + (e.costEstimateUsd || 0), 0);
    const avgDurationMs = executions.length
      ? executions.reduce((sum, e) => sum + (e.durationMs || 0), 0) / executions.length
      : 0;

    res.json({
      days,
      totals: {
        total_input: totalInput,
        total_output: totalOutput,
        total_sessions: totalApiCalls,
        total_api_calls: totalApiCalls,
        success_count: successCount,
        error_count: errorCount,
        total_cost_usd: totalCostUsd,
        avg_duration_ms: Math.round(avgDurationMs),
      },
      by_kind: Array.from(byKind.entries()).map(([kind, count]) => ({ kind, count })),
      daily: dailyFilled,
      by_model: Array.from(byModel.entries())
        .sort((a, b) => (b[1].input + b[1].output) - (a[1].input + a[1].output))
        .map(([model, m]) => ({
          model,
          sessions: m.sessions,
          input_tokens: m.input,
          output_tokens: m.output,
        })),
    });
  });

  app.get("/api/chat/sessions/:id", (req: Request, res: Response) => {
    const session = loadChatSessions().find((entry) => entry.id === req.params.id);
    if (!session) {
      return res.status(404).json({ error: "session not found" });
    }
    res.json({ session });
  });

  app.patch("/api/chat/sessions/:id", (req: Request, res: Response) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }
    const sessions = loadChatSessions();
    const current = sessions.find((entry) => entry.id === req.params.id);
    if (!current) {
      return res.status(404).json({ error: "session not found" });
    }
    const nextSessions = sessions.map((entry) =>
      entry.id === req.params.id
        ? { ...entry, title: title.slice(0, 80), updatedAt: new Date().toISOString() }
        : entry,
    );
    saveChatSessions(nextSessions);
    appendAuditEntry({
      area: "chat",
      action: "rename-session",
      status: "success",
      summary: `Renamed ${req.params.id} to "${title.slice(0, 40)}"`,
      targetId: req.params.id,
    });
    res.json({ ok: true });
  });

  app.delete("/api/chat/sessions/:id", (req: Request, res: Response) => {
    const sessions = loadChatSessions();
    if (!sessions.some((entry) => entry.id === req.params.id)) {
      return res.status(404).json({ error: "session not found" });
    }
    saveChatSessions(sessions.filter((entry) => entry.id !== req.params.id));
    appendAuditEntry({
      area: "chat",
      action: "delete-session",
      status: "success",
      summary: `Deleted ${req.params.id}`,
      targetId: req.params.id,
    });
    res.json({ ok: true });
  });

  app.post("/api/workflow/execute", async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const cfg = loadConfig();
      const wf: Workflow = req.body?.workflow;
      const input: string = req.body?.input ?? "";
      if (!wf || !Array.isArray(wf.nodes) || !Array.isArray(wf.edges)) {
        return res.status(400).json({ error: "workflow is required" });
      }
      const result = await executeWorkflow(wf, input, cfg);
      const runCostEstimateUsd = estimateCostUsd(
        cfg.model,
        result.tokenUsage,
        cfg.pricingOverrides,
      );
      const execution = appendExecutionRecord({
        kind: "workflow",
        status: "success",
        title:
          typeof req.body?.workflowName === "string" && req.body.workflowName.trim()
            ? req.body.workflowName.trim().slice(0, 120)
            : "Workflow run",
        summary: `Executed workflow with ${wf.nodes.length} node(s)`,
        inputPreview: input.slice(0, 280),
        outputPreview:
          Object.values(result.outputs).at(-1)?.slice(0, 280) || undefined,
        workflowId:
          typeof req.body?.workflowId === "string" && req.body.workflowId.trim()
            ? req.body.workflowId.trim()
            : undefined,
        model: cfg.model,
        memoryCount: result.memoryContext.length,
        tokenUsage: result.tokenUsage,
        costEstimateUsd: runCostEstimateUsd,
        durationMs: Date.now() - startedAt,
      });
      appendExecutionArtifact({
        executionId: execution.id,
        kind: "workflow",
        status: "success",
        createdAt: execution.createdAt,
        input: { input },
        output: { outputs: result.outputs },
        memoryContext: result.memoryContext,
        trace: result.trace,
        workflowSnapshot: wf,
        metadata: {
          workflowId:
            typeof req.body?.workflowId === "string" && req.body.workflowId.trim()
              ? req.body.workflowId.trim()
              : undefined,
          workflowName:
            typeof req.body?.workflowName === "string" && req.body.workflowName.trim()
              ? req.body.workflowName.trim()
              : undefined,
          model: cfg.model,
          apiMode: getApiMode(cfg),
          tokenUsage: result.tokenUsage,
          nodeUsage: result.nodeUsage,
        },
      });
      appendAuditEntry({
        area: "workflow",
        action: "execute",
        status: "success",
        summary: `Executed workflow with ${wf.nodes.length} node(s), ${result.memoryContext.length} memory item(s), ${result.tokenUsage.totalTokens} tokens, ${formatCostUsd(runCostEstimateUsd)}, ${Date.now() - startedAt}ms`,
      });
      res.json({
        ...result,
        costEstimateUsd: runCostEstimateUsd,
      });
    } catch (err: any) {
      const execution = appendExecutionRecord({
        kind: "workflow",
        status: "error",
        title:
          typeof req.body?.workflowName === "string" && req.body.workflowName.trim()
            ? req.body.workflowName.trim().slice(0, 120)
            : "Workflow run failed",
        summary: err?.message || String(err),
        inputPreview:
          typeof req.body?.input === "string" ? req.body.input.slice(0, 280) : "",
        workflowId:
          typeof req.body?.workflowId === "string" && req.body.workflowId.trim()
            ? req.body.workflowId.trim()
            : undefined,
        model: loadConfig().model,
        memoryCount: 0,
        durationMs: Date.now() - startedAt,
      });
      appendExecutionArtifact({
        executionId: execution.id,
        kind: "workflow",
        status: "error",
        createdAt: execution.createdAt,
        input: {
          input: typeof req.body?.input === "string" ? req.body.input : "",
        },
        workflowSnapshot:
          req.body?.workflow && typeof req.body.workflow === "object"
            ? req.body.workflow
            : undefined,
        error: err?.message || String(err),
        metadata: {
          workflowId:
            typeof req.body?.workflowId === "string" && req.body.workflowId.trim()
              ? req.body.workflowId.trim()
              : undefined,
          workflowName:
            typeof req.body?.workflowName === "string" && req.body.workflowName.trim()
              ? req.body.workflowName.trim()
              : undefined,
          model: loadConfig().model,
          apiMode: getApiMode(loadConfig()),
        },
      });
      appendAuditEntry({
        area: "workflow",
        action: "execute",
        status: "error",
        summary: err?.message || String(err),
      });
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.get("/api/workflows", (_req, res) => {
    res.json(loadWorkflows());
  });

  app.put("/api/workflows", (req, res) => {
    ensureDataDir();
    writeJsonSync(WORKFLOWS_FILE, req.body ?? [], { mode: 0o600 });
    appendAuditEntry({
      area: "workflow",
      action: "save-library",
      status: "success",
      summary: `Saved ${Array.isArray(req.body) ? req.body.length : 0} workflow record(s)`,
    });
    res.json({ ok: true });
  });

  app.get("/api/tools", (_req, res) => {
    res.json({ tools: TOOL_DEFINITIONS, workspaceRoots: TOOL_WORKSPACE_ROOTS });
  });

  app.post("/api/tools/execute", async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const name = typeof req.body?.name === "string" ? req.body.name : "";
      const args =
        req.body?.args && typeof req.body.args === "object" ? req.body.args : {};
      const tool = findToolDefinition(name);
      if (!tool) {
        return res.status(404).json({ error: "tool not found" });
      }
      if (toolRequiresConfirmation(tool) && req.body?.confirm !== true) {
        return res.status(400).json({
          error: `Tool "${name}" requires confirm=true before execution.`,
        });
      }

      const bypassCache = req.body?.bypassCache === true;
      const result = await executeToolWithCache(name, args as Record<string, unknown>, {
        bypassCache,
        confirmed: req.body?.confirm === true,
      });
      const execution = appendExecutionRecord({
        kind: "tool",
        status: "success",
        title: `Tool run: ${name}`,
        summary: `Executed tool ${name}`,
        inputPreview: JSON.stringify(args, null, 2).slice(0, 280),
        outputPreview: JSON.stringify(result, null, 2).slice(0, 280),
        toolName: name,
        memoryCount: 0,
        durationMs: Date.now() - startedAt,
      });
      appendExecutionArtifact({
        executionId: execution.id,
        kind: "tool",
        status: "success",
        createdAt: execution.createdAt,
        input: { tool: name },
        output: result,
        toolArgs: args as Record<string, unknown>,
        metadata: {
          toolName: name,
          requiresConfirmation: toolRequiresConfirmation(tool),
        },
      });
      appendAuditEntry({
        area: "tool",
        action: "execute",
        status: "success",
        summary: `Executed tool ${name} in ${Date.now() - startedAt}ms`,
        targetId: name,
      });
      res.json({ ok: true, tool: name, result });
    } catch (err: any) {
      const name = typeof req.body?.name === "string" ? req.body.name : "unknown-tool";
      const args =
        req.body?.args && typeof req.body.args === "object" ? req.body.args : {};
      const execution = appendExecutionRecord({
        kind: "tool",
        status: "error",
        title: `Tool run failed: ${name}`,
        summary: err?.message || String(err),
        inputPreview: JSON.stringify(args, null, 2).slice(0, 280),
        toolName: name,
        memoryCount: 0,
        durationMs: Date.now() - startedAt,
      });
      appendExecutionArtifact({
        executionId: execution.id,
        kind: "tool",
        status: "error",
        createdAt: execution.createdAt,
        input: { tool: name },
        toolArgs: args as Record<string, unknown>,
        error: err?.message || String(err),
        metadata: {
          toolName: name,
        },
      });
      appendAuditEntry({
        area: "tool",
        action: "execute",
        status: "error",
        summary: err?.message || String(err),
        targetId: typeof req.body?.name === "string" ? req.body.name : undefined,
      });
      res.status(400).json({ ok: false, error: err?.message || String(err) });
    }
  });

  app.get("/api/images", (_req, res) => {
    res.json({ images: loadGeneratedImages() });
  });

  app.get("/api/images/file/:filename", (req: Request, res: Response) => {
    const filename = String(req.params.filename || "");
    if (!isSafeGeneratedImageFilename(filename)) {
      return res.status(404).json({ error: "image not found" });
    }
    const filePath = path.join(GENERATED_IMAGES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "image not found" });
    }
    const record = loadGeneratedImages().find((entry) => entry.filename === filename);
    res.setHeader("Content-Type", record?.mimeType || "image/png");
    res.sendFile(filePath);
  });

  app.post("/api/images/generate", async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const args =
        req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      const image = await generateImage(args);
      const execution = appendExecutionRecord({
        kind: "tool",
        status: "success",
        title: "Image generation",
        summary: `Generated image with ${image.model}`,
        inputPreview: image.prompt.slice(0, 280),
        outputPreview: `${image.filename} (${image.size}, ${image.quality})`,
        toolName: "generate_image",
        memoryCount: 0,
        durationMs: Date.now() - startedAt,
      });
      appendExecutionArtifact({
        executionId: execution.id,
        kind: "tool",
        status: "success",
        createdAt: execution.createdAt,
        input: { tool: "generate_image", prompt: image.prompt },
        output: image,
        toolArgs: args,
        metadata: {
          toolName: "generate_image",
          filename: image.filename,
          model: image.model,
          size: image.size,
          quality: image.quality,
        },
      });
      appendAuditEntry({
        area: "tool",
        action: "generate-image",
        status: "success",
        summary: `Generated image ${image.filename} in ${Date.now() - startedAt}ms`,
        targetId: image.id,
      });
      res.json({ ok: true, image });
    } catch (err: any) {
      const args =
        req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      const message = err?.message || String(err);
      const execution = appendExecutionRecord({
        kind: "tool",
        status: "error",
        title: "Image generation failed",
        summary: message,
        inputPreview: JSON.stringify(args, null, 2).slice(0, 280),
        toolName: "generate_image",
        memoryCount: 0,
        durationMs: Date.now() - startedAt,
      });
      appendExecutionArtifact({
        executionId: execution.id,
        kind: "tool",
        status: "error",
        createdAt: execution.createdAt,
        input: { tool: "generate_image" },
        toolArgs: args,
        error: message,
        metadata: { toolName: "generate_image" },
      });
      appendAuditEntry({
        area: "tool",
        action: "generate-image",
        status: "error",
        summary: message,
        targetId: "generate_image",
      });
      res.status(400).json({ ok: false, error: message });
    }
  });

  app.get("/api/agents", (_req, res) => {
    res.json({ agents: AGENT_CATALOG });
  });

  app.post("/api/commands/plan", (req: Request, res: Response) => {
    try {
      const plan = buildCommandPlan({
        command: typeof req.body?.command === "string" ? req.body.command : "",
        owner: typeof req.body?.owner === "string" ? req.body.owner : undefined,
        source: typeof req.body?.source === "string" ? req.body.source : undefined,
      });
      res.json({ plan });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/commands/dispatch", (req: Request, res: Response) => {
    let plan: CommandPlan;
    try {
      plan = buildCommandPlan({
        command: typeof req.body?.command === "string" ? req.body.command : "",
        owner: typeof req.body?.owner === "string" ? req.body.owner : undefined,
        source: typeof req.body?.source === "string" ? req.body.source : undefined,
      });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }

    const now = new Date().toISOString();
    const task: HumanTask = {
      id: makeHumanTaskId(),
      title: plan.title.slice(0, 200),
      details: plan.detailsMarkdown,
      status: "pending",
      priority: plan.priority,
      source:
        typeof req.body?.source === "string" && req.body.source.trim()
          ? req.body.source.trim().slice(0, 120)
          : "command-center",
      owner: plan.owner,
      command: plan,
      createdAt: now,
      updatedAt: now,
    };
    const tasks = loadHumanTasks();
    saveHumanTasks([task, ...tasks].slice(0, 500));
    appendAuditEntry({
      area: "system",
      action: "command-dispatch",
      status: "success",
      summary: `Dispatched command ${task.id}: ${task.title}`,
      targetId: task.id,
    });
    res.json({ ok: true, task, plan });
  });

  app.get("/api/human-tasks", (_req, res) => {
    res.json({ tasks: loadHumanTasks() });
  });

  app.post("/api/human-tasks", (req: Request, res: Response) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }
    const now = new Date().toISOString();
    const requestedStatus = normalizeHumanTaskStatus(req.body?.status, "pending");
    const baseTask: HumanTask = {
      id: makeHumanTaskId(),
      title: title.slice(0, 200),
      details:
        typeof req.body?.details === "string" && req.body.details.trim()
          ? req.body.details.trim()
          : undefined,
      status: "pending",
      priority: normalizeHumanTaskPriority(req.body?.priority, "medium"),
      source:
        typeof req.body?.source === "string" && req.body.source.trim()
          ? req.body.source.trim()
          : "app",
      owner:
        typeof req.body?.owner === "string" && req.body.owner.trim()
          ? req.body.owner.trim()
          : undefined,
      command: normalizeCommandPlanForTask(req.body?.command),
      createdAt: now,
      updatedAt: now,
    };
    let task = baseTask;
    try {
      if (requestedStatus !== "pending") {
        task = transitionHumanTask(baseTask, requestedStatus, now);
      }
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
    const tasks = loadHumanTasks();
    saveHumanTasks([task, ...tasks].slice(0, 500));
    appendAuditEntry({
      area: "system",
      action: "human-task-create",
      status: "success",
      summary: `Created human task ${task.id}: ${task.title}`,
      targetId: task.id,
    });
    res.json({ ok: true, task });
  });

  app.patch("/api/human-tasks/:id", (req: Request, res: Response) => {
    const tasks = loadHumanTasks();
    const current = tasks.find((task) => task.id === req.params.id);
    if (!current) {
      return res.status(404).json({ error: "human task not found" });
    }
    const now = new Date().toISOString();
    let statusPatch: Partial<HumanTask> = {};
    const requestedStatus = normalizeHumanTaskStatus(req.body?.status, current.status);
    try {
      if (requestedStatus !== current.status || req.body?.status) {
        statusPatch = transitionHumanTask(current, requestedStatus, now);
      }
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
    const nextTask: HumanTask = {
      ...current,
      ...statusPatch,
      title:
        typeof req.body?.title === "string" && req.body.title.trim()
          ? req.body.title.trim().slice(0, 200)
          : current.title,
      details:
        typeof req.body?.details === "string"
          ? req.body.details.trim() || undefined
          : current.details,
      priority: normalizeHumanTaskPriority(req.body?.priority, current.priority),
      source:
        typeof req.body?.source === "string" && req.body.source.trim()
          ? req.body.source.trim()
          : current.source,
      owner:
        typeof req.body?.owner === "string"
          ? req.body.owner.trim() || undefined
          : current.owner,
      command:
        req.body?.command === null
          ? undefined
          : normalizeCommandPlanForTask(req.body?.command) || current.command,
      updatedAt: now,
    };
    saveHumanTasks(tasks.map((task) => (task.id === req.params.id ? nextTask : task)));
    appendAuditEntry({
      area: "system",
      action: "human-task-update",
      status: "success",
      summary: `Updated human task ${req.params.id} -> ${nextTask.status}`,
      targetId: req.params.id,
    });
    res.json({ ok: true, task: nextTask });
  });

  app.delete("/api/human-tasks/:id", (req: Request, res: Response) => {
    const tasks = loadHumanTasks();
    if (!tasks.some((task) => task.id === req.params.id)) {
      return res.status(404).json({ error: "human task not found" });
    }
    saveHumanTasks(tasks.filter((task) => task.id !== req.params.id));
    appendAuditEntry({
      area: "system",
      action: "human-task-delete",
      status: "success",
      summary: `Deleted human task ${req.params.id}`,
      targetId: req.params.id,
    });
    res.json({ ok: true });
  });

  app.get("/api/backend/status", async (_req: Request, res: Response) => {
    res.json(await backendBridge.getBackendBridgeStatus());
  });

  app.post("/api/backend/start", async (_req: Request, res: Response) => {
    const result = await backendBridge.startBackendGateway();
    if (!result.ok) {
      return res.status(409).json(result);
    }
    res.json(result);
  });

  app.get("/api/system/health", (_req, res) => {
    const cfg = loadConfig();
    const telegramState = loadTelegramState();
    const providerHealth = getProviderHealthSnapshot(cfg);
    const telegramLock = TELEGRAM_POLLING_ENABLED ? getActiveTelegramPollerLock() : null;
    const authState = persistPrunedAuthState();
    res.json({
      ok: true,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      platform: process.platform,
      providerConfigured: isProviderUsable(cfg),
      appAuth: {
        enabled: isAppAuthEnabled(authState),
        activeSessions: authState.sessions.length,
      },
      provider: providerHealth,
      telegram: {
        enabled: isTelegramEnabled(),
        pollingEnabled: TELEGRAM_POLLING_ENABLED,
        linkedChats: telegramState.chats.length,
        lastPollAt: telegramState.lastPollAt || null,
        lastError: telegramState.lastError || null,
        recommendedAction: getTelegramErrorAction(telegramState.lastError),
        localPollerLock: telegramLock
          ? {
              pid: telegramLock.pid,
              instanceId: telegramLock.instanceId,
              heartbeatAt: telegramLock.heartbeatAt,
              ownedByCurrentProcess:
                telegramLock.pid === process.pid &&
                telegramLock.instanceId === TELEGRAM_POLLER_INSTANCE_ID,
            }
          : null,
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/system/resources", (_req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const humanTasks = loadHumanTasks();
    res.json({
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || "unknown",
      },
      memory: {
        totalGb: Number((totalMem / 1024 / 1024 / 1024).toFixed(2)),
        usedGb: Number((usedMem / 1024 / 1024 / 1024).toFixed(2)),
        freeGb: Number((freeMem / 1024 / 1024 / 1024).toFixed(2)),
        percent: Number(((usedMem / totalMem) * 100).toFixed(1)),
      },
      platform: {
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
      },
      dataDir: DATA_DIR,
      obsidian: {
        enabled: obsidianMemoryEnabled(),
        vaultPath: OBSIDIAN_VAULT_PATH,
        memoryDir: OBSIDIAN_MEMORY_DIR,
      },
      humanTasks: {
        total: humanTasks.length,
        open: humanTasks.filter(
          (task) => task.status === "pending" || task.status === "in_progress" || task.status === "blocked",
        ).length,
      },
      workspaceRoots: TOOL_WORKSPACE_ROOTS,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/system/readiness", async (_req, res) => {
    res.json(buildSystemReadiness({ backendStatus: await backendBridge.getBackendBridgeStatus() }));
  });

  app.get("/api/system/export", (_req, res) => {
    appendAuditEntry({
      area: "system",
      action: "export-data",
      status: "success",
      summary: "Exported Wings Of World data bundle",
    });
    res.json(buildSystemExportBundle());
  });

  app.post("/api/system/import", (req: Request, res: Response) => {
    try {
      const mode = req.body?.mode === "merge" ? "merge" : "replace";
      const bundle = req.body?.bundle;
      if (!bundle || typeof bundle !== "object") {
        return res.status(400).json({ error: "bundle is required" });
      }

      const payload = (bundle as any).data && typeof (bundle as any).data === "object"
        ? (bundle as any).data
        : bundle;

      const importedWorkflows = Array.isArray(payload.workflows)
        ? payload.workflows
        : [];
      const importedMemory = normalizeImportedMemoryEntries(payload.memory);
      const importedChatSessions = normalizeImportedChatSessions(payload.chatSessions);
      const importedAudit = normalizeImportedAuditEntries(payload.audit);
      const importedHumanTasks = normalizeImportedHumanTasks(payload.humanTasks);

      const nextWorkflows =
        mode === "merge"
          ? [
              ...importedWorkflows,
              ...loadWorkflows().filter((entry: any) => {
                const id = typeof entry?.id === "string" ? entry.id : "";
                return !importedWorkflows.some((candidate: any) => candidate?.id === id);
              }),
            ]
          : importedWorkflows;
      const nextMemory =
        mode === "merge"
          ? [
              ...importedMemory,
              ...loadMemoryEntries().filter(
                (entry) => !importedMemory.some((candidate) => candidate.id === entry.id),
              ),
            ]
          : importedMemory;
      const nextChatSessions =
        mode === "merge"
          ? [
              ...importedChatSessions,
              ...loadChatSessions().filter(
                (entry) => !importedChatSessions.some((candidate) => candidate.id === entry.id),
              ),
            ]
          : importedChatSessions;
      const nextAudit =
        mode === "merge"
          ? [
              ...importedAudit,
              ...loadAuditEntries().filter(
                (entry) => !importedAudit.some((candidate) => candidate.id === entry.id),
              ),
            ].slice(0, 300)
          : importedAudit.slice(0, 300);
      const importedExecutionHistory = normalizeImportedExecutionHistory(
        payload.executionHistory,
      );
      const importedExecutionArtifacts = normalizeImportedExecutionArtifacts(
        payload.executionArtifacts,
      );
      const importedTelegramState = normalizeImportedTelegramState(
        payload.telegramState,
      );
      const nextExecutionHistory =
        mode === "merge"
          ? [
              ...importedExecutionHistory,
              ...loadExecutionHistory().filter(
                (entry) =>
                  !importedExecutionHistory.some((candidate) => candidate.id === entry.id),
              ),
            ].slice(0, 300)
          : importedExecutionHistory.slice(0, 300);
      const nextExecutionArtifacts =
        mode === "merge"
          ? [
              ...importedExecutionArtifacts,
              ...loadExecutionArtifacts().filter(
                (entry) =>
                  !importedExecutionArtifacts.some(
                    (candidate) => candidate.executionId === entry.executionId,
                  ),
              ),
            ].slice(0, 300)
          : importedExecutionArtifacts.slice(0, 300);
      const nextTelegramState =
        mode === "merge"
          ? {
              offset: Math.max(loadTelegramState().offset, importedTelegramState.offset),
              chats: [
                ...importedTelegramState.chats,
                ...loadTelegramState().chats.filter(
                  (entry) =>
                    !importedTelegramState.chats.some(
                      (candidate) => candidate.chatId === entry.chatId,
                    ),
                ),
              ].slice(0, 100),
              lastPollAt: importedTelegramState.lastPollAt || loadTelegramState().lastPollAt,
              lastError: importedTelegramState.lastError || loadTelegramState().lastError,
            }
          : importedTelegramState;
      const nextHumanTasks =
        mode === "merge"
          ? [
              ...importedHumanTasks,
              ...loadHumanTasks().filter(
                (entry) => !importedHumanTasks.some((candidate) => candidate.id === entry.id),
              ),
            ].slice(0, 500)
          : importedHumanTasks.slice(0, 500);

      ensureDataDir();
      writeJsonSync(WORKFLOWS_FILE, nextWorkflows, { mode: 0o600 });
      saveMemoryEntries(nextMemory);
      saveChatSessions(nextChatSessions);
      saveAuditEntries(nextAudit);
      saveExecutionHistory(nextExecutionHistory);
      saveExecutionArtifacts(nextExecutionArtifacts);
      saveTelegramState(nextTelegramState);
      saveHumanTasks(nextHumanTasks);
      appendAuditEntry({
        area: "system",
        action: "import-data",
        status: "success",
        summary: `Imported data bundle in ${mode} mode`,
      });
      res.json({
        ok: true,
        mode,
        imported: {
          workflows: Array.isArray(importedWorkflows) ? importedWorkflows.length : 0,
          memory: importedMemory.length,
          chatSessions: importedChatSessions.length,
          audit: importedAudit.length,
          executionHistory: importedExecutionHistory.length,
          executionArtifacts: importedExecutionArtifacts.length,
          telegramChats: importedTelegramState.chats.length,
          humanTasks: importedHumanTasks.length,
        },
      });
    } catch (err: any) {
      appendAuditEntry({
        area: "system",
        action: "import-data",
        status: "error",
        summary: err?.message || String(err),
      });
      res.status(400).json({ error: err?.message || String(err) });
    }
  });

  app.get("/api/memory", (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const entries = loadMemoryEntries()
      .filter((entry) =>
        !query
          ? true
          : entry.content.toLowerCase().includes(query) ||
            entry.memoryType.toLowerCase().includes(query) ||
            entry.source.toLowerCase().includes(query),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json({ memories: entries });
  });

  app.get("/api/memory/context", (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    res.json({ memories: buildMemoryContext(query, 5) });
  });

  app.get("/api/memory/stats", (_req, res) => {
    const entries = loadMemoryEntries();
    const workflows = loadWorkflows();
    const byType = Object.fromEntries(
      ["fact", "preference", "context", "summary", "insight"].map((type) => [
        type,
        entries.filter((entry) => entry.memoryType === type).length,
        ]),
    );
    const avgImportance =
      entries.length > 0
        ? entries.reduce((sum, entry) => sum + entry.importanceScore, 0) / entries.length
        : 0;
    res.json({
      totalMemories: entries.length,
      workflowSnapshots: Array.isArray(workflows) ? workflows.length : 0,
      avgImportance: Number(avgImportance.toFixed(2)),
      byType,
    });
  });

  app.get("/api/audit", (req: Request, res: Response) => {
    const limitRaw =
      typeof req.query.limit === "string" ? Number(req.query.limit) : 30;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 30;
    res.json({ entries: loadAuditEntries().slice(0, limit) });
  });

  app.post("/api/memory", (req: Request, res: Response) => {
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const memoryType =
      req.body?.memoryType === "fact" ||
      req.body?.memoryType === "preference" ||
      req.body?.memoryType === "context" ||
      req.body?.memoryType === "summary" ||
      req.body?.memoryType === "insight"
        ? req.body.memoryType
        : "fact";
    const source =
      typeof req.body?.source === "string" && req.body.source.trim()
        ? req.body.source.trim()
        : "manual";
    const importanceScoreRaw =
      typeof req.body?.importanceScore === "number" ? req.body.importanceScore : 0.5;
    const importanceScore = Math.max(0, Math.min(1, importanceScoreRaw));

    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    const entries = loadMemoryEntries();
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: makeMemoryId(),
      content,
      memoryType,
      source,
      importanceScore,
      createdAt: now,
      updatedAt: now,
    };
    entries.unshift(entry);
    saveMemoryEntries(entries);
    appendAuditEntry({
      area: "memory",
      action: "create",
      status: "success",
      summary: `Saved ${memoryType} memory from ${source}`,
      targetId: entry.id,
    });
    res.json({ ok: true, memory: entry });
  });

  app.patch("/api/memory/:id", (req: Request, res: Response) => {
    const entries = loadMemoryEntries();
    const current = entries.find((entry) => entry.id === req.params.id);
    if (!current) {
      return res.status(404).json({ error: "memory not found" });
    }

    const content =
      typeof req.body?.content === "string" ? req.body.content.trim() : current.content;
    const memoryType =
      req.body?.memoryType === "fact" ||
      req.body?.memoryType === "preference" ||
      req.body?.memoryType === "context" ||
      req.body?.memoryType === "summary" ||
      req.body?.memoryType === "insight"
        ? req.body.memoryType
        : current.memoryType;
    const source =
      typeof req.body?.source === "string" && req.body.source.trim()
        ? req.body.source.trim()
        : current.source;
    const importanceScoreRaw =
      typeof req.body?.importanceScore === "number"
        ? req.body.importanceScore
        : current.importanceScore;
    const importanceScore = Math.max(0, Math.min(1, importanceScoreRaw));

    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    const nextEntry: MemoryEntry = {
      ...current,
      content,
      memoryType,
      source,
      importanceScore,
      updatedAt: new Date().toISOString(),
    };
    saveMemoryEntries(
      entries.map((entry) => (entry.id === req.params.id ? nextEntry : entry)),
    );
    appendAuditEntry({
      area: "memory",
      action: "update",
      status: "success",
      summary: `Updated ${memoryType} memory from ${source}`,
      targetId: nextEntry.id,
    });
    res.json({ ok: true, memory: nextEntry });
  });

  app.delete("/api/memory/:id", (req: Request, res: Response) => {
    const entries = loadMemoryEntries();
    const current = entries.find((entry) => entry.id === req.params.id);
    if (!current) {
      return res.status(404).json({ error: "memory not found" });
    }

    saveMemoryEntries(entries.filter((entry) => entry.id !== req.params.id));
    appendAuditEntry({
      area: "memory",
      action: "delete",
      status: "success",
      summary: `Deleted ${current.memoryType} memory from ${current.source}`,
      targetId: current.id,
    });
    res.json({ ok: true });
  });

  if (IS_PROD) {
    const staticPath = path.resolve(__dirname, "public");
    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

  startTelegramPolling();
  startScheduledTaskRunner();

  // Periodic tool-cache prune. Runs once at boot (clears stale entries from
  // a previous process) and every 30 minutes after that. unref() so the
  // timer never holds the event loop open during graceful shutdown.
  try {
    pruneToolCache(getDb());
  } catch (err) {
    logger.warn({ err: (err as Error)?.message }, "tool-cache initial prune failed");
  }
  const toolCachePruneTimer = setInterval(() => {
    try {
      const removed = pruneToolCache(getDb());
      if (removed > 0) logger.info({ removed }, "tool-cache prune");
    } catch (err) {
      logger.warn({ err: (err as Error)?.message }, "tool-cache periodic prune failed");
    }
  }, 30 * 60 * 1000);
  toolCachePruneTimer.unref?.();

  // Global error handler — must be registered LAST.
  app.use(errorLogger);

  server.listen(PORT, HOST, () => {
    logger.info({ host: HOST, port: PORT, dataDir: DATA_DIR }, "Wings Of World server listening");
  });

  // Graceful shutdown — close server, stop pollers, flush writes, close DB.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "graceful shutdown initiated");
    const forceExit = setTimeout(() => {
      logger.error("graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 10_000);
    forceExit.unref();
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      logger.error({ err }, "error closing server");
    }
    try { stopScheduledTaskRunner?.(); } catch { /* ignore */ }
    try {
      pruneSpendLog(getDb(), 90);
      closeDb();
    } catch (err) {
      logger.warn({ err }, "error closing db");
    }
    logger.info("graceful shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaught exception");
    shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandled rejection");
  });
}

startServer().catch((err) => {
  logger.fatal({ err }, "startup failed");
  process.exit(1);
});
