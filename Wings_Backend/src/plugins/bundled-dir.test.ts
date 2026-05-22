import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBundledPluginsDir } from "./bundled-dir.js";

const tempDirs: string[] = [];
const originalBundledDir = process.env.OPENCLAW_BUNDLED_PLUGINS_DIR;
const originalVitest = process.env.VITEST;
const originalArgv1 = process.argv[1];

function makeRepoRoot(prefix: string): string {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(repoRoot);
  return repoRoot;
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalBundledDir === undefined) {
    delete process.env.OPENCLAW_BUNDLED_PLUGINS_DIR;
  } else {
    process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = originalBundledDir;
  }
  if (originalVitest === undefined) {
    delete process.env.VITEST;
  } else {
    process.env.VITEST = originalVitest;
  }
  process.argv[1] = originalArgv1;
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveBundledPluginsDir", () => {
  it("prefers the staged runtime bundled plugin tree from the package root", () => {
    const repoRoot = makeRepoRoot("mechanical-wings-bundled-dir-runtime-");
    fs.mkdirSync(path.join(repoRoot, "dist-runtime", "extensions"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "dist", "extensions"), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, "package.json"),
      `${JSON.stringify({ name: "mechanical-wings" }, null, 2)}\n`,
      "utf8",
    );

    vi.spyOn(process, "cwd").mockReturnValue(repoRoot);
    process.argv[1] = "/usr/bin/env";

    expect(fs.realpathSync(resolveBundledPluginsDir() ?? "")).toBe(
      fs.realpathSync(path.join(repoRoot, "dist-runtime", "extensions")),
    );
  });

  it("falls back to built dist/extensions in installed package roots", () => {
    const repoRoot = makeRepoRoot("mechanical-wings-bundled-dir-dist-");
    fs.mkdirSync(path.join(repoRoot, "dist", "extensions"), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, "package.json"),
      `${JSON.stringify({ name: "mechanical-wings" }, null, 2)}\n`,
      "utf8",
    );

    vi.spyOn(process, "cwd").mockReturnValue(repoRoot);
    process.argv[1] = "/usr/bin/env";

    expect(fs.realpathSync(resolveBundledPluginsDir() ?? "")).toBe(
      fs.realpathSync(path.join(repoRoot, "dist", "extensions")),
    );
  });

  it("prefers source extensions under vitest to avoid stale staged plugins", () => {
    const repoRoot = makeRepoRoot("mechanical-wings-bundled-dir-vitest-");
    fs.mkdirSync(path.join(repoRoot, "extensions"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "dist-runtime", "extensions"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "dist", "extensions"), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, "package.json"),
      `${JSON.stringify({ name: "mechanical-wings" }, null, 2)}\n`,
      "utf8",
    );

    vi.spyOn(process, "cwd").mockReturnValue(repoRoot);
    process.env.VITEST = "true";
    process.argv[1] = "/usr/bin/env";

    expect(fs.realpathSync(resolveBundledPluginsDir() ?? "")).toBe(
      fs.realpathSync(path.join(repoRoot, "extensions")),
    );
  });

  it("prefers source extensions in a git checkout even without vitest env", () => {
    const repoRoot = makeRepoRoot("mechanical-wings-bundled-dir-git-");
    fs.mkdirSync(path.join(repoRoot, "extensions"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "dist-runtime", "extensions"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "dist", "extensions"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, ".git"), "gitdir: /tmp/fake.git\n", "utf8");
    fs.writeFileSync(
      path.join(repoRoot, "package.json"),
      `${JSON.stringify({ name: "mechanical-wings" }, null, 2)}\n`,
      "utf8",
    );

    vi.spyOn(process, "cwd").mockReturnValue(repoRoot);
    delete process.env.VITEST;
    process.argv[1] = "/usr/bin/env";

    expect(fs.realpathSync(resolveBundledPluginsDir() ?? "")).toBe(
      fs.realpathSync(path.join(repoRoot, "extensions")),
    );
  });

  it("prefers the running CLI package root over an unrelated cwd checkout", () => {
    const installedRoot = makeRepoRoot("mechanical-wings-bundled-dir-installed-");
    fs.mkdirSync(path.join(installedRoot, "dist", "extensions"), { recursive: true });
    fs.writeFileSync(
      path.join(installedRoot, "package.json"),
      `${JSON.stringify({ name: "mechanical-wings" }, null, 2)}\n`,
      "utf8",
    );

    const cwdRepoRoot = makeRepoRoot("mechanical-wings-bundled-dir-cwd-");
    fs.mkdirSync(path.join(cwdRepoRoot, "extensions"), { recursive: true });
    fs.mkdirSync(path.join(cwdRepoRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(cwdRepoRoot, ".git"), "gitdir: /tmp/fake.git\n", "utf8");
    fs.writeFileSync(
      path.join(cwdRepoRoot, "package.json"),
      `${JSON.stringify({ name: "mechanical-wings" }, null, 2)}\n`,
      "utf8",
    );

    vi.spyOn(process, "cwd").mockReturnValue(cwdRepoRoot);
    process.argv[1] = path.join(installedRoot, "mechanical-wings.mjs");

    expect(fs.realpathSync(resolveBundledPluginsDir() ?? "")).toBe(
      fs.realpathSync(path.join(installedRoot, "dist", "extensions")),
    );
  });

  it("falls back to the running installed package when the override path is stale", () => {
    const installedRoot = makeRepoRoot("mechanical-wings-bundled-dir-override-");
    fs.mkdirSync(path.join(installedRoot, "dist", "extensions"), { recursive: true });
    fs.writeFileSync(
      path.join(installedRoot, "package.json"),
      `${JSON.stringify({ name: "mechanical-wings" }, null, 2)}\n`,
      "utf8",
    );

    process.argv[1] = path.join(installedRoot, "mechanical-wings.mjs");
    process.env.OPENCLAW_BUNDLED_PLUGINS_DIR = path.join(installedRoot, "missing-extensions");

    expect(fs.realpathSync(resolveBundledPluginsDir() ?? "")).toBe(
      fs.realpathSync(path.join(installedRoot, "dist", "extensions")),
    );
  });
});
