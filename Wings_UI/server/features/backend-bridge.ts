import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import net from "net";

export type BackendCliResolution = {
  command: string;
  baseArgs: string[];
  cwd: string;
  source: "env" | "local" | "global";
  backendRoot: string;
  localEntry: string;
};

export type BackendProbeResult = {
  ok: boolean;
  status?: number;
  source?: "tcp" | "cli-health";
  durationMs?: number;
  bodyPreview?: string;
  error?: string;
};

export type BackendBridgeStatus = Awaited<ReturnType<BackendBridge["getBackendBridgeStatus"]>>;

type AuditEntrySink = (entry: {
  area: "system";
  action: string;
  status: "success" | "error";
  summary: string;
  targetId?: string;
}) => void;

export type BackendBridgeOptions = {
  projectRoot: string;
  dataDir: string;
  appendAuditEntry?: AuditEntrySink;
};

export type BackendBridge = ReturnType<typeof createBackendBridge>;

function envValue(primary: string, fallback?: string) {
  const primaryValue = process.env[primary];
  if (primaryValue !== undefined && primaryValue !== "") return primaryValue;
  if (fallback) {
    const fallbackValue = process.env[fallback];
    if (fallbackValue !== undefined && fallbackValue !== "") return fallbackValue;
  }
  return undefined;
}

function normalizeBackendGatewayHttpUrl(raw: string, fallbackPort: number) {
  try {
    const url = new URL(raw);
    if (url.protocol === "ws:") url.protocol = "http:";
    if (url.protocol === "wss:") url.protocol = "https:";
    return url.toString().replace(/\/$/, "");
  } catch {
    return `http://127.0.0.1:${fallbackPort}`;
  }
}

function formatShellCommand(command: string, args: string[]) {
  const quote = (value: string) =>
    /^[a-zA-Z0-9_./:=@+-]+$/.test(value)
      ? value
      : JSON.stringify(value);
  return [command, ...args].map(quote).join(" ");
}

function shouldSpawnWithShell(command: string) {
  if (process.platform !== "win32") return false;
  return !command.toLowerCase().endsWith(".exe");
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function createBackendBridge(options: BackendBridgeOptions) {
  const projectRoot = options.projectRoot;
  const dataDir = options.dataDir;
  const fallbackPort = Number(envValue("WINGS_OF_WORLD_BACKEND_GATEWAY_PORT", "OPENCLAW_GATEWAY_PORT") || "18789");
  const gatewayPort = Number.isFinite(fallbackPort) && fallbackPort > 0 ? fallbackPort : 18789;
  const gatewayUrl = normalizeBackendGatewayHttpUrl(
    envValue("WINGS_OF_WORLD_BACKEND_GATEWAY_URL", "OPENCLAW_GATEWAY_URL") ||
      `http://127.0.0.1:${gatewayPort}`,
    gatewayPort,
  );
  const stateDir =
    envValue("WINGS_OF_WORLD_BACKEND_STATE_DIR", "OPENCLAW_STATE_DIR") ||
    path.join(dataDir, "backend-gateway");
  const logDir = path.join(dataDir, "logs");
  let cachedCliHealth: { at: number; result: BackendProbeResult } | null = null;

  function getBackendRoot() {
    return path.resolve(projectRoot, "..", "Wings_Backend");
  }

  function resolveBackendCli(): BackendCliResolution {
    const explicit = process.env.WINGS_OF_WORLD_BACKEND_CLI?.trim();
    const backendRoot = getBackendRoot();
    const localEntry = path.join(backendRoot, "wings-of-world-backend.mjs");

    if (explicit) {
      const cwd = fs.existsSync(backendRoot) ? backendRoot : path.resolve(projectRoot, "..");
      if (explicit.toLowerCase().endsWith(".mjs") || explicit.toLowerCase().endsWith(".js")) {
        return { command: process.execPath, baseArgs: [explicit], cwd, source: "env", backendRoot, localEntry };
      }
      return { command: explicit, baseArgs: [], cwd, source: "env", backendRoot, localEntry };
    }

    if (fs.existsSync(localEntry)) {
      return { command: process.execPath, baseArgs: [localEntry], cwd: backendRoot, source: "local", backendRoot, localEntry };
    }

    return {
      command: "wings-of-world-backend",
      baseArgs: [],
      cwd: path.resolve(projectRoot, ".."),
      source: "global",
      backendRoot,
      localEntry,
    };
  }

  function resolveBackendCronCli() {
    const cli = resolveBackendCli();
    return { command: cli.command, baseArgs: cli.baseArgs, cwd: cli.cwd };
  }

  function getBackendBuildInfo(cli = resolveBackendCli()) {
    const packageJson = path.join(cli.backendRoot, "package.json");
    const scriptsDir = path.join(cli.backendRoot, "scripts");
    const nodeModulesDir = path.join(cli.backendRoot, "node_modules");
    const srcEntry = path.join(cli.backendRoot, "src", "entry.ts");
    const distEntryCandidates = [
      path.join(cli.backendRoot, "dist", "entry.js"),
      path.join(cli.backendRoot, "dist", "entry.mjs"),
    ];
    const distEntry = distEntryCandidates.find((candidate) => fs.existsSync(candidate)) || null;
    return {
      backendRoot: cli.backendRoot,
      packageJsonExists: fs.existsSync(packageJson),
      scriptsDirExists: fs.existsSync(scriptsDir),
      nodeModulesExists: fs.existsSync(nodeModulesDir),
      localEntryExists: fs.existsSync(cli.localEntry),
      sourceEntryExists: fs.existsSync(srcEntry),
      distEntry,
      distEntryExists: Boolean(distEntry),
    };
  }

  function getBackendGatewayPort() {
    try {
      const url = new URL(gatewayUrl);
      const port = Number(url.port);
      return Number.isFinite(port) && port > 0 ? port : gatewayPort;
    } catch {
      return gatewayPort;
    }
  }

  function getBackendGatewayHost() {
    try {
      const url = new URL(gatewayUrl);
      return url.hostname || "127.0.0.1";
    } catch {
      return "127.0.0.1";
    }
  }

  function getBackendEnv() {
    const configPath = path.join(stateDir, "wings-of-world.json");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      WINGS_OF_WORLD_BACKEND_STATE_DIR: stateDir,
      WINGS_OF_WORLD_BACKEND_CONFIG_PATH: configPath,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };
    // Wings_UI owns Telegram polling in this workspace. Do not leak the UI bot
    // token into the backend gateway process, or both runtimes will compete for
    // getUpdates and Telegram will return 409 Conflict.
    delete env["TELEGRAM_BOT_TOKEN"];
    delete env["TELEGRAM_ALLOWED_CHAT_IDS"];
    return env;
  }

  async function probeBackendTcp(): Promise<BackendProbeResult> {
    const started = Date.now();
    return new Promise((resolve) => {
      let settled = false;
      const socket = net.createConnection({
        host: getBackendGatewayHost(),
        port: getBackendGatewayPort(),
      });
      const finish = (result: BackendProbeResult) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({ ...result, source: "tcp", durationMs: Date.now() - started });
      };
      socket.setTimeout(700);
      socket.once("connect", () => finish({ ok: true, status: 200 }));
      socket.once("timeout", () => finish({ ok: false, error: "TCP probe timed out" }));
      socket.once("error", (error: any) => finish({ ok: false, error: error?.message || String(error) }));
    });
  }

  async function probeBackendCliHealth(cli: BackendCliResolution): Promise<BackendProbeResult> {
    if (cachedCliHealth && Date.now() - cachedCliHealth.at < 10_000) {
      return {
        ...cachedCliHealth.result,
        durationMs: 0,
        bodyPreview: cachedCliHealth.result.bodyPreview
          ? `${cachedCliHealth.result.bodyPreview} (cached)`
          : "Cached gateway health",
      };
    }
    const started = Date.now();
    const args = [...cli.baseArgs, "health", "--json", "--timeout", "5000"];
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      const child = spawn(cli.command, args, {
        cwd: cli.cwd,
        env: getBackendEnv(),
        shell: shouldSpawnWithShell(cli.command),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const timeout = setTimeout(() => {
        child.kill();
        finish({ ok: false, error: "CLI health probe timed out" });
      }, 10_000);
      const finish = (result: BackendProbeResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const finalResult = { ...result, source: "cli-health" as const, durationMs: Date.now() - started };
        cachedCliHealth = finalResult.ok ? { at: Date.now(), result: finalResult } : null;
        resolve(finalResult);
      };
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
        if (stdout.length > 262_144) stdout = stdout.slice(-262_144);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
        if (stderr.length > 65_536) stderr = stderr.slice(-65_536);
      });
      child.once("error", (error: any) => finish({ ok: false, error: error?.message || String(error) }));
      child.once("exit", (code) => {
        if (code !== 0) {
          const message = (stderr || stdout || `CLI health exited with code ${code}`).trim();
          finish({ ok: false, error: message.slice(0, 500) });
          return;
        }
        try {
          const json = JSON.parse(stdout);
          const channelKeys = json?.channels && typeof json.channels === "object" ? Object.keys(json.channels) : [];
          finish({
            ok: json?.ok === true,
            status: json?.ok === true ? 200 : 503,
            bodyPreview: JSON.stringify({
              ok: Boolean(json?.ok),
              durationMs: json?.durationMs,
              channels: channelKeys,
              defaultAgentId: json?.defaultAgentId,
            }),
            error: json?.ok === true ? undefined : "Gateway health returned ok=false",
          });
        } catch (error: any) {
          finish({
            ok: false,
            error: `CLI health returned invalid JSON: ${error?.message || String(error)}`,
            bodyPreview: stdout.slice(0, 300),
          });
        }
      });
    });
  }

  function canStartBackendGateway(status: {
    running: boolean;
    cli: { source: BackendCliResolution["source"] };
    local: { distEntryExists: boolean };
  }) {
    if (status.running) return true;
    if (status.cli.source === "env" || status.cli.source === "global") return true;
    return status.local.distEntryExists;
  }

  function getBackendRecommendedAction(params: {
    cli: BackendCliResolution;
    build: ReturnType<typeof getBackendBuildInfo>;
    tcp: BackendProbeResult;
    health: BackendProbeResult;
    ready: BackendProbeResult;
  }) {
    if (params.health.ok && params.ready.ok) return null;
    if (params.health.ok && !params.ready.ok) {
      return "Gateway is live but not ready. Run backend setup, configure gateway.mode=local, or continue with --allow-unconfigured for local development.";
    }
    if (params.tcp.ok && !params.health.ok) {
      return "A backend gateway is listening on the configured port, but Wings_UI cannot complete the gateway health check. Stop the stale gateway process and start it again from System so both sides use the same state/config.";
    }
    if (params.cli.source !== "local") {
      return "Start the configured backend CLI from System or run the displayed gateway command manually.";
    }
    if (!params.build.packageJsonExists || !params.build.localEntryExists) {
      return "Place a complete Wings_Backend checkout next to Wings_UI or set WINGS_OF_WORLD_BACKEND_CLI to a built backend CLI.";
    }
    if (!params.build.nodeModulesExists) {
      return "Run pnpm install --filter . in Wings_Backend before starting the gateway.";
    }
    if (!params.build.distEntryExists) {
      if (!params.build.scriptsDirExists) {
        return "This Wings_Backend checkout is missing build scripts and dist output. Restore the full backend source archive or set WINGS_OF_WORLD_BACKEND_CLI to a built backend CLI.";
      }
      return "Run pnpm build in Wings_Backend, then start the gateway again.";
    }
    return "Start the backend gateway from System or run the displayed command manually.";
  }

  async function getBackendBridgeStatus() {
    const cli = resolveBackendCli();
    const build = getBackendBuildInfo(cli);
    const tcp = await probeBackendTcp();
    if (!tcp.ok) cachedCliHealth = null;
    const health = tcp.ok
      ? await probeBackendCliHealth(cli)
      : { ok: false, source: "cli-health" as const, error: "Skipped because backend gateway TCP port is not reachable" };
    const ready: BackendProbeResult = health.ok
      ? { ok: true, status: 200, source: "cli-health", bodyPreview: "Gateway health returned ok=true" }
      : { ok: false, source: "cli-health", error: "Skipped because gateway health is not green" };
    const gatewayArgs = ["gateway", "--allow-unconfigured", "--port", String(getBackendGatewayPort())];
    const startArgs = [...cli.baseArgs, ...gatewayArgs];
    const logs = {
      stdout: path.join(logDir, "backend-gateway.out.log"),
      stderr: path.join(logDir, "backend-gateway.err.log"),
    };
    const status = {
      ok: health.ok,
      running: tcp.ok,
      healthy: health.ok,
      ready: ready.ok,
      gatewayUrl,
      port: getBackendGatewayPort(),
      stateDir,
      logs,
      cli: {
        command: cli.command,
        baseArgs: cli.baseArgs,
        cwd: cli.cwd,
        source: cli.source,
        startCommand: formatShellCommand(cli.command, startArgs),
      },
      local: build,
      probes: {
        tcp,
        healthz: health,
        readyz: ready,
      },
      timestamp: new Date().toISOString(),
      recommendedAction: getBackendRecommendedAction({ cli, build, tcp, health, ready }),
    };
    return {
      ...status,
      canStart: canStartBackendGateway(status),
    };
  }

  async function startBackendGateway() {
    const before = await getBackendBridgeStatus();
    if (before.running && before.healthy) {
      return { ok: true as const, alreadyRunning: true, status: before };
    }
    if (before.running && !before.healthy) {
      return {
        ok: false as const,
        status: before,
        error:
          before.recommendedAction ||
          "Backend gateway port is occupied, but the gateway health check is not passing.",
      };
    }
    if (!before.canStart) {
      return {
        ok: false as const,
        status: before,
        error: before.recommendedAction || "Backend gateway is not startable from this checkout.",
      };
    }

    const cli = resolveBackendCli();
    const gatewayArgs = ["gateway", "--allow-unconfigured", "--port", String(getBackendGatewayPort())];
    const args = [...cli.baseArgs, ...gatewayArgs];
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });

    const stdoutFd = fs.openSync(path.join(logDir, "backend-gateway.out.log"), "a");
    const stderrFd = fs.openSync(path.join(logDir, "backend-gateway.err.log"), "a");
    try {
      const child = spawn(cli.command, args, {
        cwd: cli.cwd,
        detached: true,
        shell: shouldSpawnWithShell(cli.command),
        stdio: ["ignore", stdoutFd, stderrFd],
        env: {
          ...getBackendEnv(),
        },
      });
      child.unref();
      options.appendAuditEntry?.({
        area: "system",
        action: "backend-gateway-start",
        status: "success",
        summary: `Started backend gateway process ${child.pid || "unknown"} with ${formatShellCommand(cli.command, args)}`,
      });

      for (let attempt = 0; attempt < 15; attempt += 1) {
        await wait(800);
        const status = await getBackendBridgeStatus();
        if (status.running) {
          return { ok: true as const, alreadyRunning: false, pid: child.pid, status };
        }
      }
      return { ok: true as const, alreadyRunning: false, pid: child.pid, status: await getBackendBridgeStatus() };
    } catch (error: any) {
      options.appendAuditEntry?.({
        area: "system",
        action: "backend-gateway-start",
        status: "error",
        summary: error?.message || String(error),
      });
      return { ok: false as const, status: before, error: error?.message || String(error) };
    } finally {
      fs.closeSync(stdoutFd);
      fs.closeSync(stderrFd);
    }
  }

  return {
    getBackendBridgeStatus,
    startBackendGateway,
    resolveBackendCronCli,
  };
}
