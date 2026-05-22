import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "mechanical-wings",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "mechanical-wings", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("leaves gateway --dev for subcommands after leading root options", () => {
    const res = parseCliProfileArgs([
      "node",
      "mechanical-wings",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "mechanical-wings",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "mechanical-wings", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "mechanical-wings", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "mechanical-wings", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "mechanical-wings", "status"]);
  });

  it("parses interleaved --profile after the command token", () => {
    const res = parseCliProfileArgs(["node", "mechanical-wings", "status", "--profile", "work", "--deep"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "mechanical-wings", "status", "--deep"]);
  });

  it("parses interleaved --dev after the command token", () => {
    const res = parseCliProfileArgs(["node", "mechanical-wings", "status", "--dev"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "mechanical-wings", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "mechanical-wings", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it.each([
    ["--dev first", ["node", "mechanical-wings", "--dev", "--profile", "work", "status"]],
    ["--profile first", ["node", "mechanical-wings", "--profile", "work", "--dev", "status"]],
    ["interleaved after command", ["node", "mechanical-wings", "status", "--profile", "work", "--dev"]],
  ])("rejects combining --dev with --profile (%s)", (_name, argv) => {
    const res = parseCliProfileArgs(argv);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".wings-of-world-backend-dev");
    expect(env.OPENCLAW_PROFILE).toBe("dev");
    expect(env.OPENCLAW_STATE_DIR).toBe(expectedStateDir);
    expect(env.OPENCLAW_CONFIG_PATH).toBe(path.join(expectedStateDir, "wings-of-world.json"));
    expect(env.OPENCLAW_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      OPENCLAW_STATE_DIR: "/custom",
      OPENCLAW_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.OPENCLAW_STATE_DIR).toBe("/custom");
    expect(env.OPENCLAW_GATEWAY_PORT).toBe("19099");
    expect(env.OPENCLAW_CONFIG_PATH).toBe(path.join("/custom", "wings-of-world.json"));
  });

  it("uses OPENCLAW_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      OPENCLAW_HOME: "/srv/mechanical-wings-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/mechanical-wings-home");
    expect(env.OPENCLAW_STATE_DIR).toBe(path.join(resolvedHome, ".wings-of-world-backend-work"));
    expect(env.OPENCLAW_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".wings-of-world-backend-work", "wings-of-world.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it.each([
    {
      name: "no profile is set",
      cmd: "mechanical-wings doctor --fix",
      env: {},
      expected: "wings-of-world-backend doctor --fix",
    },
    {
      name: "profile is default",
      cmd: "mechanical-wings doctor --fix",
      env: { OPENCLAW_PROFILE: "default" },
      expected: "wings-of-world-backend doctor --fix",
    },
    {
      name: "profile is Default (case-insensitive)",
      cmd: "mechanical-wings doctor --fix",
      env: { OPENCLAW_PROFILE: "Default" },
      expected: "wings-of-world-backend doctor --fix",
    },
    {
      name: "profile is invalid",
      cmd: "mechanical-wings doctor --fix",
      env: { OPENCLAW_PROFILE: "bad profile" },
      expected: "wings-of-world-backend doctor --fix",
    },
    {
      name: "--profile is already present",
      cmd: "mechanical-wings --profile work doctor --fix",
      env: { OPENCLAW_PROFILE: "work" },
      expected: "wings-of-world-backend --profile work doctor --fix",
    },
    {
      name: "--dev is already present",
      cmd: "mechanical-wings --dev doctor",
      env: { OPENCLAW_PROFILE: "dev" },
      expected: "wings-of-world-backend --dev doctor",
    },
  ])("returns command unchanged when $name", ({ cmd, env, expected }) => {
    expect(formatCliCommand(cmd, env)).toBe(expected);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("mechanical-wings doctor --fix", { OPENCLAW_PROFILE: "work" })).toBe(
      "wings-of-world-backend --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("mechanical-wings doctor --fix", { OPENCLAW_PROFILE: "  jbmechanical-wings  " })).toBe(
      "wings-of-world-backend --profile jbmechanical-wings doctor --fix",
    );
  });

  it("handles command with no args after mechanical-wings", () => {
    expect(formatCliCommand("mechanical-wings", { OPENCLAW_PROFILE: "test" })).toBe(
      "wings-of-world-backend --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm mechanical-wings doctor", { OPENCLAW_PROFILE: "work" })).toBe(
      "pnpm wings-of-world-backend --profile work doctor",
    );
  });

  it("inserts --container when a container hint is set", () => {
    expect(
      formatCliCommand("mechanical-wings gateway status --deep", { OPENCLAW_CONTAINER_HINT: "demo" }),
    ).toBe("wings-of-world-backend --container demo gateway status --deep");
  });

  it("preserves both --container and --profile hints", () => {
    expect(
      formatCliCommand("mechanical-wings doctor", {
        OPENCLAW_CONTAINER_HINT: "demo",
        OPENCLAW_PROFILE: "work",
      }),
    ).toBe("wings-of-world-backend --container demo doctor");
  });

  it("does not prepend --container for update commands", () => {
    expect(formatCliCommand("mechanical-wings update", { OPENCLAW_CONTAINER_HINT: "demo" })).toBe(
      "wings-of-world-backend update",
    );
    expect(
      formatCliCommand("pnpm mechanical-wings update --channel beta", { OPENCLAW_CONTAINER_HINT: "demo" }),
    ).toBe("pnpm wings-of-world-backend update --channel beta");
  });
});
