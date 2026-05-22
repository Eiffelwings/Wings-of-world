import { defineSetupPluginEntry } from "mechanical-wings/plugin-sdk/core";
import { synologyChatPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(synologyChatPlugin);
