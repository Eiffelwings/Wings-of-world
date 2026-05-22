import {
  buildChannelConfigSchema,
  GoogleChatConfigSchema,
} from "mechanical-wings/plugin-sdk/channel-config-schema";

export const GoogleChatChannelConfigSchema = buildChannelConfigSchema(GoogleChatConfigSchema);
