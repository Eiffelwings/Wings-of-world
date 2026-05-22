import { defineSetupPluginEntry } from "mechanical-wings/plugin-sdk/core";
import { feishuPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(feishuPlugin);
