import { describe, expect, it } from "vitest";
import { isWingsManagedMatrixDevice, summarizeMatrixDeviceHealth } from "./device-health.js";

describe("matrix device health", () => {
  it("detects Wings-managed device names", () => {
    expect(isWingsManagedMatrixDevice("Wings Gateway")).toBe(true);
    expect(isWingsManagedMatrixDevice("Wings Debug")).toBe(true);
    expect(isWingsManagedMatrixDevice("Element iPhone")).toBe(false);
    expect(isWingsManagedMatrixDevice(null)).toBe(false);
  });

  it("summarizes stale Wings-managed devices separately from the current device", () => {
    const summary = summarizeMatrixDeviceHealth([
      {
        deviceId: "du314Zpw3A",
        displayName: "Wings Gateway",
        current: true,
      },
      {
        deviceId: "BritdXC6iL",
        displayName: "Wings Gateway",
        current: false,
      },
      {
        deviceId: "G6NJU9cTgs",
        displayName: "Wings Debug",
        current: false,
      },
      {
        deviceId: "phone123",
        displayName: "Element iPhone",
        current: false,
      },
    ]);

    expect(summary.currentDeviceId).toBe("du314Zpw3A");
    expect(summary.currentWingsDevices).toEqual([
      expect.objectContaining({ deviceId: "du314Zpw3A" }),
    ]);
    expect(summary.staleWingsDevices).toEqual([
      expect.objectContaining({ deviceId: "BritdXC6iL" }),
      expect.objectContaining({ deviceId: "G6NJU9cTgs" }),
    ]);
  });
});
