import { defineSetupPluginEntry } from "mechanical-wings/plugin-sdk/core";
import { nostrPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(nostrPlugin);
