import type { MediaUnderstandingProvider } from "mechanical-wings/plugin-sdk/media-understanding";
import { transcribeDeepgramAudio } from "./audio.js";

export const deepgramMediaUnderstandingProvider: MediaUnderstandingProvider = {
  id: "deepgram",
  capabilities: ["audio"],
  transcribeAudio: transcribeDeepgramAudio,
};
