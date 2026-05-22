import type { WingsConfig } from "mechanical-wings/plugin-sdk/config-runtime";
import { getExecApprovalReplyMetadata } from "mechanical-wings/plugin-sdk/infra-runtime";
import type { ReplyPayload } from "mechanical-wings/plugin-sdk/reply-runtime";
import { resolveDiscordAccount } from "./accounts.js";

export function isDiscordExecApprovalClientEnabled(params: {
  cfg: WingsConfig;
  accountId?: string | null;
}): boolean {
  const config = resolveDiscordAccount(params).config.execApprovals;
  return Boolean(config?.enabled && (config.approvers?.length ?? 0) > 0);
}

export function shouldSuppressLocalDiscordExecApprovalPrompt(params: {
  cfg: WingsConfig;
  accountId?: string | null;
  payload: ReplyPayload;
}): boolean {
  return (
    isDiscordExecApprovalClientEnabled(params) &&
    getExecApprovalReplyMetadata(params.payload) !== null
  );
}
