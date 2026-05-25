import { describe, expect, it } from "vitest";
import { buildPlatformRuntimeLogHints, buildPlatformServiceStartHints } from "./runtime-hints.js";

describe("buildPlatformRuntimeLogHints", () => {
  it("renders launchd log hints on darwin", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "darwin",
        env: {
          OPENCLAW_STATE_DIR: "/tmp/mechanical-wings-state",
          OPENCLAW_LOG_PREFIX: "gateway",
        },
        systemdServiceName: "mechanical-wings-gateway",
        windowsTaskName: "Wings Gateway",
      }),
    ).toEqual([
      "Launchd stdout (if installed): /tmp/mechanical-wings-state/logs/gateway.log",
      "Launchd stderr (if installed): /tmp/mechanical-wings-state/logs/gateway.err.log",
    ]);
  });

  it("renders systemd and windows hints by platform", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "linux",
        systemdServiceName: "mechanical-wings-gateway",
        windowsTaskName: "Wings Gateway",
      }),
    ).toEqual(["Logs: journalctl --user -u mechanical-wings-gateway.service -n 200 --no-pager"]);
    expect(
      buildPlatformRuntimeLogHints({
        platform: "win32",
        systemdServiceName: "mechanical-wings-gateway",
        windowsTaskName: "Wings Gateway",
      }),
    ).toEqual(['Logs: schtasks /Query /TN "Wings Gateway" /V /FO LIST']);
  });
});

describe("buildPlatformServiceStartHints", () => {
  it("builds platform-specific service start hints", () => {
    expect(
      buildPlatformServiceStartHints({
        platform: "darwin",
        installCommand: "mechanical-wings gateway install",
        startCommand: "mechanical-wings gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.mechanical-wings.gateway.plist",
        systemdServiceName: "mechanical-wings-gateway",
        windowsTaskName: "Wings Gateway",
      }),
    ).toEqual([
      "mechanical-wings gateway install",
      "mechanical-wings gateway",
      "launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.mechanical-wings.gateway.plist",
    ]);
    expect(
      buildPlatformServiceStartHints({
        platform: "linux",
        installCommand: "mechanical-wings gateway install",
        startCommand: "mechanical-wings gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.mechanical-wings.gateway.plist",
        systemdServiceName: "mechanical-wings-gateway",
        windowsTaskName: "Wings Gateway",
      }),
    ).toEqual([
      "mechanical-wings gateway install",
      "mechanical-wings gateway",
      "systemctl --user start mechanical-wings-gateway.service",
    ]);
  });
});
