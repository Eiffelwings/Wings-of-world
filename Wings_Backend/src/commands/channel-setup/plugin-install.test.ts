import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const existsSync = vi.fn();
  return {
    ...actual,
    existsSync,
    default: {
      ...actual,
      existsSync,
    },
  };
});

const installPluginFromNpmSpec = vi.fn();
vi.mock("../../plugins/install.js", () => ({
  installPluginFromNpmSpec: (...args: unknown[]) => installPluginFromNpmSpec(...args),
}));

const resolveBundledPluginSources = vi.fn();
vi.mock("../../plugins/bundled-sources.js", () => ({
  findBundledPluginSourceInMap: ({
    bundled,
    lookup,
  }: {
    bundled: ReadonlyMap<string, { pluginId: string; localPath: string; npmSpec?: string }>;
    lookup: { kind: "pluginId" | "npmSpec"; value: string };
  }) => {
    const targetValue = lookup.value.trim();
    if (!targetValue) {
      return undefined;
    }
    if (lookup.kind === "pluginId") {
      return bundled.get(targetValue);
    }
    for (const source of bundled.values()) {
      if (source.npmSpec === targetValue) {
        return source;
      }
    }
    return undefined;
  },
  resolveBundledPluginSources: (...args: unknown[]) => resolveBundledPluginSources(...args),
}));

vi.mock("../../plugins/loader.js", () => ({
  loadWingsPlugins: vi.fn(),
}));

const clearPluginDiscoveryCache = vi.fn();
vi.mock("../../plugins/discovery.js", () => ({
  clearPluginDiscoveryCache: () => clearPluginDiscoveryCache(),
}));

import fs from "node:fs";
import type { ChannelPluginCatalogEntry } from "../../channels/plugins/catalog.js";
import type { WingsConfig } from "../../config/config.js";
import { loadWingsPlugins } from "../../plugins/loader.js";
import { createEmptyPluginRegistry } from "../../plugins/registry.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createPluginRecord } from "../../plugins/status.test-helpers.js";
import type { WizardPrompter } from "../../wizard/prompts.js";
import { makePrompter, makeRuntime } from "../setup/__tests__/test-utils.js";
import {
  ensureChannelSetupPluginInstalled,
  loadChannelSetupPluginRegistrySnapshotForChannel,
  reloadChannelSetupPluginRegistry,
  reloadChannelSetupPluginRegistryForChannel,
} from "./plugin-install.js";

const baseEntry: ChannelPluginCatalogEntry = {
  id: "zalo",
  pluginId: "zalo",
  meta: {
    id: "zalo",
    label: "Zalo",
    selectionLabel: "Zalo (Bot API)",
    docsPath: "/channels/zalo",
    docsLabel: "zalo",
    blurb: "Test",
  },
  install: {
    npmSpec: "@mechanical-wings/zalo",
    localPath: "extensions/zalo",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveBundledPluginSources.mockReturnValue(new Map());
  setActivePluginRegistry(createEmptyPluginRegistry());
});

function mockRepoLocalPathExists() {
  vi.mocked(fs.existsSync).mockImplementation((value) => {
    const raw = String(value);
    return raw.endsWith(`${path.sep}.git`) || raw.endsWith(`${path.sep}extensions${path.sep}zalo`);
  });
}

async function runInitialValueForChannel(channel: "dev" | "beta") {
  const runtime = makeRuntime();
  const select = vi.fn((async <T extends string>() => "skip" as T) as WizardPrompter["select"]);
  const prompter = makePrompter({ select: select as unknown as WizardPrompter["select"] });
  const cfg: WingsConfig = { update: { channel } };
  mockRepoLocalPathExists();

  await ensureChannelSetupPluginInstalled({
    cfg,
    entry: baseEntry,
    prompter,
    runtime,
  });

  const call = select.mock.calls[0];
  return call?.[0]?.initialValue;
}

function expectPluginLoadedFromLocalPath(
  result: Awaited<ReturnType<typeof ensureChannelSetupPluginInstalled>>,
) {
  const expectedPath = path.resolve(process.cwd(), "extensions/zalo");
  expect(result.installed).toBe(true);
  expect(result.cfg.plugins?.load?.paths).toContain(expectedPath);
}

describe("ensureChannelSetupPluginInstalled", () => {
  it("installs from npm and enables the plugin", async () => {
    const runtime = makeRuntime();
    const prompter = makePrompter({
      select: vi.fn(async () => "npm") as WizardPrompter["select"],
    });
    const cfg: WingsConfig = { plugins: { allow: ["other"] } };
    vi.mocked(fs.existsSync).mockReturnValue(false);
    installPluginFromNpmSpec.mockResolvedValue({
      ok: true,
      pluginId: "zalo",
      targetDir: "/tmp/zalo",
      extensions: [],
    });

    const result = await ensureChannelSetupPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expect(result.installed).toBe(true);
    expect(result.cfg.plugins?.entries?.zalo?.enabled).toBe(true);
    expect(result.cfg.plugins?.allow).toContain("zalo");
    expect(result.cfg.plugins?.installs?.zalo?.source).toBe("npm");
    expect(result.cfg.plugins?.installs?.zalo?.spec).toBe("@mechanical-wings/zalo");
    expect(result.cfg.plugins?.installs?.zalo?.installPath).toBe("/tmp/zalo");
    expect(installPluginFromNpmSpec).toHaveBeenCalledWith(
      expect.objectContaining({ spec: "@mechanical-wings/zalo" }),
    );
  });

  it("uses local path when selected", async () => {
    const runtime = makeRuntime();
    const prompter = makePrompter({
      select: vi.fn(async () => "local") as WizardPrompter["select"],
    });
    const cfg: WingsConfig = {};
    mockRepoLocalPathExists();

    const result = await ensureChannelSetupPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expectPluginLoadedFromLocalPath(result);
    expect(result.cfg.plugins?.entries?.zalo?.enabled).toBe(true);
  });

  it("uses the catalog plugin id for local-path installs", async () => {
    const runtime = makeRuntime();
    const prompter = makePrompter({
      select: vi.fn(async () => "local") as WizardPrompter["select"],
    });
    const cfg: WingsConfig = {};
    mockRepoLocalPathExists();

    const result = await ensureChannelSetupPluginInstalled({
      cfg,
      entry: {
        ...baseEntry,
        id: "teams",
        pluginId: "@mechanical-wings/msteams-plugin",
      },
      prompter,
      runtime,
    });

    expect(result.installed).toBe(true);
    expect(result.pluginId).toBe("@mechanical-wings/msteams-plugin");
    expect(result.cfg.plugins?.entries?.["@mechanical-wings/msteams-plugin"]?.enabled).toBe(true);
  });

  it("defaults to local on dev channel when local path exists", async () => {
    expect(await runInitialValueForChannel("dev")).toBe("local");
  });

  it("defaults to npm on beta channel even when local path exists", async () => {
    expect(await runInitialValueForChannel("beta")).toBe("npm");
  });

  it("defaults to bundled local path on beta channel when available", async () => {
    const runtime = makeRuntime();
    const select = vi.fn((async <T extends string>() => "skip" as T) as WizardPrompter["select"]);
    const prompter = makePrompter({ select: select as unknown as WizardPrompter["select"] });
    const cfg: WingsConfig = { update: { channel: "beta" } };
    vi.mocked(fs.existsSync).mockReturnValue(false);
    resolveBundledPluginSources.mockReturnValue(
      new Map([
        [
          "zalo",
          {
            pluginId: "zalo",
            localPath: "/opt/mechanical-wings/extensions/zalo",
            npmSpec: "@mechanical-wings/zalo",
          },
        ],
      ]),
    );

    await ensureChannelSetupPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValue: "local",
        options: expect.arrayContaining([
          expect.objectContaining({
            value: "local",
            hint: "/opt/mechanical-wings/extensions/zalo",
          }),
        ]),
      }),
    );
  });

  it("does not default to bundled local path when an external catalog overrides the npm spec", async () => {
    const runtime = makeRuntime();
    const select = vi.fn((async <T extends string>() => "skip" as T) as WizardPrompter["select"]);
    const prompter = makePrompter({ select: select as unknown as WizardPrompter["select"] });
    const cfg: WingsConfig = { update: { channel: "beta" } };
    vi.mocked(fs.existsSync).mockReturnValue(false);
    resolveBundledPluginSources.mockReturnValue(
      new Map([
        [
          "whatsapp",
          {
            pluginId: "whatsapp",
            localPath: "/opt/mechanical-wings/extensions/whatsapp",
            npmSpec: "@mechanical-wings/whatsapp",
          },
        ],
      ]),
    );

    await ensureChannelSetupPluginInstalled({
      cfg,
      entry: {
        id: "whatsapp",
        meta: {
          id: "whatsapp",
          label: "WhatsApp",
          selectionLabel: "WhatsApp",
          docsPath: "/channels/whatsapp",
          blurb: "Test",
        },
        install: {
          npmSpec: "@vendor/whatsapp-fork",
        },
      },
      prompter,
      runtime,
    });

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValue: "npm",
        options: [
          expect.objectContaining({
            value: "npm",
            label: "Download from npm (@vendor/whatsapp-fork)",
          }),
          expect.objectContaining({
            value: "skip",
          }),
        ],
      }),
    );
  });

  it("falls back to local path after npm install failure", async () => {
    const runtime = makeRuntime();
    const note = vi.fn(async () => {});
    const confirm = vi.fn(async () => true);
    const prompter = makePrompter({
      select: vi.fn(async () => "npm") as WizardPrompter["select"],
      note,
      confirm,
    });
    const cfg: WingsConfig = {};
    mockRepoLocalPathExists();
    installPluginFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "nope",
    });

    const result = await ensureChannelSetupPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expectPluginLoadedFromLocalPath(result);
    expect(note).toHaveBeenCalled();
    expect(runtime.error).not.toHaveBeenCalled();
  });

  it("clears discovery cache before reloading the setup plugin registry", () => {
    const runtime = makeRuntime();
    const cfg: WingsConfig = {};

    reloadChannelSetupPluginRegistry({
      cfg,
      runtime,
      workspaceDir: "/tmp/mechanical-wings-workspace",
    });

    expect(clearPluginDiscoveryCache).toHaveBeenCalledTimes(1);
    expect(loadWingsPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        config: cfg,
        workspaceDir: "/tmp/mechanical-wings-workspace",
        cache: false,
        includeSetupOnlyChannelPlugins: true,
      }),
    );
    expect(clearPluginDiscoveryCache.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(loadWingsPlugins).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("scopes channel reloads when setup starts from an empty registry", () => {
    const runtime = makeRuntime();
    const cfg: WingsConfig = {};

    reloadChannelSetupPluginRegistryForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/mechanical-wings-workspace",
    });

    expect(loadWingsPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        config: cfg,
        workspaceDir: "/tmp/mechanical-wings-workspace",
        cache: false,
        onlyPluginIds: ["telegram"],
        includeSetupOnlyChannelPlugins: true,
      }),
    );
  });

  it("keeps full reloads when the active plugin registry is already populated", () => {
    const runtime = makeRuntime();
    const cfg: WingsConfig = {};
    const registry = createEmptyPluginRegistry();
    registry.plugins.push(
      createPluginRecord({
        id: "loaded",
        name: "loaded",
        source: "/tmp/loaded.cjs",
        origin: "bundled",
        configSchema: true,
      }),
    );
    setActivePluginRegistry(registry);

    reloadChannelSetupPluginRegistryForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/mechanical-wings-workspace",
    });

    expect(loadWingsPlugins).toHaveBeenCalledWith(
      expect.not.objectContaining({
        onlyPluginIds: expect.anything(),
      }),
    );
  });

  it("can load a channel-scoped snapshot without activating the global registry", () => {
    const runtime = makeRuntime();
    const cfg: WingsConfig = {};

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "telegram",
      workspaceDir: "/tmp/mechanical-wings-workspace",
    });

    expect(loadWingsPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        config: cfg,
        workspaceDir: "/tmp/mechanical-wings-workspace",
        cache: false,
        onlyPluginIds: ["telegram"],
        includeSetupOnlyChannelPlugins: true,
        activate: false,
      }),
    );
  });

  it("scopes snapshots by plugin id when channel and plugin ids differ", () => {
    const runtime = makeRuntime();
    const cfg: WingsConfig = {};

    loadChannelSetupPluginRegistrySnapshotForChannel({
      cfg,
      runtime,
      channel: "msteams",
      pluginId: "@mechanical-wings/msteams-plugin",
      workspaceDir: "/tmp/mechanical-wings-workspace",
    });

    expect(loadWingsPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        config: cfg,
        workspaceDir: "/tmp/mechanical-wings-workspace",
        cache: false,
        onlyPluginIds: ["@mechanical-wings/msteams-plugin"],
        includeSetupOnlyChannelPlugins: true,
        activate: false,
      }),
    );
  });
});
