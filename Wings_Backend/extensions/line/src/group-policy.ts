import { resolveChannelGroupRequireMention } from "mechanical-wings/plugin-sdk/channel-policy";
import { resolveExactLineGroupConfigKey, type WingsConfig } from "../runtime-api.js";

type LineGroupContext = {
  cfg: WingsConfig;
  accountId?: string | null;
  groupId?: string | null;
};

export function resolveLineGroupRequireMention(params: LineGroupContext): boolean {
  const exactGroupId = resolveExactLineGroupConfigKey({
    cfg: params.cfg,
    accountId: params.accountId,
    groupId: params.groupId,
  });
  return resolveChannelGroupRequireMention({
    cfg: params.cfg,
    channel: "line",
    groupId: exactGroupId ?? params.groupId,
    accountId: params.accountId,
  });
}
