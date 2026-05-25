import { defineSetupPluginEntry } from "mechanical-wings/plugin-sdk/core";
import { googlechatPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(googlechatPlugin);
