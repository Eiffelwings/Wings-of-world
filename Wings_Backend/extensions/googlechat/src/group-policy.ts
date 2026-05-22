import { resolveChannelGroupRequireMention } from "mechanical-wings/plugin-sdk/channel-policy";
import type { WingsConfig } from "mechanical-wings/plugin-sdk/core";

type GoogleChatGroupContext = {
  cfg: WingsConfig;
  accountId?: string | null;
  groupId?: string | null;
};

export function resolveGoogleChatGroupRequireMention(params: GoogleChatGroupContext): boolean {
  return resolveChannelGroupRequireMention({
    cfg: params.cfg,
    channel: "googlechat",
    groupId: params.groupId,
    accountId: params.accountId,
  });
}
