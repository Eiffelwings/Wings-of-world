import { describe, expect, it } from "vitest";
import {
  ensureWingsExecMarkerOnProcess,
  markWingsExecEnv,
  OPENCLAW_CLI_ENV_VALUE,
  OPENCLAW_CLI_ENV_VAR,
  WINGS_OF_WORLD_BACKEND_CLI_ENV_VALUE,
  WINGS_OF_WORLD_BACKEND_CLI_ENV_VAR,
} from "./mechanical-wings-exec-env.js";

describe("markWingsExecEnv", () => {
  it("returns a cloned env object with the exec marker set", () => {
    const env = { PATH: "/usr/bin", OPENCLAW_CLI: "0" };
    const marked = markWingsExecEnv(env);

    expect(marked).toEqual({
      PATH: "/usr/bin",
      WINGS_OF_WORLD_BACKEND_CLI: WINGS_OF_WORLD_BACKEND_CLI_ENV_VALUE,
      OPENCLAW_CLI: OPENCLAW_CLI_ENV_VALUE,
    });
    expect(marked).not.toBe(env);
    expect(env.OPENCLAW_CLI).toBe("0");
  });
});

describe("ensureWingsExecMarkerOnProcess", () => {
  it("mutates and returns the provided process env", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };

    expect(ensureWingsExecMarkerOnProcess(env)).toBe(env);
    expect(env[WINGS_OF_WORLD_BACKEND_CLI_ENV_VAR]).toBe(WINGS_OF_WORLD_BACKEND_CLI_ENV_VALUE);
    expect(env[OPENCLAW_CLI_ENV_VAR]).toBe(OPENCLAW_CLI_ENV_VALUE);
  });

  it("defaults to mutating process.env when no env object is provided", () => {
    const previous = process.env[OPENCLAW_CLI_ENV_VAR];
    const previousWings = process.env[WINGS_OF_WORLD_BACKEND_CLI_ENV_VAR];
    delete process.env[OPENCLAW_CLI_ENV_VAR];
    delete process.env[WINGS_OF_WORLD_BACKEND_CLI_ENV_VAR];

    try {
      expect(ensureWingsExecMarkerOnProcess()).toBe(process.env);
      expect(process.env[WINGS_OF_WORLD_BACKEND_CLI_ENV_VAR]).toBe(
        WINGS_OF_WORLD_BACKEND_CLI_ENV_VALUE,
      );
      expect(process.env[OPENCLAW_CLI_ENV_VAR]).toBe(OPENCLAW_CLI_ENV_VALUE);
    } finally {
      if (previousWings === undefined) {
        delete process.env[WINGS_OF_WORLD_BACKEND_CLI_ENV_VAR];
      } else {
        process.env[WINGS_OF_WORLD_BACKEND_CLI_ENV_VAR] = previousWings;
      }
      if (previous === undefined) {
        delete process.env[OPENCLAW_CLI_ENV_VAR];
      } else {
        process.env[OPENCLAW_CLI_ENV_VAR] = previous;
      }
    }
  });
});
