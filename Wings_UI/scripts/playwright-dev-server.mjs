import { existsSync, mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const dataDir =
  process.env.WINGS_OF_WORLD_E2E_DATA_DIR ||
  mkdtempSync(path.join(os.tmpdir(), "wings-browser-e2e-"));

function buildDevServerCommand() {
  const distEntry = path.join(process.cwd(), "dist", "index.js");
  if (process.env.WINGS_OF_WORLD_E2E_USE_DIST !== "0" && existsSync(distEntry)) {
    return {
      command: process.execPath,
      args: [distEntry],
    };
  }

  if (process.platform !== "win32") {
    return {
      command: "corepack",
      args: ["pnpm", "dev"],
    };
  }

  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "corepack pnpm dev"],
  };
}

function buildDevServerEnv() {
  const env = {
    ...process.env,
    WINGS_OF_WORLD_DATA_DIR: dataDir,
    WINGS_DATA_DIR: dataDir,
    HOST: "127.0.0.1",
    PORT: "5173",
    NODE_ENV: "production",
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_ALLOWED_CHAT_IDS: "",
    OBSIDIAN_VAULT_PATH: path.join(dataDir, "obsidian-disabled"),
  };

  if (process.platform === "win32") {
    const canonicalPath = env.Path || env.PATH;
    delete env.PATH;
    if (canonicalPath) {
      env.Path = canonicalPath;
    }
  }

  return env;
}

const devServer = buildDevServerCommand();
const child = spawn(
  devServer.command,
  devServer.args,
  {
    cwd: process.cwd(),
    env: buildDevServerEnv(),
    stdio: "inherit",
    shell: false,
  },
);

function shutdown(signal) {
  if (!child.killed) {
    child.kill(signal);
  }
  if (!process.env.WINGS_OF_WORLD_E2E_DATA_DIR) {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", () => {
  if (!process.env.WINGS_OF_WORLD_E2E_DATA_DIR) {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

child.on("exit", (code, signal) => {
  if (!process.env.WINGS_OF_WORLD_E2E_DATA_DIR) {
    rmSync(dataDir, { recursive: true, force: true });
  }
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
