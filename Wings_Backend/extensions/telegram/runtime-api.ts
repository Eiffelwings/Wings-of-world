export type {
  ChannelMessageActionAdapter,
  ChannelPlugin,
  WingsConfig,
  WingsPluginApi,
  PluginRuntime,
  TelegramAccountConfig,
  TelegramActionConfig,
  TelegramNetworkConfig,
} from "mechanical-wings/plugin-sdk/telegram-core";
export type { TelegramApiOverride } from "./src/send.js";
export type {
  WingsPluginService,
  WingsPluginServiceContext,
  PluginLogger,
} from "mechanical-wings/plugin-sdk/core";
export type {
  AcpRuntime,
  AcpRuntimeCapabilities,
  AcpRuntimeDoctorReport,
  AcpRuntimeEnsureInput,
  AcpRuntimeEvent,
  AcpRuntimeHandle,
  AcpRuntimeStatus,
  AcpRuntimeTurnInput,
  AcpRuntimeErrorCode,
  AcpSessionUpdateTag,
} from "mechanical-wings/plugin-sdk/acp-runtime";
export { AcpRuntimeError } from "mechanical-wings/plugin-sdk/acp-runtime";

export {
  buildTokenChannelStatusSummary,
  clearAccountEntryFields,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  parseTelegramTopicConversation,
  projectCredentialSnapshotFields,
  resolveConfiguredFromCredentialStatuses,
  resolveTelegramPollVisibility,
} from "mechanical-wings/plugin-sdk/telegram-core";
export {
  buildChannelConfigSchema,
  getChatChannelMeta,
  jsonResult,
  readNumberParam,
  readReactionParams,
  readStringArrayParam,
  readStringOrNumberParam,
  readStringParam,
  resolvePollMaxSelections,
  TelegramConfigSchema,
} from "mechanical-wings/plugin-sdk/telegram-core";
export type { TelegramProbe } from "./src/probe.js";
export { auditTelegramGroupMembership, collectTelegramUnmentionedGroupIds } from "./src/audit.js";
export { resolveTelegramRuntimeGroupPolicy } from "./src/group-access.js";
export {
  buildTelegramExecApprovalPendingPayload,
  shouldSuppressTelegramExecApprovalForwardingFallback,
} from "./src/exec-approval-forwarding.js";
export { telegramMessageActions } from "./src/channel-actions.js";
export { monitorTelegramProvider } from "./src/monitor.js";
export { probeTelegram } from "./src/probe.js";
export {
  resolveTelegramFetch,
  resolveTelegramTransport,
  shouldRetryTelegramTransportFallback,
} from "./src/fetch.js";
export { makeProxyFetch } from "./src/proxy.js";
export {
  createForumTopicTelegram,
  deleteMessageTelegram,
  editForumTopicTelegram,
  editMessageReplyMarkupTelegram,
  editMessageTelegram,
  pinMessageTelegram,
  reactMessageTelegram,
  renameForumTopicTelegram,
  sendMessageTelegram,
  sendPollTelegram,
  sendStickerTelegram,
  sendTypingTelegram,
  unpinMessageTelegram,
} from "./src/send.js";
export {
  createTelegramThreadBindingManager,
  getTelegramThreadBindingManager,
  setTelegramThreadBindingIdleTimeoutBySessionKey,
  setTelegramThreadBindingMaxAgeBySessionKey,
} from "./src/thread-bindings.js";
export { resolveTelegramToken } from "./src/token.js";
