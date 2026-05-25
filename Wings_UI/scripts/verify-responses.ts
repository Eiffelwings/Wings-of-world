import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const port = Number(process.env.WINGS_OF_WORLD_VERIFY_PORT || process.env.WINGS_VERIFY_PORT || 3011);
const model = process.env.OPENAI_MODEL || "gpt-5-codex";
const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const apiKey = process.env.OPENAI_API_KEY || "";

if (!apiKey.trim()) {
  console.error("OPENAI_API_KEY is required for verify:responses");
  process.exit(1);
}

const tempDataDir = mkdtempSync(path.join(os.tmpdir(), "wings-responses-"));
const baseApiUrl = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, ["dist/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    WINGS_OF_WORLD_DATA_DIR: tempDataDir,
    WINGS_DATA_DIR: tempDataDir,
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: baseURL,
    OPENAI_MODEL: model,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => {
  process.stdout.write(`[verify:responses] ${chunk}`);
});

server.stderr.on("data", (chunk) => {
  process.stderr.write(`[verify:responses] ${chunk}`);
});

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;

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
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  throw lastError instanceof Error ? lastError : new Error("Server did not become healthy in time.");
}

async function request<T>(pathname: string, init?: RequestInit): Promise<T> {
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
  return data as T;
}

async function run() {
  await waitForHealth();

  const chat = await request<{ content: string; sessionId: string }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [
        { role: "system", content: "You are a concise coding assistant." },
        { role: "user", content: "Reply with exactly: Wings Responses OK" },
      ],
      model,
    }),
  });

  if (!chat.content.trim()) {
    throw new Error("Chat response was empty.");
  }

  const workflow = await request<{ outputs: Record<string, string>; trace: string[] }>(
    "/api/workflow/execute",
    {
      method: "POST",
      body: JSON.stringify({
        workflowId: "verify-responses-workflow",
        workflowName: "Verify Responses Workflow",
        input: "Summarize this in four words",
        workflow: {
          nodes: [
            {
              id: "trigger",
              type: "trigger",
              data: { label: "Input", input: "" },
            },
            {
              id: "llm",
              type: "llm",
              data: {
                label: "LLM",
                prompt: "Respond in exactly four words.",
                model,
              },
            },
            {
              id: "output",
              type: "output",
              data: { label: "Output" },
            },
          ],
          edges: [
            { id: "edge-1", source: "trigger", target: "llm" },
            { id: "edge-2", source: "llm", target: "output" },
          ],
        },
      }),
    },
  );

  if (Object.keys(workflow.outputs).length === 0) {
    throw new Error("Workflow returned no outputs.");
  }

  const chatHistory = await request<{ entries: Array<{ id: string }> }>(
    "/api/executions?kind=chat&limit=1",
  );
  const workflowHistory = await request<{ entries: Array<{ id: string }> }>(
    "/api/executions?kind=workflow&limit=1",
  );

  const latestChatId = chatHistory.entries[0]?.id;
  const latestWorkflowId = workflowHistory.entries[0]?.id;
  if (!latestChatId || !latestWorkflowId) {
    throw new Error("Execution history was not populated.");
  }

  const chatArtifact = await request<{ artifact: { metadata?: Record<string, unknown> } }>(
    `/api/executions/${encodeURIComponent(latestChatId)}/artifact`,
  );
  const workflowArtifact = await request<{ artifact: { metadata?: Record<string, unknown> } }>(
    `/api/executions/${encodeURIComponent(latestWorkflowId)}/artifact`,
  );

  if (chatArtifact.artifact.metadata?.apiMode !== "responses") {
    throw new Error("Chat artifact did not record apiMode=responses.");
  }
  if (workflowArtifact.artifact.metadata?.apiMode !== "responses") {
    throw new Error("Workflow artifact did not record apiMode=responses.");
  }

  console.log("verify:responses passed");
  console.log(`chat session: ${chat.sessionId}`);
  console.log(`chat artifact apiMode: ${String(chatArtifact.artifact.metadata?.apiMode)}`);
  console.log(`workflow artifact apiMode: ${String(workflowArtifact.artifact.metadata?.apiMode)}`);
}

run()
  .catch((error) => {
    console.error(`verify:responses failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    rmSync(tempDataDir, { recursive: true, force: true });
  });
