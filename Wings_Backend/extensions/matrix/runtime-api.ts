// Keep the external runtime API light so Jiti callers can resolve Matrix config
// helpers without traversing the full plugin-sdk/runtime graph or bootstrapping
// matrix-js-sdk during plain runtime-api import.
export * from "./src/auth-precedence.js";
export {
  requiresExplicitMatrixDefaultAccount,
  resolveMatrixDefaultOrOnlyAccountId,
} from "./src/account-selection.js";
export * from "./helper-api.js";
export {
  assertHttpUrlTargetsPrivateNetwork,
  closeDispatcher,
  createPinnedDispatcher,
  resolvePinnedHostnameWithPolicy,
  ssrfPolicyFromAllowPrivateNetwork,
  type LookupFn,
  type SsrFPolicy,
} from "mechanical-wings/plugin-sdk/ssrf-runtime";
export {
  setMatrixThreadBindingIdleTimeoutBySessionKey,
  setMatrixThreadBindingMaxAgeBySessionKey,
} from "./thread-bindings-runtime.js";
export { setMatrixRuntime } from "./src/runtime.js";
export { writeJsonFileAtomically } from "mechanical-wings/plugin-sdk/json-store";
export type {
  ChannelDirectoryEntry,
  ChannelMessageActionContext,
  WingsConfig,
  PluginRuntime,
  RuntimeLogger,
  RuntimeEnv,
  WizardPrompter,
} from "mechanical-wings/plugin-sdk/matrix";
export { formatZonedTimestamp } from "mechanical-wings/plugin-sdk/matrix";
