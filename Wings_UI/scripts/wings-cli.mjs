#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import {
  cmdChat,
  cmdAgent,
  cmdRepl,
  cmdMemory,
  cmdTools,
  cmdTasks,
  cmdWebhooks,
  cmdAudit,
  cmdHistory,
  cmdStatus,
  cmdEval,
  cmdGuardrails,
  cmdTrace,
  cmdCache,
  cmdToken,
  cmdDataset,
  cmdRedTeam,
  cmdExperiment,
  cmdCost,
  cmdHermes,
  cmdCascade,
  cmdCompress,
  cmdToolCache,
  cmdOptimization,
} from "./cli/commands.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const dataDir =
  process.env.WINGS_OF_WORLD_DATA_DIR ||
  process.env.WINGS_DATA_DIR ||
  path.join(projectRoot, "data");
const envLocalPath = path.join(projectRoot, ".env.local");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"),
);

const colors = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadLocalEnv() {
  if (!fs.existsSync(envLocalPath)) {
    return {};
  }

  const env = {};
  for (const rawLine of fs.readFileSync(envLocalPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function hasFlag(flag) {
  return process.argv.slice(3).includes(flag);
}

function openBrowser(url) {
  const child =
    process.platform === "win32"
      ? spawn("cmd", ["/c", "start", "", url], {
          cwd: projectRoot,
          detached: true,
          stdio: "ignore",
        })
      : process.platform === "darwin"
        ? spawn("open", [url], {
            cwd: projectRoot,
            detached: true,
            stdio: "ignore",
          })
        : spawn("xdg-open", [url], {
            cwd: projectRoot,
            detached: true,
            stdio: "ignore",
          });

  child.unref();
}

function scheduleBrowserOpen(url, delayMs) {
  if (hasFlag("--no-open")) {
    return;
  }
  setTimeout(() => {
    try {
      openBrowser(url);
      console.log(colorize("dim", `opening ${url}`));
    } catch {
      console.log(colorize("yellow", `open browser manually: ${url}`));
    }
  }, delayMs);
}

function printBanner() {
  console.log(colorize("cyan", "Wings Of World CLI"));
  console.log(colorize("dim", `project  ${projectRoot}`));
  console.log(colorize("dim", `data     ${dataDir}`));
  console.log(colorize("dim", `version  ${packageJson.version}`));
  console.log("");
}

function run(command, args, extraEnv = {}) {
  const resolved =
    process.platform === "win32" && command === "pnpm"
      ? { command: "corepack", args: ["pnpm", ...args] }
      : { command, args };

  return new Promise((resolve, reject) => {
    const child = spawn(resolved.command, resolved.args, {
      cwd: projectRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        WINGS_OF_WORLD_DATA_DIR: dataDir,
        WINGS_DATA_DIR: dataDir,
        ...loadLocalEnv(),
        ...extraEnv,
      },
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${resolved.command} exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function printHelp() {
  printBanner();
  console.log("Usage:");
  console.log("  wings-of-world <command> [args] [--flags]");
  console.log("");
  console.log("Process commands:");
  console.log("  dev               Start the Wings Of World development stack");
  console.log("  prod              Build and start the production server");
  console.log("  build             Build client and server bundles");
  console.log("  check             Run TypeScript checks");
  console.log("  test              Run vitest");
  console.log("  doctor            Show local readiness details");
  console.log("  verify-responses  Run the OpenAI Responses integration harness");
  console.log("");
  console.log("API commands (requires running server):");
  console.log("  chat <msg>        Single-turn chat. Flags: --stream --model --session --skills --verbose");
  console.log("  agent <prompt>    Run agentic loop with tool use. Flags: --trace --model --verbose");
  console.log("  repl              Interactive chat REPL. Flags: --agent --model");
  console.log("  status            Ping server & show readiness");
  console.log("  audit             Show recent audit log entries");
  console.log("  history           Show recent execution history");
  console.log("");
  console.log("  memory list");
  console.log("  memory add <text>");
  console.log("  memory search <query> [--top 5]");
  console.log("  memory delete <id>");
  console.log("  memory consolidate [--threshold 0.85] [--min-cluster 3] [--execute] [--verbose]");
  console.log("  memory history                  Recent consolidation runs");
  console.log("");
  console.log("  tools list");
  console.log("  tools exec <name> [--args '<json>']");
  console.log("");
  console.log("  tasks list");
  console.log("  tasks add <prompt> [--name=…] [--every=60000] [--kind=chat|webhook] [--url=…]");
  console.log("  tasks run <id>");
  console.log("  tasks enable|disable <id>");
  console.log("  tasks delete <id>");
  console.log("");
  console.log("  webhooks list");
  console.log("  webhooks add [--name=…] [--forward='prompt to forward to agent']");
  console.log("  webhooks events");
  console.log("  webhooks delete <id>");
  console.log("");
  console.log("  eval list [--tag hallucination|safety|rag|…]");
  console.log("  eval show <id>");
  console.log("  eval run <id> --output \"…\" [--input \"…\"] [--context \"…\"] [--verbose]");
  console.log("  guardrails check --input \"…\" --output \"…\" [--preset basic|rag|strict]");
  console.log("  guardrails presets");
  console.log("");
  console.log("  trace list [--limit 30]");
  console.log("  trace show <traceId> [--verbose]");
  console.log("");
  console.log("  cache stats | cache list | cache clear | cache prune --days 30");
  console.log("");
  console.log("  token list");
  console.log("  token create --name <name> --scopes chat:write,memory:read [--days 90]");
  console.log("  token revoke <id>");
  console.log("");
  console.log("  dataset list");
  console.log("  dataset create <name>");
  console.log("  dataset add <datasetId> --input \"…\" [--expected \"…\"] [--context \"…\"]");
  console.log("  dataset replay <datasetId> [--model …] [--evals id1,id2] [--concurrency 3]");
  console.log("  dataset runs <datasetId>");
  console.log("");
  console.log("  redteam probes [--categories jailbreak,prompt_injection,…]");
  console.log("  redteam run [--model …] [--categories …] [--verbose]");
  console.log("");
  console.log("  experiment create --name X --arms 'a:gpt-4o:50,b:claude-sonnet-4-6:50'");
  console.log("  experiment stats <id>");
  console.log("  experiment start|pause|stop <id>");
  console.log("");
  console.log("  cost [--days 7] [--lookback 7]");
  console.log("");
  console.log("  hermes status                  Show Hermes home / DB status + entry counts");
  console.log("  hermes push                    Push Wings Of World memory -> Hermes facts");
  console.log("  hermes pull                    Pull Hermes facts -> Wings Of World memory");
  console.log("  hermes sync                    Bidirectional reconciliation (push then pull)");
  console.log("");
  console.log("  cascade config                 Show current cascade tiers + mode");
  console.log("  cascade stats [--days 7]       Show savings vs always-large");
  console.log("  cascade test <prompt>          Run a single message through the cascade");
  console.log("");
  console.log("  compress config                Show compression level + thresholds");
  console.log("  compress test <text> [--level light|aggressive] [--verbose]");
  console.log("");
  console.log("  tool-cache stats [--verbose]   Cache hit rate + per-tool breakdown");
  console.log("  tool-cache list [--limit 30]   Recent / hot cache entries");
  console.log("  tool-cache clear [--tool name] Remove all (or per-tool) entries");
  console.log("  tool-cache prune [--max 5000]  Drop expired + LRU-evict over limit");
  console.log("");
  console.log("  optimization [--days 7]        Unified savings dashboard (cascade + cache + consolidation)");
  console.log("");
  console.log("Flags:");
  console.log("  --no-open         Do not open the browser automatically (dev/prod)");
  console.log("  --host <url>      Override API base URL (default: $WINGS_OF_WORLD_API_BASE, $WINGS_API_BASE, or http://127.0.0.1:3001)");
  console.log("");
  console.log("Examples:");
  console.log("  wings-of-world chat \"summarize the latest commit\" --stream");
  console.log("  wings-of-world agent \"search the web for OpenAI news and save key points\" --trace");
  console.log("  wings-of-world memory search \"how does the agentic loop work\"");
  console.log("  wings-of-world tasks add \"daily news brief\" --name=morning --every=86400000");
  console.log("  echo \"long message via stdin\" | wings-of-world chat");
}

function printDoctor() {
  printBanner();

  const config = readJsonSafe(path.join(dataDir, "config.json"));
  const localEnv = loadLocalEnv();
  const readiness = {
    dataDirExists: fs.existsSync(dataDir),
    hasConfig: Boolean(config),
    provider: config?.provider || "not configured",
    model: config?.model || "not configured",
    baseURL: config?.baseURL || "not configured",
    hasApiKey: Boolean(config?.apiKey),
    hasTelegramToken: Boolean(localEnv.TELEGRAM_BOT_TOKEN),
  };

  console.log(colorize("green", "Doctor"));
  console.log(`  data dir     ${readiness.dataDirExists ? "ready" : "missing"}`);
  console.log(`  config       ${readiness.hasConfig ? "ready" : "missing"}`);
  console.log(`  provider     ${readiness.provider}`);
  console.log(`  model        ${readiness.model}`);
  console.log(`  base URL     ${readiness.baseURL}`);
  console.log(`  api key      ${readiness.hasApiKey ? "saved" : "not saved"}`);
  console.log(`  telegram     ${readiness.hasTelegramToken ? "token loaded" : "not configured"}`);
  console.log("");
  console.log("Quick start:");
  console.log("  1. wings-of-world dev");
  console.log("  2. Open Settings in the browser");
  console.log("  3. Save your provider key");
  console.log("  4. Test connection");
}

async function main() {
  ensureDataDir();
  const command = (process.argv[2] || "help").toLowerCase();
  const subArgs = process.argv.slice(3);

  try {
    switch (command) {
      case "dev":
        printBanner();
        scheduleBrowserOpen("http://127.0.0.1:5173", 3500);
        await run("pnpm", ["dev"]);
        break;
      case "prod":
        printBanner();
        await run("pnpm", ["build"], { NODE_ENV: "production" });
        scheduleBrowserOpen("http://127.0.0.1:3000", 2500);
        await run("node", ["dist/index.js"], { NODE_ENV: "production" });
        break;
      case "build":
        printBanner();
        await run("pnpm", ["build"]);
        break;
      case "check":
        printBanner();
        await run("pnpm", ["check"]);
        break;
      case "test":
        printBanner();
        await run("pnpm", ["test"]);
        break;
      case "verify-responses":
        printBanner();
        await run("pnpm", ["verify:responses"]);
        break;
      case "doctor":
        printDoctor();
        break;

      // ── API commands ─────────────────────────────────────────────
      case "chat":
        await cmdChat(subArgs);
        break;
      case "agent":
        await cmdAgent(subArgs);
        break;
      case "repl":
        await cmdRepl(subArgs);
        break;
      case "memory":
        await cmdMemory(subArgs);
        break;
      case "tools":
        await cmdTools(subArgs);
        break;
      case "tasks":
        await cmdTasks(subArgs);
        break;
      case "webhooks":
        await cmdWebhooks(subArgs);
        break;
      case "audit":
        await cmdAudit(subArgs);
        break;
      case "history":
        await cmdHistory(subArgs);
        break;
      case "status":
        await cmdStatus(subArgs);
        break;
      case "eval":
        await cmdEval(subArgs);
        break;
      case "guardrails":
        await cmdGuardrails(subArgs);
        break;
      case "trace":
      case "traces":
        await cmdTrace(subArgs);
        break;
      case "cache":
        await cmdCache(subArgs);
        break;
      case "token":
      case "tokens":
        await cmdToken(subArgs);
        break;
      case "dataset":
      case "datasets":
        await cmdDataset(subArgs);
        break;
      case "redteam":
      case "adversarial":
        await cmdRedTeam(subArgs);
        break;
      case "experiment":
      case "experiments":
      case "ab":
        await cmdExperiment(subArgs);
        break;
      case "cost":
        await cmdCost(subArgs);
        break;
      case "hermes":
        await cmdHermes(subArgs);
        break;
      case "cascade":
        await cmdCascade(subArgs);
        break;
      case "compress":
        await cmdCompress(subArgs);
        break;
      case "tool-cache":
      case "toolcache":
        await cmdToolCache(subArgs);
        break;
      case "optimization":
      case "opt":
        await cmdOptimization(subArgs);
        break;

      case "help":
      case "--help":
      case "-h":
      default:
        printHelp();
        break;
    }
  } catch (error) {
    console.error("");
    console.error(
      colorize(
        "red",
        error instanceof Error ? error.message : String(error),
      ),
    );
    process.exitCode = 1;
  }
}

main();
