#!/usr/bin/env node
// Copies non-bundled runtime assets (e.g. the guardrails YAML catalog) into
// the dist/ folder after esbuild has run. Keeps the runtime resolver simple:
// the assets sit alongside dist/index.js so they're always available.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distRoot = path.join(projectRoot, "dist");

const assets = [
  {
    from: "server/features/guardrails/evals.yaml",
    to: "guardrails/evals.yaml",
  },
];

if (!fs.existsSync(distRoot)) {
  console.error(`[bundle-assets] dist/ not found at ${distRoot} — run the bundler first.`);
  process.exit(1);
}

for (const { from, to } of assets) {
  const src = path.join(projectRoot, from);
  const dest = path.join(distRoot, to);
  if (!fs.existsSync(src)) {
    console.warn(`[bundle-assets] missing source: ${from}`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[bundle-assets] ${from} -> dist/${to}`);
}
