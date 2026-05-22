import { describe, expect, it } from "vitest";
import { formatBackupCreateSummary, type BackupCreateResult } from "./backup-create.js";

function makeResult(overrides: Partial<BackupCreateResult> = {}): BackupCreateResult {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    archiveRoot: "mechanical-wings-backup-2026-01-01",
    archivePath: "/tmp/mechanical-wings-backup.tar.gz",
    dryRun: false,
    includeWorkspace: true,
    onlyConfig: false,
    verified: false,
    assets: [],
    skipped: [],
    ...overrides,
  };
}

describe("formatBackupCreateSummary", () => {
  it("formats created archives with included and skipped paths", () => {
    const lines = formatBackupCreateSummary(
      makeResult({
        verified: true,
        assets: [
          {
            kind: "state",
            sourcePath: "/state",
            archivePath: "archive/state",
            displayPath: "~/.mechanical-wings",
          },
        ],
        skipped: [
          {
            kind: "workspace",
            sourcePath: "/workspace",
            displayPath: "~/Projects/mechanical-wings",
            reason: "covered",
            coveredBy: "~/.mechanical-wings",
          },
        ],
      }),
    );

    expect(lines).toEqual([
      "Backup archive: /tmp/mechanical-wings-backup.tar.gz",
      "Included 1 path:",
      "- state: ~/.mechanical-wings",
      "Skipped 1 path:",
      "- workspace: ~/Projects/mechanical-wings (covered by ~/.mechanical-wings)",
      "Created /tmp/mechanical-wings-backup.tar.gz",
      "Archive verification: passed",
    ]);
  });

  it("formats dry runs and pluralized counts", () => {
    const lines = formatBackupCreateSummary(
      makeResult({
        dryRun: true,
        assets: [
          {
            kind: "config",
            sourcePath: "/config",
            archivePath: "archive/config",
            displayPath: "~/.mechanical-wings/config.json",
          },
          {
            kind: "credentials",
            sourcePath: "/oauth",
            archivePath: "archive/oauth",
            displayPath: "~/.mechanical-wings/oauth",
          },
        ],
      }),
    );

    expect(lines).toEqual([
      "Backup archive: /tmp/mechanical-wings-backup.tar.gz",
      "Included 2 paths:",
      "- config: ~/.mechanical-wings/config.json",
      "- credentials: ~/.mechanical-wings/oauth",
      "Dry run only; archive was not written.",
    ]);
  });
});
