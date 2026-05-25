import { describe, expect, it } from "vitest";
import {
  buildPublishedInstallScenarios,
  collectInstalledPackageErrors,
} from "../scripts/mechanical-wings-npm-postpublish-verify.ts";
import { BUNDLED_RUNTIME_SIDECAR_PATHS } from "../src/plugins/public-artifacts.js";

describe("buildPublishedInstallScenarios", () => {
  it("uses a single fresh scenario for plain stable releases", () => {
    expect(buildPublishedInstallScenarios("2026.3.23")).toEqual([
      {
        name: "fresh-exact",
        installSpecs: ["mechanical-wings@2026.3.23"],
        expectedVersion: "2026.3.23",
      },
    ]);
  });

  it("adds a stable-to-correction upgrade scenario for correction releases", () => {
    expect(buildPublishedInstallScenarios("2026.3.23-2")).toEqual([
      {
        name: "fresh-exact",
        installSpecs: ["mechanical-wings@2026.3.23-2"],
        expectedVersion: "2026.3.23-2",
      },
      {
        name: "upgrade-from-base-stable",
        installSpecs: ["mechanical-wings@2026.3.23", "mechanical-wings@2026.3.23-2"],
        expectedVersion: "2026.3.23-2",
      },
    ]);
  });
});

describe("collectInstalledPackageErrors", () => {
  it("flags version mismatches and missing runtime sidecars", () => {
    expect(
      collectInstalledPackageErrors({
        expectedVersion: "2026.3.23-2",
        installedVersion: "2026.3.23",
        packageRoot: "/tmp/empty-mechanical-wings",
      }),
    ).toEqual([
      "installed package version mismatch: expected 2026.3.23-2, found 2026.3.23.",
      ...BUNDLED_RUNTIME_SIDECAR_PATHS.map(
        (relativePath) =>
          `installed package is missing required bundled runtime sidecar: ${relativePath}`,
      ),
    ]);
  });
});
