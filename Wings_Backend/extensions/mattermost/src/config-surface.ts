import { buildChannelConfigSchema } from "mechanical-wings/plugin-sdk/channel-config-primitives";
import { MattermostConfigSchema } from "./config-schema-core.js";

export const MattermostChannelConfigSchema = buildChannelConfigSchema(MattermostConfigSchema);
