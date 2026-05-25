import type { WingsConfig } from "mechanical-wings/plugin-sdk/config-runtime";
import type { TelegramExecApprovalConfig } from "mechanical-wings/plugin-sdk/config-runtime";
import { getExecApprovalReplyMetadata } from "mechanical-wings/plugin-sdk/infra-runtime";
import type { ReplyPayload } from "mechanical-wings/plugin-sdk/reply-runtime";
import { resolveTelegramAccount } from "./accounts.js";
import { resolveTelegramTargetChatType } from "./targets.js";

function normalizeApproverId(value: string | number): string {
  return String(value).trim();
}

export function resolveTelegramExecApprovalConfig(params: {
  cfg: WingsConfig;
  accountId?: string | null;
}): TelegramExecApprovalConfig | undefined {
  return resolveTelegramAccount(params).config.execApprovals;
}

export function getTelegramExecApprovalApprovers(params: {
  cfg: WingsConfig;
  accountId?: string | null;
}): string[] {
  return (resolveTelegramExecApprovalConfig(params)?.approvers ?? [])
    .map(normalizeApproverId)
    .filter(Boolean);
}

export function isTelegramExecApprovalClientEnabled(params: {
  cfg: WingsConfig;
  accountId?: string | null;
}): boolean {
  const config = resolveTelegramExecApprovalConfig(params);
  return Boolean(config?.enabled && getTelegramExecApprovalApprovers(params).length > 0);
}

export function isTelegramExecApprovalApprover(params: {
  cfg: WingsConfig;
  accountId?: string | null;
  senderId?: string | null;
}): boolean {
  const senderId = params.senderId?.trim();
  if (!senderId) {
    return false;
  }
  const approvers = getTelegramExecApprovalApprovers(params);
  return approvers.includes(senderId);
}

export function resolveTelegramExecApprovalTarget(params: {
  cfg: WingsConfig;
  accountId?: string | null;
}): "dm" | "channel" | "both" {
  return resolveTelegramExecApprovalConfig(params)?.target ?? "dm";
}

export function shouldInjectTelegramExecApprovalButtons(params: {
  cfg: WingsConfig;
  accountId?: string | null;
  to: string;
}): boolean {
  if (!isTelegramExecApprovalClientEnabled(params)) {
    return false;
  }
  const target = resolveTelegramExecApprovalTarget(params);
  const chatType = resolveTelegramTargetChatType(params.to);
  if (chatType === "direct") {
    return target === "dm" || target === "both";
  }
  if (chatType === "group") {
    return target === "channel" || target === "both";
  }
  return target === "both";
}

function resolveExecApprovalButtonsExplicitlyDisabled(params: {
  cfg: WingsConfig;
  accountId?: string | null;
}): boolean {
  const capabilities = resolveTelegramAccount(params).config.capabilities;
  if (!capabilities || Array.isArray(capabilities) || typeof capabilities !== "object") {
    return false;
  }
  const inlineButtons = (capabilities as { inlineButtons?: unknown }).inlineButtons;
  return typeof inlineButtons === "string" && inlineButtons.trim().toLowerCase() === "off";
}

export function shouldEnableTelegramExecApprovalButtons(params: {
  cfg: WingsConfig;
  accountId?: string | null;
  to: string;
}): boolean {
  if (!shouldInjectTelegramExecApprovalButtons(params)) {
    return false;
  }
  return !resolveExecApprovalButtonsExplicitlyDisabled(params);
}

export function shouldSuppressLocalTelegramExecApprovalPrompt(params: {
  cfg: WingsConfig;
  accountId?: string | null;
  payload: ReplyPayload;
}): boolean {
  void params.cfg;
  void params.accountId;
  return getExecApprovalReplyMetadata(params.payload) !== null;
}
