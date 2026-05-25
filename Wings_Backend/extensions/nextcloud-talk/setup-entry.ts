import { defineSetupPluginEntry } from "mechanical-wings/plugin-sdk/core";
import { nextcloudTalkPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(nextcloudTalkPlugin);
