import {
  buildChannelConfigSchema,
  IMessageConfigSchema,
} from "mechanical-wings/plugin-sdk/channel-config-schema";
import { iMessageChannelConfigUiHints } from "./config-ui-hints.js";

export const IMessageChannelConfigSchema = buildChannelConfigSchema(IMessageConfigSchema, {
  uiHints: iMessageChannelConfigUiHints,
});
