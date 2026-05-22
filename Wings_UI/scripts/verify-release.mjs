import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(projectRoot, "..");
const releaseZip = path.join(os.tmpdir(), `Wings_Of_World_release_${Date.now()}.zip`);

const checks = [
  ["pnpm", ["test"]],
  ["pnpm", ["check"]],
  ["pnpm", ["build"]],
  ["pnpm", ["verify:smoke"]],
];

if (process.env.WINGS_OF_WORLD_SKIP_BROWSER_VERIFY !== "1") {
  checks.push(["pnpm", ["verify:browser"]]);
}

function run(command, args, options = {}) {
  const npmExecPath = process.env.npm_execpath;
  const resolved =
    command === "pnpm" && npmExecPath && fs.existsSync(npmExecPath)
      ? { command: process.execPath, args: [npmExecPath, ...args] }
      : process.platform === "win32" && command === "pnpm"
        ? { command: "pnpm.cmd", args }
        : { command, args };
  const needsShell =
    process.platform === "win32" && /\.(cmd|bat)$/i.test(resolved.command);

  return new Promise((resolve, reject) => {
    const child = spawn(resolved.command, resolved.args, {
      cwd: options.cwd || projectRoot,
      env: { ...process.env, ...(options.env || {}) },
      stdio: "inherit",
      shell: needsShell,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${resolved.command} ${resolved.args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}: ${stderr.trim()}`));
      }
    });
  });
}

function psSingleQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function listZipEntries(zipPath) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$zip = [System.IO.Compression.ZipFile]::OpenRead(${psSingleQuote(zipPath)})`,
    "try {",
    "  @($zip.Entries | ForEach-Object { $_.FullName }) | ConvertTo-Json -Compress",
    "} finally {",
    "  $zip.Dispose()",
    "}",
  ].join("\n");
  const raw = await runCapture(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { cwd: repoRoot },
  );
  if (!raw.trim()) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function assertCleanEntry(entryName) {
  const normalized = entryName.replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  const baseName = lower.split("/").at(-1) || "";
  const blockedSegments = [
    "/node_modules/",
    "/dist/",
    "/build/",
    "/coverage/",
    "/data/",
    "/logs/",
    "/.git/",
    "/.pnpm-store/",
  ];
  const blockedFiles = new Set([
    ".env",
    ".env.local",
    ".env.development.local",
    ".env.test.local",
    ".env.production.local",
    "package-lock.json",
    "wings_of_world_release.zip",
  ]);

  if (blockedSegments.some((segment) => lower.includes(segment))) {
    throw new Error(`Release zip contains blocked path: ${entryName}`);
  }
  if (blockedFiles.has(baseName) || baseName.endsWith(".log") || baseName.endsWith(".db")) {
    throw new Error(`Release zip contains blocked file: ${entryName}`);
  }
}

async function verifyPackage() {
  await run(
    "powershell.exe",
    [
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(repoRoot, "package-release.ps1"),
      "-Destination",
      releaseZip,
    ],
    { cwd: repoRoot },
  );

  const entries = await listZipEntries(releaseZip);
  if (entries.length === 0) {
    throw new Error("Release zip is empty.");
  }
  for (const entryName of entries) {
    assertCleanEntry(entryName);
  }
  console.log(`Release package verified: ${releaseZip}`);
}

try {
  for (const [command, args] of checks) {
    await run(command, args);
  }
  await verifyPackage();
  console.log("verify:release passed");
} finally {
  fs.rmSync(releaseZip, { force: true });
}
