import { mkdtempSync, rmSync } from "fs";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const port = Number(process.env.WINGS_OF_WORLD_VERIFY_PORT || process.env.WINGS_VERIFY_PORT || 3013);
const tempDataDir = mkdtempSync(path.join(os.tmpdir(), "wings-telegram-"));
const tempVaultDir = path.join(tempDataDir, "obsidian-vault");
const tempProjectsRoot = path.join(tempDataDir, "projects-root");
const baseApiUrl = `http://127.0.0.1:${port}`;

fs.mkdirSync(tempVaultDir, { recursive: true });
fs.mkdirSync(tempProjectsRoot, { recursive: true });

const server = spawn(process.execPath, ["dist/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    WINGS_OF_WORLD_DATA_DIR: tempDataDir,
    WINGS_DATA_DIR: tempDataDir,
    OBSIDIAN_VAULT_PATH: tempVaultDir,
    WINGS_OF_WORLD_PROJECTS_ROOT: tempProjectsRoot,
    WINGS_PROJECTS_ROOT: tempProjectsRoot,
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_ALLOWED_CHAT_IDS: "101,303,404,505",
    WINGS_OF_WORLD_ENABLE_TEST_ROUTES: "1",
    WINGS_ENABLE_TEST_ROUTES: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => {
  process.stdout.write(`[verify:telegram] ${chunk}`);
});

server.stderr.on("data", (chunk) => {
  process.stderr.write(`[verify:telegram] ${chunk}`);
});

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseApiUrl}/api/system/health`);
      if (response.ok) return;
      lastError = new Error(`Health check failed: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(800);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Server did not become healthy in time.");
}

async function request(pathname, init) {
  const response = await fetch(`${baseApiUrl}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.error || `${response.status} ${response.statusText}`);
  }
  return data;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function simulate(chatId, text, extra = {}) {
  return request("/api/test/telegram/simulate", {
    method: "POST",
    body: JSON.stringify({
      message: {
        message_id: Date.now(),
        text,
        chat: { id: chatId, type: "private" },
        from: { id: chatId, username: `user${chatId}`, first_name: `User${chatId}` },
        ...extra,
      },
    }),
  });
}

async function run() {
  await waitForHealth();

  const start = await simulate(101, "/start");
  assert(start.outbound?.[0]?.text?.includes("Wings Of World is connected"), "/start did not reply correctly.");
  assert(start.outbound?.[0]?.replyMarkup?.keyboard?.length > 0, "/start did not return keyboard.");

  const remember = await simulate(101, "/remember release fallback is ready");
  assert(remember.outbound?.[0]?.text?.includes("Saved to memory"), "/remember did not save memory.");
  assert(
    Array.isArray(remember.memories) &&
      remember.memories.some((entry) => String(entry.content).includes("release fallback is ready")),
    "/remember did not persist memory.",
  );

  const find = await simulate(101, "/find release fallback");
  assert(find.outbound?.[0]?.text?.includes("Top memory matches"), "/find did not return matches.");

  const todo = await simulate(101, "/todo Restart the VPN gateway");
  const taskId = todo.outbound?.[0]?.text?.split("\n")[1];
  assert(taskId, "/todo did not return a task id.");
  assert(
    Array.isArray(todo.humanTasks) && todo.humanTasks.some((task) => task.id === taskId),
    "/todo did not persist human task.",
  );

  const tasks = await simulate(101, "/tasks");
  assert(tasks.outbound?.[0]?.text?.includes(taskId), "/tasks did not include the created task.");

  const done = await simulate(101, `/done ${taskId}`);
  assert(done.outbound?.[0]?.text?.includes("Marked human task done"), "/done did not confirm completion.");
  assert(
    Array.isArray(done.humanTasks) &&
      done.humanTasks.some((task) => task.id === taskId && task.status === "done"),
    "/done did not update task status.",
  );

  const projectPlan = await simulate(
    404,
    "/project plan name=CRM-System | stack=Next.js + Node | features=auth,dashboard | notes=telegram owned",
  );
  const projectPlanText = projectPlan.outbound?.[0]?.text || "";
  const projectIdMatch = projectPlanText.match(/Project request (prj_[a-z0-9_]+)/i);
  const projectId = projectIdMatch?.[1];
  assert(projectPlanText.includes("Nothing has been created yet"), "/project plan did not stay in draft mode.");
  assert(projectId, "/project plan did not return a project request id.");

  const projectStatus = await simulate(404, `/project status ${projectId}`);
  assert(projectStatus.outbound?.[0]?.text?.includes("Status: draft"), "/project status did not show draft status.");

  const projectApprove = await simulate(404, `/project approve ${projectId}`);
  assert(projectApprove.outbound?.[0]?.text?.includes("Status: created"), "/project approve did not create the project.");
  assert(projectApprove.outbound?.[0]?.text?.includes("Created files:"), "/project approve did not return created file count.");
  assert(
    Array.isArray(projectApprove.projectRequests) &&
      projectApprove.projectRequests.some((entry) => entry.id === projectId && entry.status === "created"),
    "/project approve did not persist created status.",
  );

  const projectRoot = path.join(tempProjectsRoot, "crm-system");
  assert(fs.existsSync(path.join(projectRoot, "README.md")), "Project README was not created.");
  assert(fs.existsSync(path.join(projectRoot, "docs", "PROJECT-BRIEF.md")), "Project brief was not created.");
  assert(fs.existsSync(path.join(projectRoot, "docs", "BACKLOG.md")), "Project backlog was not created.");
  assert(fs.existsSync(path.join(projectRoot, "docs", "ARCHITECTURE.md")), "Project architecture note was not created.");
  assert(
    fs.existsSync(path.join(tempVaultDir, "Projects", "AI-System", "Projects", "crm-system.md")),
    "Obsidian project note was not created.",
  );

  const skill = await simulate(404, "/skill operator");
  assert(skill.outbound?.[0]?.text?.includes("Updated Telegram chat skills"), "/skill did not update chat skills.");
  assert(
    Array.isArray(skill.telegramState?.chats) &&
      skill.telegramState.chats.some((chat) => String(chat.chatId) === "404" && chat.activeSkillIds?.includes("operator")),
    "/skill did not persist active skill ids.",
  );

  const unknown = await simulate(505, "/doesnotexist");
  assert(unknown.outbound?.[0]?.text?.includes("Unknown command"), "Unknown command did not produce guidance.");

  const disallowed = await request("/api/test/telegram/simulate", {
    method: "POST",
    body: JSON.stringify({
      message: {
        message_id: Date.now(),
        text: "/status",
        chat: { id: 202, type: "private" },
        from: { id: 202, username: "user202", first_name: "User202" },
      },
    }),
  });
  assert(disallowed.outbound?.[0]?.text?.includes("not allowed"), "Disallowed chat was not blocked.");

  const oversize = await simulate(404, `/remember ${"x".repeat(1200)}`);
  assert(oversize.outbound?.[0]?.text?.includes("arguments are too long"), "Oversize command was not rejected.");

  let rateLimited = false;
  for (let index = 0; index < 7; index += 1) {
    const result = await simulate(303, "/status");
    if (result.outbound?.[0]?.text?.includes("Too many Telegram messages")) {
      rateLimited = true;
      break;
    }
  }
  assert(rateLimited, "Telegram rate limit did not trigger.");

  const chat = await simulate(505, "Reply in exactly two words.");
  assert(typeof chat.outbound?.[0]?.text === "string" && chat.outbound[0].text.trim(), "Normal Telegram chat returned empty output.");

  console.log("verify:telegram passed");
}

run()
  .catch((error) => {
    console.error(`verify:telegram failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    server.kill();
    await delay(500);
    rmSync(tempDataDir, { recursive: true, force: true });
  });
