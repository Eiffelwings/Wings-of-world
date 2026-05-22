export const WINGS_OF_WORLD_BACKEND_CLI_ENV_VAR = "WINGS_OF_WORLD_BACKEND_CLI";
export const WINGS_OF_WORLD_BACKEND_CLI_ENV_VALUE = "1";
export const OPENCLAW_CLI_ENV_VAR = "OPENCLAW_CLI";
export const OPENCLAW_CLI_ENV_VALUE = "1";

export function markWingsExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [WINGS_OF_WORLD_BACKEND_CLI_ENV_VAR]: WINGS_OF_WORLD_BACKEND_CLI_ENV_VALUE,
    [OPENCLAW_CLI_ENV_VAR]: OPENCLAW_CLI_ENV_VALUE,
  };
}

export function ensureWingsExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[WINGS_OF_WORLD_BACKEND_CLI_ENV_VAR] = WINGS_OF_WORLD_BACKEND_CLI_ENV_VALUE;
  env[OPENCLAW_CLI_ENV_VAR] = OPENCLAW_CLI_ENV_VALUE;
  return env;
}
