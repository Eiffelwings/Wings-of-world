#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hashFile = path.join(rootDir, "src", "canvas-host", "a2ui", ".bundle.hash");
const outputFile = path.join(rootDir, "src", "canvas-host", "a2ui", "a2ui.bundle.js");
const rendererDir = path.join(rootDir, "vendor", "a2ui", "renderers", "lit");
const requiredRendererFiles = [
  path.join(rendererDir, "src", "0.8", "data", "model-processor.js"),
  path.join(rendererDir, "src", "0.8", "data", "signal-model-processor.js"),
  path.join(rendererDir, "src", "0.8", "data", "guards.js"),
];
const appDirCandidates = [
  path.join(rootDir, "apps", "shared", "OpenClawKit", "Tools", "CanvasA2UI"),
  path.join(rootDir, "apps", "shared", "WingsOfWorldKit", "Tools", "CanvasA2UI"),
];
const appDir = appDirCandidates.find((candidate) => existsSync(candidate));

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function walk(entryPath, files) {
  const entryStat = await stat(entryPath);
  if (entryStat.isDirectory()) {
    const entries = await readdir(entryPath);
    for (const entry of entries) {
      await walk(path.join(entryPath, entry), files);
    }
    return;
  }
  files.push(entryPath);
}

function normalizePath(input) {
  return input.split(path.sep).join("/");
}

async function computeHash(inputs) {
  const files = [];
  for (const input of inputs) {
    await walk(input, files);
  }
  files.sort((a, b) => normalizePath(a).localeCompare(normalizePath(b)));

  const hash = createHash("sha256");
  for (const filePath of files) {
    const rel = normalizePath(path.relative(rootDir, filePath));
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function quoteForCmd(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function run(command, args) {
  const executable = command === "node" ? process.execPath : command;
  const useShell = process.platform === "win32" && command === "pnpm";
  const result = useShell
    ? spawnSync([command, ...args].map(quoteForCmd).join(" "), {
        cwd: rootDir,
        stdio: "inherit",
        shell: true,
      })
    : spawnSync(executable, args, {
        cwd: rootDir,
        stdio: "inherit",
        shell: false,
      });
  if (result.error) {
    fail(`${command} ${args.join(" ")} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function writeFallbackBundle(reason) {
  const escapedReason = JSON.stringify(reason);
  const bundle = `
class WingsOfWorldA2uiFallback extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = \`
      <style>
        :host {
          box-sizing: border-box;
          display: grid;
          min-height: 100%;
          place-items: center;
          padding: 24px;
          color: #17202a;
          font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .panel {
          max-width: 520px;
          border: 1px solid rgba(23, 32, 42, 0.16);
          border-radius: 8px;
          padding: 18px;
          background: rgba(255, 255, 255, 0.92);
          box-shadow: 0 14px 40px rgba(23, 32, 42, 0.12);
        }
        h1 {
          margin: 0 0 8px;
          font-size: 16px;
          line-height: 1.25;
        }
        p {
          margin: 0;
          color: #4b5563;
        }
      </style>
      <section class="panel" role="status" aria-live="polite">
        <h1>Wings Of World A2UI is not bundled</h1>
        <p>${reason}</p>
      </section>
    \`;
  }
}
customElements.define("mechanical-wings-a2ui-host", WingsOfWorldA2uiFallback);
customElements.define("wings-of-world-a2ui-host", WingsOfWorldA2uiFallback);
globalThis.Wings = globalThis.Wings ?? {};
globalThis.Wings.a2uiFallbackReason = ${escapedReason};
`.trimStart();
  writeFileSync(outputFile, bundle);
}

function existingRolldownArgs(configPath) {
  const candidates = [
    path.join(rootDir, "node_modules", ".pnpm", "node_modules", "rolldown", "bin", "cli.mjs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return ["node", [candidate, "-c", configPath]];
    }
  }
  return ["pnpm", ["-s", "exec", "rolldown", "-c", configPath]];
}

if (!existsSync(rendererDir) || !appDir) {
  if (existsSync(outputFile)) {
    console.log("A2UI sources missing; keeping prebuilt bundle.");
    process.exit(0);
  }
  writeFallbackBundle("A2UI source files are not included in this checkout.");
  console.log("A2UI sources missing; wrote fallback bundle.");
  process.exit(0);
}

if (requiredRendererFiles.some((filePath) => !existsSync(filePath))) {
  if (existsSync(outputFile)) {
    console.log("A2UI renderer sources incomplete; keeping prebuilt bundle.");
    process.exit(0);
  }
  writeFallbackBundle("A2UI renderer sources are incomplete in this checkout.");
  console.log("A2UI renderer sources incomplete; wrote fallback bundle.");
  process.exit(0);
}

const inputs = [
  path.join(rootDir, "package.json"),
  path.join(rootDir, "pnpm-lock.yaml"),
  rendererDir,
  appDir,
];

const currentHash = await computeHash(inputs);
if (existsSync(hashFile) && existsSync(outputFile)) {
  const previousHash = readFileSync(hashFile, "utf8").trim();
  if (previousHash === currentHash) {
    console.log("A2UI bundle up to date; skipping.");
    process.exit(0);
  }
}

run("pnpm", ["-s", "exec", "tsc", "-p", path.join(rendererDir, "tsconfig.json")]);
const [rolldownCommand, rolldownArgs] = existingRolldownArgs(path.join(appDir, "rolldown.config.mjs"));
run(rolldownCommand, rolldownArgs);
writeFileSync(hashFile, `${currentHash}\n`);
