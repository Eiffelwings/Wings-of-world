import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const WINDOWS_BASH_CANDIDATES = [
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "bash",
] as const;

const POSIX_BASH_CANDIDATES = ["/bin/bash", "bash"] as const;

function isUsableBash(candidate: string): boolean {
  if (candidate.includes("\\") && !existsSync(candidate)) {
    return false;
  }
  try {
    const output = execFileSync(candidate, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
    });
    return output.includes("GNU bash");
  } catch {
    return false;
  }
}

export function resolveUsableBash(): string | undefined {
  const candidates =
    process.platform === "win32" ? WINDOWS_BASH_CANDIDATES : POSIX_BASH_CANDIDATES;
  return candidates.find(isUsableBash);
}
