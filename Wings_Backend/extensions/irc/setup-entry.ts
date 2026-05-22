import { defineSetupPluginEntry } from "mechanical-wings/plugin-sdk/core";
import { ircPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(ircPlugin);
