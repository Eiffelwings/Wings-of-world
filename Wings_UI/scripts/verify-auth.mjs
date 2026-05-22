import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const port = Number(process.env.WINGS_OF_WORLD_VERIFY_PORT || process.env.WINGS_VERIFY_PORT || 3014);
const tempDataDir = mkdtempSync(path.join(os.tmpdir(), "wings-auth-"));
const tempVaultDir = path.join(tempDataDir, "obsidian-disabled");
const baseApiUrl = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, ["dist/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOST: "127.0.0.1",
    WINGS_OF_WORLD_DATA_DIR: tempDataDir,
    WINGS_DATA_DIR: tempDataDir,
    OBSIDIAN_VAULT_PATH: tempVaultDir,
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_ALLOWED_CHAT_IDS: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => {
  process.stdout.write(`[verify:auth] ${chunk}`);
});

server.stderr.on("data", (chunk) => {
  process.stderr.write(`[verify:auth] ${chunk}`);
});

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseApiUrl}/health`);
      if (response.ok) return;
    } catch {}
    await delay(800);
  }
  throw new Error("Server did not become healthy in time.");
}

async function requestRaw(pathname, init = {}, token, extraHeaders = {}) {
  const response = await fetch(`${baseApiUrl}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { response, data };
}

async function request(pathname, init = {}, token, extraHeaders = {}) {
  const { response, data } = await requestRaw(pathname, init, token, extraHeaders);
  if (!response.ok) {
    throw new Error(data?.error || `${response.status} ${response.statusText}`);
  }
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  await waitForHealth();

  const healthHeaders = await fetch(`${baseApiUrl}/health`);
  assert(
    healthHeaders.headers.get("content-security-policy")?.includes("default-src 'self'"),
    "CSP header missing on health route.",
  );
  assert(
    healthHeaders.headers.get("cross-origin-opener-policy") === "same-origin",
    "COOP header missing on health route.",
  );
  assert(
    healthHeaders.headers.get("x-frame-options") === "DENY",
    "X-Frame-Options header missing on health route.",
  );

  const statusBefore = await request("/api/auth/status");
  assert(statusBefore.enabled === false, "Auth should start disabled.");

  const bootstrapped = await request("/api/auth/bootstrap", {
    method: "POST",
    body: JSON.stringify({ password: "strong-pass-123" }),
  }, undefined, { "User-Agent": "verify-auth/default-client" });
  const firstToken = bootstrapped.token;
  assert(firstToken, "Bootstrap did not return a token.");

  let unauthorizedBlocked = false;
  try {
    await request("/api/settings");
  } catch (error) {
    unauthorizedBlocked = String(error).includes("authentication");
  }
  assert(unauthorizedBlocked, "Protected settings route did not require auth.");

  const settings = await request("/api/settings", {}, firstToken, {
    "User-Agent": "verify-auth/default-client",
  });
  assert(settings.authEnabled === true, "Settings did not report auth enabled.");

  const bindingMismatch = await requestRaw(
    "/api/settings",
    {},
    firstToken,
    { "User-Agent": "verify-auth/other-client" },
  );
  assert(
    bindingMismatch.response.status === 401,
    "Session binding did not reject a different client fingerprint.",
  );

  const changed = await request(
    "/api/auth/change-password",
    {
      method: "POST",
      body: JSON.stringify({
        currentPassword: "strong-pass-123",
        newPassword: "stronger-pass-456",
      }),
    },
    firstToken,
    { "User-Agent": "verify-auth/default-client" },
  );
  const secondToken = changed.token;
  assert(secondToken && secondToken !== firstToken, "Password change did not rotate session token.");

  let oldTokenRejected = false;
  try {
    await request("/api/settings", {}, firstToken, {
      "User-Agent": "verify-auth/default-client",
    });
  } catch (error) {
    oldTokenRejected = String(error).includes("authentication");
  }
  assert(oldTokenRejected, "Old auth token still worked after password rotation.");

  const loggedOut = await request("/api/auth/logout", { method: "POST" }, secondToken, {
    "User-Agent": "verify-auth/default-client",
  });
  assert(loggedOut.ok === true, "Logout did not succeed.");

  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password: "stronger-pass-456" }),
  }, undefined, { "User-Agent": "verify-auth/default-client" });
  assert(login.token, "Login did not return a token.");

  const statusAfter = await request("/api/auth/status", {}, login.token, {
    "User-Agent": "verify-auth/default-client",
  });
  assert(statusAfter.enabled === true && statusAfter.authenticated === true, "Auth status after login was incorrect.");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failed = await requestRaw(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ password: "wrong-pass" }),
      },
      undefined,
      { "User-Agent": "verify-auth/bruteforce-client" },
    );
    if (attempt < 4) {
      assert(failed.response.status === 401, `Failed login ${attempt + 1} should return 401.`);
    }
  }

  const locked = await requestRaw(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ password: "wrong-pass" }),
    },
    undefined,
    { "User-Agent": "verify-auth/bruteforce-client" },
  );
  assert(locked.response.status === 429, "Repeated failed logins did not trigger lockout.");

  console.log("verify:auth passed");
}

run()
  .catch((error) => {
    console.error(`verify:auth failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    server.kill();
    await delay(500);
    rmSync(tempDataDir, { recursive: true, force: true });
  });
