import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const readCliBannerTaglineModeMock = vi.fn();

vi.mock("./banner-config-lite.js", () => ({
  readCliBannerTaglineMode: readCliBannerTaglineModeMock,
}));

let formatCliBannerLine: typeof import("./banner.js").formatCliBannerLine;
let DEFAULT_TAGLINE: typeof import("./tagline.js").DEFAULT_TAGLINE;

beforeAll(async () => {
  ({ formatCliBannerLine } = await import("./banner.js"));
  ({ DEFAULT_TAGLINE } = await import("./tagline.js"));
});

beforeEach(() => {
  readCliBannerTaglineModeMock.mockReset();
  readCliBannerTaglineModeMock.mockReturnValue(undefined);
});

describe("formatCliBannerLine", () => {
  it("hides tagline text when cli.banner.taglineMode is off", () => {
    readCliBannerTaglineModeMock.mockReturnValue("off");

    const line = formatCliBannerLine("2026.3.7", {
      commit: "abc1234",
      richTty: false,
    });

    expect(line).toBe("Wings🪽 2026.3.7 (abc1234)");
  });

  it("uses default tagline when cli.banner.taglineMode is default", () => {
    readCliBannerTaglineModeMock.mockReturnValue("default");

    const line = formatCliBannerLine("2026.3.7", {
      commit: "abc1234",
      richTty: false,
    });

    expect(line).toBe(`Wings🪽 2026.3.7 (abc1234) — ${DEFAULT_TAGLINE}`);
  });

  it("prefers explicit tagline mode over config", () => {
    readCliBannerTaglineModeMock.mockReturnValue("off");

    const line = formatCliBannerLine("2026.3.7", {
      commit: "abc1234",
      richTty: false,
      mode: "default",
    });

    expect(line).toBe(`Wings🪽 2026.3.7 (abc1234) — ${DEFAULT_TAGLINE}`);
  });
});
