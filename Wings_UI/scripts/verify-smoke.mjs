import { mkdtempSync, rmSync } from "fs";
import os from "os";
import { createServer } from "http";
import path from "path";
import { spawn } from "child_process";

const port = Number(process.env.WINGS_OF_WORLD_VERIFY_PORT || process.env.WINGS_VERIFY_PORT || 3012);
const tempDataDir = mkdtempSync(path.join(os.tmpdir(), "wings-smoke-"));
const tempVaultDir = path.join(tempDataDir, "obsidian-disabled");
const baseApiUrl = `http://127.0.0.1:${port}`;
const mockModel = "wings-smoke-model";
const mockImageModel = "wings-smoke-image-model";
const onePixelPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function readJsonBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk.toString();
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const mockProvider = createServer(async (req, res) => {
  if (req.method === "POST" && req.url?.endsWith("/images/generations")) {
    const body = await readJsonBody(req);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      created: Math.floor(Date.now() / 1000),
      data: [
        {
          b64_json: onePixelPngBase64,
          revised_prompt: `Smoke image: ${String(body.prompt || "").slice(0, 120)}`,
        },
      ],
    }));
    return;
  }

  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Not found" } }));
    return;
  }

  const body = await readJsonBody(req);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUserMessage =
    [...messages].reverse().find((message) => message?.role === "user")?.content || "";
  const content = /reply with exactly:\s*smoke ok/i.test(lastUserMessage)
    ? "smoke ok"
    : `Mock provider response for: ${String(lastUserMessage || "workflow step").slice(0, 160)}`;
  const completionTokens = Math.max(1, Math.ceil(content.length / 4));

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    id: `chatcmpl-smoke-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model || mockModel,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content },
      },
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: completionTokens,
      total_tokens: 12 + completionTokens,
    },
  }));
});

await new Promise((resolve, reject) => {
  mockProvider.once("error", reject);
  mockProvider.listen(0, "127.0.0.1", () => {
    mockProvider.off("error", reject);
    resolve();
  });
});

const mockAddress = mockProvider.address();
if (!mockAddress || typeof mockAddress === "string") {
  throw new Error("Mock provider did not expose a TCP address.");
}
const mockBaseUrl = `http://127.0.0.1:${mockAddress.port}/v1`;

const server = spawn(process.execPath, ["dist/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    WINGS_OF_WORLD_DATA_DIR: tempDataDir,
    WINGS_DATA_DIR: tempDataDir,
    OPENAI_API_KEY: "wings-smoke-test-key",
    OPENAI_BASE_URL: mockBaseUrl,
    OPENAI_MODEL: mockModel,
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_ALLOWED_CHAT_IDS: "",
    OBSIDIAN_VAULT_PATH: tempVaultDir,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => {
  process.stdout.write(`[verify:smoke] ${chunk}`);
});

server.stderr.on("data", (chunk) => {
  process.stderr.write(`[verify:smoke] ${chunk}`);
});

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChildExit(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(timeoutMs),
  ]);
}

async function removeTempDirBestEffort(dir) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 200,
      });
      return;
    } catch (error) {
      if (attempt === 7) {
        console.warn(
          `[verify:smoke] cleanup skipped for ${dir}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
      await delay(250 * (attempt + 1));
    }
  }
}

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseApiUrl}/api/system/health`);
      if (response.ok) {
        return;
      }
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

async function run() {
  await waitForHealth();

  const health = await request("/api/system/health");
  assert(health.ok === true, "Health endpoint did not report ok=true.");

  const settings = await request("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      provider: "custom",
      apiKey: "wings-smoke-test-key",
      baseURL: mockBaseUrl,
      model: mockModel,
      fallbackEnabled: false,
    }),
  });
  assert(settings.baseURL === mockBaseUrl, "Smoke settings did not point to the mock provider.");

  const backend = await request("/api/backend/status");
  assert(typeof backend.gatewayUrl === "string" && backend.gatewayUrl, "Backend status did not include a gateway URL.");
  assert(typeof backend.canStart === "boolean", "Backend status did not include canStart.");
  assert(backend.cli?.startCommand, "Backend status did not include a start command.");

  const readiness = await request("/api/system/readiness");
  const workflowCheck = readiness.checks?.find((check) => check.id === "workflows");
  const humanTaskCheck = readiness.checks?.find((check) => check.id === "human-tasks");
  assert(workflowCheck?.status === "ready", "Workflow readiness is not ready.");
  assert(humanTaskCheck, "Human task readiness check is missing.");

  const workflows = await request("/api/workflows");
  assert(Array.isArray(workflows) && workflows.length > 0, "Workflow library is empty.");
  assert(
    workflows.some((workflow) => workflow.id === "starter-incident-triage"),
    "Starter workflow is missing.",
  );

  const tools = await request("/api/tools");
  assert(
    Array.isArray(tools.tools) &&
      tools.tools.some((tool) => tool.name === "calculator"),
    "Calculator tool is missing.",
  );

  const prompts = await request("/api/prompts");
  assert(
    Array.isArray(prompts.prompts) &&
      prompts.prompts.some((prompt) => prompt.id === "incident_triage"),
    "Incident triage prompt is missing.",
  );

  const resources = await request("/api/resources");
  assert(
    Array.isArray(resources.resources) &&
      resources.resources.some((resource) => resource.uri === "wings://human/tasks"),
    "Human task resource is missing.",
  );

  const skills = await request("/api/skills");
  assert(
    Array.isArray(skills.skills) &&
      skills.skills.some((skill) => skill.id === "operator"),
    "Operator skill is missing.",
  );

  const createdTask = await request("/api/human-tasks", {
    method: "POST",
    body: JSON.stringify({
      title: "Smoke test manual approval",
      details: "Created by verify:smoke",
      priority: "high",
      source: "verify:smoke",
    }),
  });
  assert(createdTask.task?.id, "Human task creation did not return a task.");

  const updatedTask = await request(`/api/human-tasks/${encodeURIComponent(createdTask.task.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "done",
      owner: "verify:smoke",
    }),
  });
  assert(updatedTask.task?.status === "done", "Human task status did not update.");

  await request(`/api/human-tasks/${encodeURIComponent(createdTask.task.id)}`, {
    method: "DELETE",
  });

  const taskList = await request("/api/human-tasks");
  assert(
    Array.isArray(taskList.tasks) &&
      !taskList.tasks.some((task) => task.id === createdTask.task.id),
    "Human task was not deleted.",
  );

  const memory = await request("/api/memory", {
    method: "POST",
    body: JSON.stringify({
      content: "Smoke verification note",
      memoryType: "context",
      source: "verify:smoke",
      importanceScore: 0.9,
    }),
  });
  assert(memory.memory?.id, "Memory creation failed.");

  const memoryContext = await request("/api/memory/context?q=smoke");
  assert(
    Array.isArray(memoryContext.memories) && memoryContext.memories.length > 0,
    "Memory context retrieval returned nothing.",
  );

  const chat = await request("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [
        { role: "system", content: "You are a concise operations assistant." },
        { role: "user", content: "Reply with exactly: smoke ok" },
      ],
      skillIds: ["operator"],
      resourceUris: ["wings://system/health"],
    }),
  });
  assert(typeof chat.content === "string" && chat.content.trim(), "Chat returned empty content.");
  assert(
    Array.isArray(chat.appliedSkills) &&
      chat.appliedSkills.some((skill) => skill.id === "operator"),
    "Chat did not apply the operator skill.",
  );
  assert(
    Array.isArray(chat.appliedResources) &&
      chat.appliedResources.some((resource) => resource.uri === "wings://system/health"),
    "Chat did not apply system health resource context.",
  );

  const workflow = await request("/api/workflow/execute", {
    method: "POST",
    body: JSON.stringify({
      workflowId: "verify-smoke-workflow",
      workflowName: "Verify Smoke Workflow",
      input: "API latency spike",
      workflow: workflows.find((entry) => entry.id === "starter-incident-triage"),
    }),
  });
  assert(
    workflow.outputs && Object.keys(workflow.outputs).length > 0,
    "Workflow execution returned no outputs.",
  );

  const toolRun = await request("/api/tools/execute", {
    method: "POST",
    body: JSON.stringify({
      name: "calculator",
      args: { expression: "6*7" },
    }),
  });
  assert(toolRun.result?.result === 42, "Calculator tool did not return 42.");

  const imageRun = await request("/api/images/generate", {
    method: "POST",
    body: JSON.stringify({
      prompt: "A crisp product-style smoke test icon for Wings Of World",
      model: mockImageModel,
      size: "1024x1024",
      quality: "auto",
    }),
  });
  assert(imageRun.ok === true, "Image generation endpoint did not return ok=true.");
  assert(imageRun.image?.filename?.startsWith("img_"), "Image generation did not return a generated filename.");
  assert(imageRun.image?.mimeType === "image/png", "Image generation did not persist PNG metadata.");

  const imageLibrary = await request("/api/images");
  assert(
    Array.isArray(imageLibrary.images) &&
      imageLibrary.images.some((image) => image.id === imageRun.image.id),
    "Generated image was not listed in the image library.",
  );

  const imageFile = await fetch(`${baseApiUrl}${imageRun.image.url}`);
  assert(imageFile.ok, "Generated image file could not be fetched.");
  assert(
    imageFile.headers.get("content-type")?.startsWith("image/png"),
    "Generated image file did not return image/png content.",
  );
  assert((await imageFile.arrayBuffer()).byteLength > 0, "Generated image file was empty.");

  let protectedReadBlocked = false;
  try {
    await request("/api/tools/execute", {
      method: "POST",
      body: JSON.stringify({
        name: "read_file",
        args: { path: path.join(process.cwd(), ".env.local") },
      }),
    });
  } catch (error) {
    protectedReadBlocked = true;
  }
  assert(protectedReadBlocked, "Protected secret files were not blocked from tool access.");

  console.log("verify:smoke passed");
}

run()
  .catch((error) => {
    console.error(`verify:smoke failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    server.kill();
    await waitForChildExit(server);
    await new Promise((resolve) => mockProvider.close(resolve));
    await removeTempDirBestEffort(tempDataDir);
  });
