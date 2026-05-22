import {
  buildChannelConfigSchema,
  MSTeamsConfigSchema,
} from "mechanical-wings/plugin-sdk/channel-config-schema";
import { msTeamsChannelConfigUiHints } from "./config-ui-hints.js";

export const MSTeamsChannelConfigSchema = buildChannelConfigSchema(MSTeamsConfigSchema, {
  uiHints: msTeamsChannelConfigUiHints,
});
