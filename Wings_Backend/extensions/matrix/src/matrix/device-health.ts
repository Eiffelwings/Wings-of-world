export type MatrixManagedDeviceInfo = {
  deviceId: string;
  displayName: string | null;
  current: boolean;
};

export type MatrixDeviceHealthSummary = {
  currentDeviceId: string | null;
  staleWingsDevices: MatrixManagedDeviceInfo[];
  currentWingsDevices: MatrixManagedDeviceInfo[];
};

const OPENCLAW_DEVICE_NAME_PREFIX = "Wings ";

export function isWingsManagedMatrixDevice(displayName: string | null | undefined): boolean {
  return displayName?.startsWith(OPENCLAW_DEVICE_NAME_PREFIX) === true;
}

export function summarizeMatrixDeviceHealth(
  devices: MatrixManagedDeviceInfo[],
): MatrixDeviceHealthSummary {
  const currentDeviceId = devices.find((device) => device.current)?.deviceId ?? null;
  const openClawDevices = devices.filter((device) =>
    isWingsManagedMatrixDevice(device.displayName),
  );
  return {
    currentDeviceId,
    staleWingsDevices: openClawDevices.filter((device) => !device.current),
    currentWingsDevices: openClawDevices.filter((device) => device.current),
  };
}
