import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import { definePluginEntry, type AnyAgentTool, type WingsPluginApi } from "mechanical-wings/plugin-sdk/plugin-entry";
import { jsonResult, readStringParam } from "mechanical-wings/plugin-sdk/provider-web-search";

const DEFAULT_HERMES_ROOT = "D:\\hermes-agent-main";

type HermesCapabilities = {
  rootDir: string;
  exists: boolean;
  tools: string[];
  skills: string[];
  optionalSkills: string[];
  gatewayPlatforms: string[];
  plugins: string[];
  coreSystems: string[];
  docs: string[];
};

const HermesPathSchema = Type.Object(
  {
    rootDir: Type.Optional(
      Type.String({
        description: "Optional Hermes repository root. Defaults to plugin config rootDir or D:\\hermes-agent-main.",
      }),
    ),
  },
  { additionalProperties: false },
);

function normalizeName(value: string): string {
  return value
    .replace(/\.(py|ts|tsx|js|mjs|md)$/i, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-tools?$/i, "")
    .toLowerCase();
}

function asStringRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function resolveHermesRoot(api: WingsPluginApi, rawParams: Record<string, unknown>): string {
  const requested = readStringParam(rawParams, "rootDir");
  const configured = asStringRecord(api.pluginConfig).rootDir;
  const root = requested ?? (typeof configured === "string" && configured.trim() ? configured.trim() : DEFAULT_HERMES_ROOT);
  return path.resolve(root);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listDirNames(target: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(target, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function listFiles(target: string, predicate: (name: string) => boolean): Promise<string[]> {
  try {
    const entries = await fs.readdir(target, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function findSkillDirs(rootDir: string, folder: string): Promise<string[]> {
  const base = path.join(rootDir, folder);
  const found: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isFile() && entry.name.toLowerCase() === "skill.md")) {
      found.push(path.relative(base, current).replace(/\\/g, "/") || ".");
      return;
    }
    await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => walk(path.join(current, entry.name))));
  }

  await walk(base);
  return found.sort((a, b) => a.localeCompare(b));
}

async function listWingsExtensions(api: WingsPluginApi): Promise<string[]> {
  const rootDir = api.rootDir ? path.resolve(api.rootDir) : "";
  const extensionsRoot = rootDir ? path.dirname(rootDir) : path.resolve("extensions");
  return listDirNames(extensionsRoot);
}

async function readHermesCapabilities(rootDir: string): Promise<HermesCapabilities> {
  const exists = await pathExists(rootDir);
  const toolFiles = await listFiles(path.join(rootDir, "tools"), (name) => /_tools?\.py$/i.test(name));
  const gatewayPlatforms = await listDirNames(path.join(rootDir, "gateway", "platforms"));
  const pluginNames = await listDirNames(path.join(rootDir, "plugins"));
  const skills = await findSkillDirs(rootDir, "skills");
  const optionalSkills = await findSkillDirs(rootDir, "optional-skills");
  const docs = await listFiles(path.join(rootDir, "website", "docs"), (name) => /\.(md|mdx)$/i.test(name));

  const coreChecks: Array<[string, string]> = [
    ["acp-adapter", "acp_adapter/server.py"],
    ["tui-gateway", "tui_gateway/server.py"],
    ["browser-supervisor", "tools/browser_supervisor.py"],
    ["browser-camofox", "tools/browser_camofox.py"],
    ["managed-tool-gateway", "tools/managed_tool_gateway.py"],
    ["checkpoint-manager", "tools/checkpoint_manager.py"],
    ["delegate-tool", "tools/delegate_tool.py"],
    ["mcp-tool", "tools/mcp_tool.py"],
    ["memory-tool", "tools/memory_tool.py"],
    ["cronjob-tools", "tools/cronjob_tools.py"],
    ["code-execution-tool", "tools/code_execution_tool.py"],
    ["url-safety", "tools/url_safety.py"],
    ["website-policy", "tools/website_policy.py"],
  ];
  const coreSystems = (
    await Promise.all(coreChecks.map(async ([id, relPath]) => ((await pathExists(path.join(rootDir, relPath))) ? id : "")))
  ).filter(Boolean);

  return {
    rootDir,
    exists,
    tools: toolFiles.map(normalizeName),
    skills,
    optionalSkills,
    gatewayPlatforms,
    plugins: pluginNames,
    coreSystems,
    docs,
  };
}

function mapHermesToWings(capabilities: HermesCapabilities, wingsExtensions: string[]) {
  const wings = new Set(wingsExtensions.map(normalizeName));
  const platformCoverage = capabilities.gatewayPlatforms.map((name) => ({
    name,
    status: wings.has(normalizeName(name)) ? "available" : "missing",
  }));
  const coreCoverage = capabilities.coreSystems.map((name) => {
    const aliases: Record<string, string[]> = {
      "acp-adapter": ["acpx"],
      "browser-supervisor": ["browser", "brave"],
      "browser-camofox": ["browser"],
      "checkpoint-manager": ["thread-ownership"],
      "cronjob-tools": ["llm-task"],
      "image-generation-tool": ["image-generation-core"],
      "memory-tool": ["memory-core", "memory-lancedb"],
      "mcp-tool": ["acpx"],
      "url-safety": ["browser"],
    };
    const candidates = aliases[name] ?? [name];
    return {
      name,
      status: candidates.some((candidate) => wings.has(normalizeName(candidate))) ? "available-or-analog" : "missing",
      wingsCandidates: candidates,
    };
  });
  const missingPlatforms = platformCoverage.filter((item) => item.status === "missing").map((item) => item.name);
  const missingCore = coreCoverage.filter((item) => item.status === "missing").map((item) => item.name);
  return {
    wingsExtensions,
    platformCoverage,
    coreCoverage,
    missingPlatforms,
    missingCore,
    recommendedImports: [
      "Use Hermes skills/optional-skills/docs as memory search sources instead of copying Python modules.",
      "Port only missing platform adapters that Wings does not already ship.",
      "Keep Hermes execution behind explicit tools/approval; do not auto-run run_agent.py from agent prompts.",
    ],
  };
}

function createHermesCapabilitiesTool(api: WingsPluginApi): AnyAgentTool {
  return {
    name: "hermes_capabilities",
    label: "Hermes Capabilities",
    description: "Scan the local Hermes repository and return tools, skills, gateway platforms, plugins, docs, and core systems.",
    parameters: HermesPathSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const rootDir = resolveHermesRoot(api, rawParams);
      return jsonResult(await readHermesCapabilities(rootDir));
    },
  } as AnyAgentTool;
}

function createHermesGapAnalysisTool(api: WingsPluginApi): AnyAgentTool {
  return {
    name: "hermes_gap_analysis",
    label: "Hermes Gap Analysis",
    description: "Compare local Hermes capabilities against installed Wings extensions and report missing systems to import next.",
    parameters: HermesPathSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const rootDir = resolveHermesRoot(api, rawParams);
      const capabilities = await readHermesCapabilities(rootDir);
      const wingsExtensions = await listWingsExtensions(api);
      return jsonResult({
        capabilities,
        comparison: mapHermesToWings(capabilities, wingsExtensions),
      });
    },
  } as AnyAgentTool;
}

export default definePluginEntry({
  id: "hermes-bridge",
  name: "Hermes Bridge",
  description: "Local bridge for analyzing and reusing D:\\hermes-agent-main capabilities.",
  register(api) {
    api.registerTool(createHermesCapabilitiesTool(api));
    api.registerTool(createHermesGapAnalysisTool(api));
  },
});
