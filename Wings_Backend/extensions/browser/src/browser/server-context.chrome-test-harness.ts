import { vi } from "vitest";
import { installChromeUserDataDirHooks } from "./chrome-user-data-dir.test-harness.js";

const chromeUserDataDir = { dir: "/tmp/mechanical-wings" };
installChromeUserDataDirHooks(chromeUserDataDir);

vi.mock("./chrome.js", () => ({
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchWingsChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  resolveWingsUserDataDir: vi.fn(() => chromeUserDataDir.dir),
  stopWingsChrome: vi.fn(async () => {}),
}));
