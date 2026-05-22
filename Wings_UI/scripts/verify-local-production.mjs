import fs from "fs";
import { spawn } from "child_process";

const checks = [
  { label: "dependency audit", command: "pnpm", args: ["audit", "--prod"] },
  { label: "type check", command: "pnpm", args: ["check"] },
  { label: "unit tests", command: "pnpm", args: ["test"] },
  { label: "production build", command: "pnpm", args: ["build"] },
  { label: "auth verification", command: "pnpm", args: ["verify:auth"] },
  { label: "telegram verification", command: "pnpm", args: ["verify:telegram"] },
  { label: "smoke verification", command: "pnpm", args: ["verify:smoke"] },
  { label: "browser verification", command: "pnpm", args: ["verify:browser"], env: { CI: "1" } },
  {
    label: "release verification",
    command: "pnpm",
    args: ["verify:release"],
    env: { WINGS_OF_WORLD_SKIP_BROWSER_VERIFY: "1" },
  },
];

function resolveCommand(command, args) {
  const npmExecPath = process.env.npm_execpath;
  if (command === "pnpm" && npmExecPath && fs.existsSync(npmExecPath)) {
    return { command: process.execPath, args: [npmExecPath, ...args] };
  }
  if (process.platform === "win32" && command === "pnpm") {
    return { command: "pnpm.cmd", args };
  }
  return { command, args };
}

function runCheck(check) {
  const resolved = resolveCommand(check.command, check.args);
  const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(resolved.command);
  console.log(`\n[verify:local] ${check.label}: ${check.command} ${check.args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(resolved.command, resolved.args, {
      cwd: process.cwd(),
      env: { ...process.env, ...(check.env || {}) },
      stdio: "inherit",
      shell: needsShell,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${check.label} failed with exit code ${code}`));
    });
  });
}

for (const check of checks) {
  await runCheck(check);
}

console.log("\nverify:local passed");
