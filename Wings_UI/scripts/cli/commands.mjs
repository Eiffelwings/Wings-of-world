import readline from "readline";
import { WingsClient, color, formatTokenUsage, formatTable, shortenText } from "./client.mjs";

function ensureServer(client) {
  return client.ping().then((ok) => {
    if (!ok) {
      console.error(color("red", "Wings Of World server is not reachable."));
      console.error(color("dim", `Tried ${client.baseUrl}. Start it with: wings-of-world dev (legacy alias: wings dev)`));
      console.error(color("dim", "Override with WINGS_OF_WORLD_API_BASE=http://host:port"));
      process.exit(1);
    }
  });
}

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function getPrompt(positional) {
  const fromArgs = positional.join(" ").trim();
  if (fromArgs) return fromArgs;
  const fromStdin = (await readStdin()).trim();
  if (fromStdin) return fromStdin;
  return "";
}

// ── chat ────────────────────────────────────────────────────────────────
export async function cmdChat(argv) {
  const { flags, positional } = parseFlags(argv);
  const client = new WingsClient(flags.host);
  await ensureServer(client);
  const prompt = await getPrompt(positional);
  if (!prompt) {
    console.error(color("red", "Usage: wings-of-world chat <message>  (or pipe via stdin)"));
    process.exit(1);
  }
  const messages = [{ role: "user", content: prompt }];

  if (flags.stream) {
    process.stdout.write(color("cyan", "› "));
    await client.streamChat({
      messages,
      model: flags.model,
      onDelta: (text) => process.stdout.write(text),
    });
    process.stdout.write("\n");
    return;
  }

  const result = await client.chat({
    messages,
    sessionId: flags.session,
    model: flags.model,
    skillIds: flags.skills ? String(flags.skills).split(",") : undefined,
  });
  console.log(color("cyan", "› ") + result.content);
  if (flags.verbose) {
    console.log("");
    console.log(color("dim", `tokens   ${formatTokenUsage(result.tokenUsage)}`));
    console.log(color("dim", `model    ${result.providerMeta?.model || ""}`));
    console.log(color("dim", `session  ${result.sessionId || ""}`));
    if (typeof result.runCostEstimateUsd === "number") {
      console.log(color("dim", `cost     $${result.runCostEstimateUsd.toFixed(6)}`));
    }
  }
}

// ── agent (tool-using) ──────────────────────────────────────────────────
export async function cmdAgent(argv) {
  const { flags, positional } = parseFlags(argv);
  const client = new WingsClient(flags.host);
  await ensureServer(client);
  const prompt = await getPrompt(positional);
  if (!prompt) {
    console.error(color("red", "Usage: wings-of-world agent <prompt>  (or pipe via stdin)"));
    process.exit(1);
  }
  const result = await client.agent({
    messages: [{ role: "user", content: prompt }],
    model: flags.model,
  });
  if (flags.trace || flags.verbose) {
    for (const step of result.trace || []) {
      if (step.type === "tool_call") {
        console.log(color("yellow", `→ ${step.name}(${JSON.stringify(step.arguments).slice(0, 120)})`));
      } else if (step.type === "tool_result") {
        const summary = step.error
          ? color("red", `× ${step.name}: ${step.error}`)
          : color("green", `✓ ${step.name} (${step.tookMs ?? 0}ms)`);
        console.log(summary);
      }
    }
    if ((result.trace || []).length > 0) console.log("");
  }
  console.log(color("cyan", "› ") + result.content);
  if (flags.verbose) {
    console.log("");
    console.log(color("dim", `tokens   ${formatTokenUsage(result.tokenUsage)}`));
    console.log(color("dim", `steps    ${(result.trace || []).filter((t) => t.type === "tool_call").length}`));
  }
}

// ── interactive REPL ────────────────────────────────────────────────────
export async function cmdRepl(argv) {
  const { flags } = parseFlags(argv);
  const client = new WingsClient(flags.host);
  await ensureServer(client);
  const useAgent = Boolean(flags.agent);
  const stream = !useAgent && flags.stream !== false;

  console.log(color("cyan", "Wings Of World REPL") + color("dim", `  (${useAgent ? "agent" : "chat"} mode)`));
  console.log(color("dim", "Type a message and press Enter. /help for commands. /exit to quit."));
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const messages = [];
  let sessionId;

  const ask = () => new Promise((resolve) => rl.question(color("magenta", "you › "), resolve));

  while (true) {
    const input = (await ask()).trim();
    if (!input) continue;

    if (input.startsWith("/")) {
      const [cmd, ...rest] = input.slice(1).split(/\s+/);
      const arg = rest.join(" ");
      if (cmd === "exit" || cmd === "quit") break;
      if (cmd === "clear") { messages.length = 0; sessionId = undefined; console.log(color("dim", "context cleared")); continue; }
      if (cmd === "agent") { console.log(color("dim", `agent mode: ${useAgent ? "off" : "on"} requires restart with --agent`)); continue; }
      if (cmd === "memory") {
        if (!arg) { console.log(color("dim", "/memory <text>")); continue; }
        const entry = await client.addMemory(arg);
        console.log(color("green", `✓ saved as ${entry.entry?.id || "?"}`));
        continue;
      }
      if (cmd === "search") {
        if (!arg) { console.log(color("dim", "/search <query>")); continue; }
        const r = await client.searchMemory(arg, 5);
        for (const hit of r.results || []) {
          console.log(color("dim", `(${hit.score.toFixed(2)})`) + " " + shortenText(hit.text, 100));
        }
        continue;
      }
      if (cmd === "help") {
        console.log("  /memory <text>   Save text to vector memory");
        console.log("  /search <query>  Search vector memory");
        console.log("  /clear           Clear conversation context");
        console.log("  /exit            Quit the REPL");
        continue;
      }
      console.log(color("yellow", `unknown: /${cmd}`));
      continue;
    }

    messages.push({ role: "user", content: input });
    try {
      if (useAgent) {
        const r = await client.agent({ messages, model: flags.model });
        console.log(color("cyan", "ai › ") + r.content);
        messages.push({ role: "assistant", content: r.content });
      } else if (stream) {
        process.stdout.write(color("cyan", "ai › "));
        const full = await client.streamChat({
          messages,
          model: flags.model,
          onDelta: (t) => process.stdout.write(t),
        });
        process.stdout.write("\n");
        messages.push({ role: "assistant", content: full });
      } else {
        const r = await client.chat({ messages, sessionId, model: flags.model });
        sessionId = r.sessionId;
        console.log(color("cyan", "ai › ") + r.content);
        messages.push({ role: "assistant", content: r.content });
      }
    } catch (err) {
      console.error(color("red", err?.message || String(err)));
    }
  }
  rl.close();
}

// ── memory ──────────────────────────────────────────────────────────────
export async function cmdMemory(argv) {
  const [sub, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "list" || !sub) {
    const r = await client.listMemory();
    const entries = r.entries || [];
    console.log(formatTable(entries, [
      { label: "ID", value: (e) => e.id },
      { label: "Created", value: (e) => e.createdAt?.slice(0, 19) || "" },
      { label: "Text", value: (e) => shortenText(e.text, 70) },
    ]));
    return;
  }
  if (sub === "add") {
    const text = await getPrompt(positional);
    if (!text) { console.error(color("red", "Provide text via args or stdin")); process.exit(1); }
    const r = await client.addMemory(text);
    console.log(color("green", `✓ saved ${r.entry?.id}`));
    return;
  }
  if (sub === "search") {
    const query = positional.join(" ").trim();
    if (!query) { console.error(color("red", "wings-of-world memory search <query>")); process.exit(1); }
    const r = await client.searchMemory(query, Number(flags.top) || 5);
    for (const hit of r.results || []) {
      console.log(color("dim", `(${hit.score.toFixed(2)})`) + " " + color("bold", hit.id));
      console.log("  " + shortenText(hit.text, 200));
    }
    return;
  }
  if (sub === "delete" || sub === "rm") {
    const id = positional[0];
    if (!id) { console.error(color("red", "wings-of-world memory delete <id>")); process.exit(1); }
    await client.deleteMemory(id);
    console.log(color("green", `✓ deleted ${id}`));
    return;
  }
  if (sub === "consolidate") {
    const dryRun = flags.execute ? false : true; // safe default — dry run unless --execute
    const payload = {
      dryRun,
      similarityThreshold: flags.threshold ? Number(flags.threshold) : undefined,
      minClusterSize: flags["min-cluster"] ? Number(flags["min-cluster"]) : undefined,
      dropAfterDays: flags["drop-days"] ? Number(flags["drop-days"]) : undefined,
      dropImportanceBelow: flags["drop-importance"] ? Number(flags["drop-importance"]) : undefined,
    };
    if (dryRun) console.log(color("dim", "Running dry-run (use --execute to apply changes)…"));
    const r = await client.memoryConsolidate(payload);
    if (r.message) {
      console.log(color("dim", r.message));
      return;
    }
    const tag = r.dryRun ? color("yellow", "[DRY-RUN]") : color("green", "[EXECUTED]");
    console.log(color("bold", `${tag} consolidation run ${r.runId} (${r.durationMs}ms)`));
    console.log(`  total before     ${r.plan.totalEntries}`);
    console.log(`  reduced to       ${r.plan.reducedEntries}`);
    console.log(`  clusters         ${r.plan.clusters.length}`);
    console.log(`  drops            ${r.plan.drops.length}`);
    console.log(color("green", `  est. saving      ${r.plan.estimatedSavingChars.toLocaleString()} chars`));
    if (flags.verbose) {
      for (const c of r.plan.clusters) {
        console.log("");
        console.log(color("dim", `  cluster ${c.clusterId} avg-sim=${c.averageSimilarity}, ${c.memberIds.length} members`));
        for (const id of c.memberIds) console.log(color("dim", `    - ${id}${id === c.representativeId ? " (rep)" : ""}`));
      }
      for (const d of r.plan.drops) console.log(color("yellow", `  drop ${d.id} — ${d.reason}`));
    }
    return;
  }
  if (sub === "consolidation" || sub === "history") {
    const r = await client.memoryConsolidationHistory(Number(flags.limit) || 30);
    console.log(formatTable(r.runs || [], [
      { label: "Run", value: (r) => r.id },
      { label: "When", value: (r) => r.createdAt.slice(0, 19) },
      { label: "Mode", value: (r) => r.dryRun ? "dry" : "exec" },
      { label: "Before→After", value: (r) => `${r.totalBefore} → ${r.totalAfter}` },
      { label: "Merged", value: (r) => r.clustersMerged },
      { label: "Dropped", value: (r) => r.entriesDropped },
      { label: "Dur ms", value: (r) => r.durationMs },
    ]));
    return;
  }
  console.error(color("red", `Unknown subcommand: memory ${sub}`));
  console.error(color("dim", "Try: list | add <text> | search <query> | delete <id> | consolidate [--execute] | history"));
  process.exit(1);
}

// ── tools ───────────────────────────────────────────────────────────────
export async function cmdTools(argv) {
  const [sub, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "list" || !sub) {
    const r = await client.listTools();
    const tools = r.tools || [];
    console.log(formatTable(tools, [
      { label: "Name", value: (t) => t.name },
      { label: "Confirm", value: (t) => t.requiresConfirmation ? "yes" : "no" },
      { label: "Description", value: (t) => shortenText(t.description, 70) },
    ]));
    return;
  }
  if (sub === "exec" || sub === "run") {
    const name = positional[0];
    if (!name) { console.error(color("red", "wings-of-world tools exec <name> [--args '<json>']")); process.exit(1); }
    let args = {};
    if (flags.args) {
      try { args = JSON.parse(String(flags.args)); }
      catch { console.error(color("red", "--args must be valid JSON")); process.exit(1); }
    }
    const r = await client.executeTool(name, args);
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  console.error(color("red", `Unknown subcommand: tools ${sub}`));
  process.exit(1);
}

// ── tasks ───────────────────────────────────────────────────────────────
export async function cmdTasks(argv) {
  const [sub, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "list" || !sub) {
    const r = await client.listTasks();
    const tasks = r.tasks || [];
    console.log(formatTable(tasks, [
      { label: "ID", value: (t) => t.id },
      { label: "Name", value: (t) => t.name },
      { label: "Kind", value: (t) => t.kind },
      { label: "Every", value: (t) => `${Math.round((t.intervalMs || 0) / 1000)}s` },
      { label: "Enabled", value: (t) => t.enabled ? "yes" : "no" },
      { label: "Last", value: (t) => t.lastStatus || "—" },
    ]));
    return;
  }
  if (sub === "add") {
    const kind = flags.kind === "webhook" ? "webhook" : "chat";
    const body = {
      name: flags.name || "CLI task",
      kind,
      intervalMs: Number(flags.every) || 60_000,
      prompt: kind === "chat" ? (positional.join(" ").trim() || flags.prompt) : undefined,
      webhookUrl: kind === "webhook" ? flags.url : undefined,
      enabled: flags.disabled ? false : true,
    };
    const r = await client.addTask(body);
    console.log(color("green", `✓ created ${r.task?.id}`));
    return;
  }
  if (sub === "run") {
    const id = positional[0];
    if (!id) { console.error(color("red", "wings-of-world tasks run <id>")); process.exit(1); }
    const r = await client.runTask(id);
    console.log(color("dim", JSON.stringify(r.outcome, null, 2)));
    return;
  }
  if (sub === "delete" || sub === "rm") {
    const id = positional[0];
    if (!id) { console.error(color("red", "wings-of-world tasks delete <id>")); process.exit(1); }
    await client.deleteTask(id);
    console.log(color("green", `✓ deleted ${id}`));
    return;
  }
  if (sub === "enable" || sub === "disable") {
    const id = positional[0];
    if (!id) { console.error(color("red", `wings-of-world tasks ${sub} <id>`)); process.exit(1); }
    await client.updateTask(id, { enabled: sub === "enable" });
    console.log(color("green", `✓ ${sub}d ${id}`));
    return;
  }
  console.error(color("red", `Unknown subcommand: tasks ${sub}`));
  process.exit(1);
}

// ── webhooks ────────────────────────────────────────────────────────────
export async function cmdWebhooks(argv) {
  const [sub, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "list" || !sub) {
    const r = await client.listWebhooks();
    const hooks = r.webhooks || [];
    console.log(formatTable(hooks, [
      { label: "ID", value: (h) => h.id },
      { label: "Name", value: (h) => h.name },
      { label: "Secret", value: (h) => h.secretMasked },
      { label: "Created", value: (h) => h.createdAt?.slice(0, 19) || "" },
    ]));
    return;
  }
  if (sub === "add") {
    const r = await client.addWebhook({
      name: flags.name || positional.join(" ") || "CLI webhook",
      forwardToPrompt: flags.forward,
    });
    console.log(color("green", `✓ created ${r.webhook.id}`));
    console.log(color("dim", `secret: ${r.webhook.secret}`));
    console.log(color("dim", "Sign payload with HMAC-SHA256 -> send X-Wings-Of-World-Signature header"));
    return;
  }
  if (sub === "events") {
    const r = await client.listWebhookEvents();
    const events = r.events || [];
    console.log(formatTable(events, [
      { label: "ID", value: (e) => e.id },
      { label: "Hook", value: (e) => e.webhookId },
      { label: "Received", value: (e) => e.receivedAt?.slice(0, 19) || "" },
      { label: "Valid", value: (e) => e.signatureValid ? "yes" : "no" },
      { label: "Summary", value: (e) => shortenText(e.processedSummary, 50) },
    ]));
    return;
  }
  if (sub === "delete" || sub === "rm") {
    const id = positional[0];
    if (!id) { console.error(color("red", "wings-of-world webhooks delete <id>")); process.exit(1); }
    await client.deleteWebhook(id);
    console.log(color("green", `✓ deleted ${id}`));
    return;
  }
  console.error(color("red", `Unknown subcommand: webhooks ${sub}`));
  process.exit(1);
}

// ── audit / history ─────────────────────────────────────────────────────
export async function cmdAudit(argv) {
  const { flags } = parseFlags(argv);
  const client = new WingsClient(flags.host);
  await ensureServer(client);
  const r = await client.audit();
  const entries = (r.entries || r || []).slice(0, Number(flags.limit) || 30);
  console.log(formatTable(entries, [
    { label: "Time", value: (e) => e.timestamp?.slice(11, 19) || "" },
    { label: "Area", value: (e) => e.area },
    { label: "Action", value: (e) => e.action },
    { label: "Status", value: (e) => e.status === "error" ? color("red", e.status) : e.status },
    { label: "Summary", value: (e) => shortenText(e.summary, 60) },
  ]));
}

export async function cmdHistory(argv) {
  const { flags } = parseFlags(argv);
  const client = new WingsClient(flags.host);
  await ensureServer(client);
  const r = await client.history(Number(flags.limit) || 30);
  const records = r.executions || r.entries || r || [];
  console.log(formatTable(records, [
    { label: "Time", value: (e) => e.createdAt?.slice(11, 19) || "" },
    { label: "Kind", value: (e) => e.kind },
    { label: "Status", value: (e) => e.status === "error" ? color("red", e.status) : e.status },
    { label: "Title", value: (e) => shortenText(e.title, 40) },
    { label: "Tokens", value: (e) => formatTokenUsage(e.tokenUsage) },
    { label: "Cost", value: (e) => typeof e.costEstimateUsd === "number" ? `$${e.costEstimateUsd.toFixed(4)}` : "" },
  ]));
}

// ── evals (guardrails / Future AGI catalog) ─────────────────────────────
export async function cmdEval(argv) {
  const [sub, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "list" || !sub) {
    const r = await client.listEvals();
    const evals = r.evals || [];
    const filter = flags.tag ? String(flags.tag).toLowerCase() : null;
    const filtered = filter
      ? evals.filter((e) => (e.tags || []).some((t) => t.toLowerCase().includes(filter)))
      : evals;
    console.log(formatTable(filtered, [
      { label: "ID", value: (e) => e.id },
      { label: "Type", value: (e) => e.type },
      { label: "Output", value: (e) => e.output },
      { label: "Tags", value: (e) => (e.tags || []).join(", ") },
      { label: "Description", value: (e) => shortenText(e.description, 50) },
    ]));
    console.log("");
    console.log(color("dim", `${filtered.length} eval(s). Presets: ${(r.presets || []).join(", ")}`));
    return;
  }
  if (sub === "show") {
    const id = positional[0];
    if (!id) { console.error(color("red", "wings-of-world eval show <id>")); process.exit(1); }
    const def = await client.getEval(id);
    console.log(color("bold", def.id) + color("dim", `  (${def.evalType}, ${def.output})`));
    if (def.description) console.log(def.description);
    console.log(color("dim", `Required: ${def.requiredKeys.join(", ")}`));
    if (def.tags?.length) console.log(color("dim", `Tags: ${def.tags.join(", ")}`));
    console.log("");
    console.log(color("dim", "Prompt:"));
    console.log(def.rulePrompt);
    return;
  }
  if (sub === "run") {
    const id = positional[0];
    if (!id) { console.error(color("red", "wings-of-world eval run <id> --output \"...\" [--input \"...\"] [--context \"...\"]")); process.exit(1); }
    const values = {
      input: flags.input ? String(flags.input) : "",
      output: flags.output ? String(flags.output) : "",
      context: flags.context ? String(flags.context) : "",
    };
    if (!values.output && !process.stdin.isTTY) values.output = (await readStdin()).trim();
    const r = await client.runEval(id, values);
    const v = r.verdict;
    if (v.error) {
      console.log(color("red", `× error: ${v.error}`));
    } else {
      const verdict = v.passed === true ? color("green", "PASSED") : v.passed === false ? color("red", "FAILED") : color("yellow", "AMBIGUOUS");
      console.log(`${verdict}  ${color("dim", `(${v.durationMs}ms)`)}`);
      if (typeof v.score === "number") console.log(color("dim", `score: ${v.score.toFixed(3)}`));
      if (flags.verbose && v.reasoning) {
        console.log("");
        console.log(color("dim", "reasoning:"));
        console.log(shortenText(v.reasoning, 600));
      }
    }
    return;
  }
  console.error(color("red", `Unknown subcommand: eval ${sub}`));
  console.error(color("dim", "Try: list [--tag X] | show <id> | run <id> --output \"…\" [--input \"…\"] [--context \"…\"]"));
  process.exit(1);
}

export async function cmdGuardrails(argv) {
  const [sub, ...rest] = argv;
  const { flags } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "check" || !sub) {
    const userMessage = flags.input ? String(flags.input) : "";
    const output = flags.output ? String(flags.output) : "";
    const context = flags.context ? String(flags.context) : undefined;
    const preset = flags.preset || "basic";
    if (!userMessage && !output) {
      console.error(color("red", "wings-of-world guardrails check --input \"...\" --output \"...\" [--context \"...\"] [--preset basic|rag|strict]"));
      process.exit(1);
    }
    const r = await client.guardrailCheck({ preset, userMessage, output, context });
    console.log(color("bold", `preset: ${r.preset}`));
    for (const report of r.reports || []) {
      console.log("");
      console.log(color("bold", `${report.stage}-checks`));
      for (const v of report.verdicts) {
        const status = v.passed === true ? color("green", "✓") : v.passed === false ? color("red", "✗") : color("yellow", "?");
        console.log(`  ${status} ${v.evalId.padEnd(28)} ${color("dim", `${v.durationMs}ms`)}`);
        if (flags.verbose && v.reasoning) console.log(color("dim", "    " + shortenText(v.reasoning, 200)));
      }
      if (report.blocked) console.log(color("red", `  → blocked by: ${report.blockingEvals.join(", ")}`));
    }
    return;
  }
  if (sub === "presets") {
    console.log("Available presets:");
    console.log("  off     — no checks");
    console.log("  basic   — prompt_injection (in), toxicity + pii (out), non-blocking");
    console.log("  rag     — prompt_injection (in), hallucination + groundedness + toxicity (out), blocking");
    console.log("  strict  — full suite, blocking");
    return;
  }
  console.error(color("red", `Unknown subcommand: guardrails ${sub}`));
  process.exit(1);
}

// ── tracing ─────────────────────────────────────────────────────────────
export async function cmdTrace(argv) {
  const [sub, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "list" || !sub) {
    const r = await client.listTraces(Number(flags.limit) || 30);
    console.log(formatTable(r.traces || [], [
      { label: "Trace", value: (t) => t.traceId.slice(0, 8) },
      { label: "Started", value: (t) => t.startedAt?.slice(11, 19) },
      { label: "Name", value: (t) => shortenText(t.name, 28) },
      { label: "Spans", value: (t) => t.spanCount },
      { label: "Duration", value: (t) => `${t.durationMs}ms` },
      { label: "Status", value: (t) => t.status === "error" ? color("red", "error") : color("green", "ok") },
    ]));
    return;
  }
  if (sub === "show") {
    const id = positional[0];
    if (!id) { console.error(color("red", "wings-of-world trace show <traceId>")); process.exit(1); }
    const r = await client.getTrace(id);
    for (const span of r.spans) {
      const indent = span.parentSpanId ? "  " : "";
      const status = span.status === "error" ? color("red", "✗") : color("green", "✓");
      console.log(`${indent}${status} ${span.name.padEnd(30)} ${color("dim", `${span.kind} · ${span.durationMs ?? "?"}ms`)}`);
      if (flags.verbose && Object.keys(span.attributes || {}).length > 0) {
        console.log(color("dim", `${indent}    ${JSON.stringify(span.attributes)}`));
      }
    }
    return;
  }
  console.error(color("red", `Unknown subcommand: trace ${sub}`));
  process.exit(1);
}

// ── cache ───────────────────────────────────────────────────────────────
export async function cmdCache(argv) {
  const [sub, ...rest] = argv;
  const { flags } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "stats" || sub === "list" || !sub) {
    const r = await client.cacheList();
    console.log(color("bold", "Semantic cache stats"));
    console.log(`  entries        ${r.stats.entries}`);
    console.log(`  total hits     ${r.stats.totalHits}`);
    console.log(`  tokens saved   ${r.stats.tokensSaved}`);
    console.log(`  cost saved     $${r.stats.costSavedUsd.toFixed(6)}`);
    if (sub !== "stats" && (r.entries || []).length > 0) {
      console.log("");
      console.log(formatTable(r.entries, [
        { label: "Hits", value: (e) => e.hits },
        { label: "Model", value: (e) => e.model || "" },
        { label: "Prompt", value: (e) => shortenText(e.prompt, 60) },
      ]));
    }
    return;
  }
  if (sub === "clear") {
    const r = await client.cacheClear();
    console.log(color("green", `✓ removed ${r.removed} entries`));
    return;
  }
  if (sub === "prune") {
    const r = await client.cachePrune(Number(flags.days) || 30);
    console.log(color("green", `✓ pruned ${r.removed} stale entries (>${r.retentionDays}d)`));
    return;
  }
  console.error(color("red", `Unknown subcommand: cache ${sub}`));
  process.exit(1);
}

// ── api tokens ──────────────────────────────────────────────────────────
export async function cmdToken(argv) {
  const [sub, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "list" || !sub) {
    const r = await client.listApiTokens();
    console.log(formatTable(r.tokens || [], [
      { label: "ID", value: (t) => t.id },
      { label: "Name", value: (t) => t.name },
      { label: "Prefix", value: (t) => t.prefix },
      { label: "Scopes", value: (t) => t.scopes.join(",") },
      { label: "Used", value: (t) => t.usageCount },
      { label: "Last used", value: (t) => t.lastUsedAt?.slice(0, 19) || "—" },
      { label: "State", value: (t) => t.revokedAt ? color("red", "revoked") : color("green", "active") },
    ]));
    console.log(color("dim", `Available scopes: ${(r.scopes || []).join(", ")}`));
    return;
  }
  if (sub === "create") {
    const name = flags.name || positional[0];
    if (!name) { console.error(color("red", "wings-of-world token create --name <name> --scopes chat:write,memory:read")); process.exit(1); }
    const scopes = flags.scopes ? String(flags.scopes).split(",").map((s) => s.trim()).filter(Boolean) : ["chat:write"];
    const expiresInDays = flags.days ? Number(flags.days) : undefined;
    const r = await client.createApiToken({ name, scopes, expiresInDays });
    console.log(color("green", `✓ created token ${r.token.id}`));
    console.log("");
    console.log(color("bold", "  Secret (shown ONCE — store it now):"));
    console.log("  " + color("yellow", r.secret));
    return;
  }
  if (sub === "revoke") {
    const id = positional[0];
    if (!id) { console.error(color("red", "wings-of-world token revoke <id>")); process.exit(1); }
    await client.revokeApiToken(id);
    console.log(color("green", `✓ revoked ${id}`));
    return;
  }
  if (sub === "delete" || sub === "rm") {
    const id = positional[0];
    if (!id) { console.error(color("red", "wings-of-world token delete <id>")); process.exit(1); }
    await client.deleteApiToken(id);
    console.log(color("green", `✓ deleted ${id}`));
    return;
  }
  console.error(color("red", `Unknown subcommand: token ${sub}`));
  process.exit(1);
}

// ── datasets + replay ───────────────────────────────────────────────────
export async function cmdDataset(argv) {
  const [sub, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "list" || !sub) {
    const r = await client.listDatasets();
    console.log(formatTable(r.datasets || [], [
      { label: "ID", value: (d) => d.id },
      { label: "Name", value: (d) => d.name },
      { label: "Items", value: (d) => d.itemCount },
      { label: "Created", value: (d) => d.createdAt?.slice(0, 19) || "" },
    ]));
    return;
  }
  if (sub === "create") {
    const name = flags.name || positional.join(" ");
    if (!name) { console.error(color("red", "wings-of-world dataset create <name>")); process.exit(1); }
    const r = await client.createDataset({ name, description: flags.description });
    console.log(color("green", `✓ created ${r.dataset.id}`));
    return;
  }
  if (sub === "add") {
    const datasetId = positional[0];
    const input = flags.input || positional[1];
    if (!datasetId || !input) { console.error(color("red", "wings-of-world dataset add <datasetId> --input \"...\" [--expected \"...\"] [--context \"...\"]")); process.exit(1); }
    const r = await client.addDatasetItem(datasetId, {
      input,
      expectedOutput: flags.expected,
      context: flags.context,
    });
    console.log(color("green", `✓ added item ${r.item.id}`));
    return;
  }
  if (sub === "items") {
    const id = positional[0];
    const r = await client.listDatasetItems(id);
    console.log(formatTable(r.items || [], [
      { label: "ID", value: (i) => i.id },
      { label: "Input", value: (i) => shortenText(i.input, 60) },
      { label: "Expected", value: (i) => shortenText(i.expectedOutput, 40) },
    ]));
    return;
  }
  if (sub === "replay") {
    const id = positional[0];
    if (!id) { console.error(color("red", "wings-of-world dataset replay <datasetId> [--model ...] [--evals id1,id2]")); process.exit(1); }
    const evalIds = flags.evals ? String(flags.evals).split(",").map((s) => s.trim()).filter(Boolean) : ["detect_hallucination", "groundedness"];
    console.log(color("dim", `Replaying ${id} with model=${flags.model || "default"}, evals=${evalIds.join(", ")}…`));
    const r = await client.replayDataset(id, { model: flags.model, evalIds, concurrency: Number(flags.concurrency) || 3 });
    const total = r.run.passCount + r.run.failCount + r.run.errorCount;
    const rate = total ? (r.run.passCount / total) * 100 : 0;
    console.log(color("green", `✓ run ${r.run.id} complete`));
    console.log(`  pass:   ${color("green", r.run.passCount)}`);
    console.log(`  fail:   ${color("red", r.run.failCount)}`);
    console.log(`  error:  ${color("yellow", r.run.errorCount)}`);
    console.log(color("bold", `  rate:   ${rate.toFixed(1)}%`));
    return;
  }
  if (sub === "runs") {
    const id = positional[0];
    const r = await client.listReplayRuns(id);
    console.log(formatTable(r.runs || [], [
      { label: "Run", value: (r) => r.id },
      { label: "Model", value: (r) => r.model },
      { label: "Pass", value: (r) => r.passCount },
      { label: "Fail", value: (r) => r.failCount },
      { label: "Rate", value: (r) => `${(r.passRate * 100).toFixed(0)}%` },
      { label: "Status", value: (r) => r.status },
    ]));
    return;
  }
  if (sub === "delete" || sub === "rm") {
    const id = positional[0];
    await client.deleteDataset(id);
    console.log(color("green", `✓ deleted ${id}`));
    return;
  }
  console.error(color("red", `Unknown subcommand: dataset ${sub}`));
  process.exit(1);
}

// ── adversarial / red team ──────────────────────────────────────────────
export async function cmdRedTeam(argv) {
  const [sub, ...rest] = argv;
  const { flags } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "probes" || !sub) {
    const r = await client.listProbes(flags.categories);
    console.log(formatTable(r.probes || [], [
      { label: "ID", value: (p) => p.id },
      { label: "Category", value: (p) => p.category },
      { label: "Description", value: (p) => shortenText(p.description, 60) },
    ]));
    console.log(color("dim", `${(r.probes || []).length} probes loaded`));
    return;
  }
  if (sub === "run") {
    console.log(color("dim", `Running adversarial suite${flags.categories ? ` (${flags.categories})` : ""} — this may take a while…`));
    const r = await client.runAdversarial({
      model: flags.model,
      categories: flags.categories ? String(flags.categories).split(",").map((s) => s.trim()) : undefined,
    });
    const report = r.report;
    console.log("");
    console.log(color("bold", `Report ${report.id}`));
    console.log(`  probes:           ${report.probesRun}`);
    console.log(`  attacks ok:       ${color("green", report.probesRun - report.attacksSucceeded - report.errors)}`);
    console.log(`  attacks succeeded: ${color("red", report.attacksSucceeded)}`);
    console.log(`  blocked:          ${color("yellow", report.guardrailsBlocked)}`);
    console.log(`  errors:           ${report.errors}`);
    if (flags.verbose) {
      console.log("");
      for (const r of report.results) {
        const status = r.attackSucceeded ? color("red", "BREACH") : r.attackSucceeded === false ? color("green", "blocked") : color("yellow", "?");
        console.log(`  ${status} ${r.probeId}`);
        if (r.attackSucceeded && r.output) console.log(color("dim", `    ${shortenText(r.output, 200)}`));
      }
    }
    return;
  }
  console.error(color("red", `Unknown subcommand: redteam ${sub}`));
  process.exit(1);
}

// ── A/B experiments ─────────────────────────────────────────────────────
export async function cmdExperiment(argv) {
  const [sub, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "list" || !sub) {
    const r = await client.listExperiments();
    console.log(formatTable(r.experiments || [], [
      { label: "ID", value: (e) => e.id },
      { label: "Name", value: (e) => e.name },
      { label: "Status", value: (e) => e.status },
      { label: "Arms", value: (e) => e.arms.map((a) => `${a.name}(${a.weight})`).join(",") },
    ]));
    return;
  }
  if (sub === "create") {
    if (!flags.name || !flags.arms) {
      console.error(color("red", "wings-of-world experiment create --name <name> --arms 'control:gpt-4o:50,treatment:claude-sonnet-4-6:50'"));
      process.exit(1);
    }
    const arms = String(flags.arms).split(",").map((spec) => {
      const [name, model, weight] = spec.split(":");
      return { name: name.trim(), model: model.trim(), weight: Number(weight) || 50 };
    });
    const r = await client.createExperiment({ name: flags.name, description: flags.description, arms });
    console.log(color("green", `✓ created ${r.experiment.id}`));
    return;
  }
  if (sub === "stats") {
    const id = positional[0];
    const r = await client.experimentStats(id);
    console.log(color("bold", r.experiment.name));
    console.log(formatTable(r.stats || [], [
      { label: "Arm", value: (s) => s.arm },
      { label: "Obs", value: (s) => s.observations },
      { label: "Success", value: (s) => `${(s.successRate * 100).toFixed(1)}%` },
      { label: "Avg ms", value: (s) => s.avgDurationMs },
      { label: "Avg tokens", value: (s) => s.avgTokens },
      { label: "Cost", value: (s) => `$${s.totalCostUsd.toFixed(4)}` },
    ]));
    return;
  }
  if (sub === "start" || sub === "pause" || sub === "stop") {
    const id = positional[0];
    const status = sub === "start" ? "running" : sub === "pause" ? "paused" : "complete";
    await client.setExperimentStatus(id, status);
    console.log(color("green", `✓ ${id} → ${status}`));
    return;
  }
  console.error(color("red", `Unknown subcommand: experiment ${sub}`));
  process.exit(1);
}

// ── cost ────────────────────────────────────────────────────────────────
export async function cmdCost(argv) {
  const { flags } = parseFlags(argv);
  const client = new WingsClient(flags.host);
  await ensureServer(client);
  const days = Number(flags.days) || 7;
  const overview = await client.costOverview(days);
  const forecast = await client.costForecast(Number(flags.lookback) || days);
  console.log(color("bold", `Last ${days} days`));
  console.log(`  total           $${overview.totalUsd.toFixed(4)}`);
  console.log(`  total tokens    ${overview.totalTokens.toLocaleString()}`);
  console.log(`  total calls     ${overview.totalCalls}`);
  if (overview.topModelToday) {
    console.log(`  top model today ${overview.topModelToday.model} ($${overview.topModelToday.usd.toFixed(4)})`);
  }
  console.log("");
  console.log(color("bold", "By model"));
  console.log(formatTable(overview.byModel.slice(0, 10), [
    { label: "Model", value: (b) => b.bucket },
    { label: "Calls", value: (b) => b.calls },
    { label: "Tokens", value: (b) => b.totalTokens.toLocaleString() },
    { label: "USD", value: (b) => `$${b.totalUsd.toFixed(4)}` },
  ]));
  console.log("");
  console.log(color("bold", "Forecast"));
  console.log(`  daily avg       $${forecast.dailyAvgUsd.toFixed(4)}`);
  console.log(`  monthly proj.   $${forecast.projectedMonthlyUsd.toFixed(2)}`);
}

// ── unified optimization dashboard ──────────────────────────────────────
export async function cmdOptimization(argv) {
  const { flags } = parseFlags(argv);
  const client = new WingsClient(flags.host);
  await ensureServer(client);
  const days = Number(flags.days) || 7;
  const r = await client.optimizationSummary(days);

  console.log(color("bold", `Wings Of World Optimization - last ${r.windowDays} day(s)`));
  console.log("");
  console.log(color("green", `  💰 estimated savings   $${r.totals.estimatedSavingsUsd.toFixed(6)}`));
  console.log(`  💵 actual spend        $${r.spend.totalUsd.toFixed(6)}`);
  console.log(`  📊 forecast monthly    $${r.forecast.projectedMonthlyUsd.toFixed(2)}`);
  console.log(`  🪙 tokens used         ${r.spend.totalTokens.toLocaleString()}`);
  console.log(`  📞 total calls         ${r.spend.totalCalls}`);
  console.log("");
  console.log(color("bold", "Features"));
  console.log(`  cascade        ${r.cascade.mode === "off" ? color("yellow", "off") : color("green", r.cascade.mode)}`);
  console.log(`  compression    ${r.compression.level === "off" ? color("yellow", "off") : color("green", r.compression.level)}  (min ${r.compression.minChars} chars)`);
  console.log(`  tool-cache     ${color("green", `${(r.toolCache.hitRate * 100).toFixed(1)}% hit rate`)}  · ${r.toolCache.totalEntries} entries · ${r.toolCache.totalBytesSaved.toLocaleString()}B saved`);
  console.log(`  consolidation  ${r.consolidation.runs.length} runs · ${r.consolidation.cumulativeMemoriesReduced} memories reduced`);
  if (r.cascade.mode !== "off") {
    console.log("");
    console.log(color("bold", "Cascade tier mix"));
    for (const tier of ["small", "medium", "large"]) {
      const calls = r.cascade.callsByTier[tier];
      const share = r.cascade.sharePct[tier];
      const spend = r.cascade.spendByTier[tier];
      const cfg = r.cascade.tiers[tier];
      const label = cfg ? `${cfg.provider}/${cfg.model}` : "(not configured)";
      console.log(`  ${tier.padEnd(8)} ${String(calls).padStart(4)} calls  ${share.toFixed(1).padStart(5)}%  $${spend.toFixed(6)}  ${color("dim", label)}`);
    }
  }
  console.log("");
  console.log(color("dim", `Server uptime ${r.health.uptimeSeconds}s · RSS ${r.health.rssMb}MB · ${r.health.nodeVersion}`));
}

// ── tool result cache ───────────────────────────────────────────────────
export async function cmdToolCache(argv) {
  const [sub, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "stats" || (!sub && !positional.length)) {
    const r = await client.toolCacheStats();
    const totalCalls = r.totalEntries + r.totalHits;
    const hitRate = totalCalls > 0 ? r.totalHits / totalCalls : 0;
    console.log(color("bold", "Tool result cache"));
    console.log(`  entries        ${r.totalEntries.toLocaleString()}`);
    console.log(`  hits           ${r.totalHits.toLocaleString()}`);
    console.log(color("green", `  hit rate       ${(hitRate * 100).toFixed(1)}%`));
    console.log(`  bytes saved    ${r.totalBytesSaved.toLocaleString()}`);
    console.log("");
    if ((r.byTool || []).length > 0) {
      console.log(formatTable(r.byTool, [
        { label: "Tool", value: (t) => t.tool },
        { label: "Entries", value: (t) => t.entries },
        { label: "Hits", value: (t) => t.hits },
        { label: "Avg result B", value: (t) => t.avgResultBytes.toLocaleString() },
        { label: "Saved B", value: (t) => t.bytesSaved.toLocaleString() },
      ]));
    }
    if (flags.verbose) {
      console.log("");
      console.log(color("dim", "Cache policies:"));
      for (const [tool, p] of Object.entries(r.policies || {})) {
        const desc = p.cacheable
          ? `${p.invalidator}${p.ttlMs ? ` (${Math.round(p.ttlMs / 1000)}s)` : ""}${p.pathArgKey ? ` via ${p.pathArgKey}` : ""}`
          : "off";
        console.log(`  ${tool.padEnd(18)} ${desc}`);
      }
    }
    return;
  }

  if (sub === "list" || sub === "entries") {
    const r = await client.toolCacheEntries(Number(flags.limit) || 30);
    console.log(formatTable(r.entries || [], [
      { label: "Tool", value: (e) => e.toolName },
      { label: "Hits", value: (e) => e.hits },
      { label: "Bytes", value: (e) => e.bytes.toLocaleString() },
      { label: "Args", value: (e) => shortenText(JSON.stringify(e.args), 50) },
      { label: "Created", value: (e) => e.createdAt.slice(11, 19) },
      { label: "Expires", value: (e) => e.expiresAt ? e.expiresAt.slice(11, 19) : "—" },
    ]));
    return;
  }

  if (sub === "clear") {
    const tool = flags.tool || positional[0];
    const r = await client.toolCacheClear(tool);
    console.log(color("green", `✓ removed ${r.removed} entries${tool ? ` for ${tool}` : ""}`));
    return;
  }

  if (sub === "prune") {
    const r = await client.toolCachePrune(flags.max ? Number(flags.max) : undefined);
    console.log(color("green", `✓ pruned ${r.removed} entries`));
    return;
  }

  console.error(color("red", `Unknown subcommand: tool-cache ${sub}`));
  console.error(color("dim", "Try: stats [--verbose] | list [--limit 30] | clear [--tool web_search] | prune [--max 5000]"));
  process.exit(1);
}

// ── prompt compression ──────────────────────────────────────────────────
export async function cmdCompress(argv) {
  const [sub, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "config" || (!sub && !positional.length)) {
    const r = await client.compressConfig();
    console.log(color("bold", "Prompt compression"));
    console.log(`  level       ${r.level}`);
    console.log(`  min chars   ${r.minChars}`);
    return;
  }

  if (sub === "test" || sub === "preview") {
    const text = positional.join(" ").trim() || (await readStdin()).trim();
    if (!text) {
      console.error(color("red", "wings-of-world compress test <text>  (or pipe via stdin)"));
      process.exit(1);
    }
    const level = flags.level || "light";
    const minChars = flags.min ? Number(flags.min) : undefined;
    const r = await client.compressPreview(text, level, minChars);
    const pct = (r.ratio * 100).toFixed(1);
    const saved = r.originalChars - r.compressedChars;
    console.log(color("bold", `Compression result (level=${level})`));
    console.log(`  original     ${r.originalChars.toLocaleString()} chars`);
    console.log(`  compressed   ${r.compressedChars.toLocaleString()} chars`);
    console.log(color("green", `  saved        ${saved.toLocaleString()} chars (kept ${pct}%)`));
    console.log(color("dim", `  techniques:  ${r.techniques.join(", ")}`));
    if (flags.verbose) {
      console.log("");
      console.log(color("bold", "Output:"));
      console.log(r.text);
    }
    return;
  }

  console.error(color("red", `Unknown subcommand: compress ${sub}`));
  console.error(color("dim", "Try: config | test <text> [--level light|aggressive] [--min 600] [--verbose]"));
  process.exit(1);
}

// ── smart model cascade ─────────────────────────────────────────────────
export async function cmdCascade(argv) {
  const [sub, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "config" || (!sub && !positional.length)) {
    const r = await client.cascadeConfig();
    console.log(color("bold", "Cascade configuration"));
    console.log(`  mode                   ${r.mode}`);
    console.log(`  escalation threshold   ${r.escalationThreshold}`);
    const tiers = r.tiers || {};
    console.log("");
    console.log(color("bold", "Tiers"));
    for (const tier of ["small", "medium", "large"]) {
      const t = tiers[tier];
      if (t) {
        console.log(`  ${tier.padEnd(8)} ${color("dim", "→")} ${t.provider}/${t.model}`);
      } else {
        console.log(`  ${tier.padEnd(8)} ${color("yellow", "(not configured)")}`);
      }
    }
    return;
  }

  if (sub === "stats") {
    const r = await client.cascadeStats(Number(flags.days) || 7);
    console.log(color("bold", `Cascade stats — last ${r.days} day(s)`));
    console.log(`  total calls          ${r.totals.calls}`);
    console.log(`  total spend          $${r.totals.totalUsd.toFixed(6)}`);
    console.log(`  always-large would   $${r.projectedAlwaysLargeUsd.toFixed(6)}`);
    console.log(color("green", `  estimated savings    $${r.estimatedSavingsUsd.toFixed(6)}`));
    console.log("");
    console.log(color("bold", "By tier"));
    for (const tier of ["small", "medium", "large"]) {
      const t = r.tiers[tier];
      if (!t) {
        console.log(`  ${tier.padEnd(8)} ${color("dim", "no calls")}`);
        continue;
      }
      const share = ((r.shares[tier] || 0) * 100).toFixed(1) + "%";
      console.log(`  ${tier.padEnd(8)} ${String(t.calls).padStart(4)} calls  ${share.padStart(6)}  $${t.totalUsd.toFixed(6)}  ${t.totalTokens.toLocaleString()} tokens`);
    }
    return;
  }

  if (sub === "test") {
    const prompt = positional.join(" ").trim() || (await readStdin()).trim();
    if (!prompt) {
      console.error(color("red", "wings-of-world cascade test <prompt>  (or pipe via stdin)"));
      process.exit(1);
    }
    const r = await client.cascadeChat({
      messages: [{ role: "user", content: prompt }],
      mode: flags.mode || "balanced",
    });
    const rec = r.cascade?.record;
    if (rec) {
      console.log(color("dim", `complexity: ${rec.complexity?.complexity} (${(rec.complexity?.signals || []).join(", ") || "no signals"})`));
      console.log(color("dim", `starting tier: ${rec.startingTier}, final tier: ${rec.finalTier}, escalations: ${rec.escalations}`));
      for (const a of rec.attempts || []) {
        const status = a.escalated ? color("yellow", "↑ escalated") : color("green", "✓ kept");
        console.log(`  ${status} ${a.tier.padEnd(8)} ${a.target.provider}/${a.target.model}  conf=${a.confidence?.score?.toFixed(2)}  ${a.durationMs}ms`);
      }
      console.log("");
    }
    console.log(color("cyan", "› ") + r.content);
    return;
  }

  console.error(color("red", `Unknown subcommand: cascade ${sub}`));
  console.error(color("dim", "Try: config | stats [--days 7] | test <prompt> [--mode balanced|aggressive]"));
  process.exit(1);
}

// ── hermes sync ─────────────────────────────────────────────────────────
export async function cmdHermes(argv) {
  const [sub] = argv;
  const { flags } = parseFlags(argv.slice(1));
  const client = new WingsClient(flags.host);
  await ensureServer(client);

  if (sub === "status" || !sub) {
    const r = await client.hermesStatus();
    console.log(color("bold", "Hermes workspace sync"));
    console.log(`  enabled        ${r.enabled ? color("green", "yes") : color("yellow", "no")}`);
    console.log(`  hermes home    ${r.homeDir}${r.homeExists ? "" : color("dim", " (missing)")}`);
    console.log(`  hermes db      ${r.dbPath}${r.dbExists ? "" : color("dim", " (will be created on push)")}`);
    console.log(`  hermes facts   ${r.hermesFactCount === null ? color("dim", "n/a") : r.hermesFactCount}`);
    console.log(`  Wings Of World memory   ${r.wingsMemoryCount}`);
    return;
  }
  if (sub === "push") {
    const r = await client.hermesPush();
    console.log(color("green", `✓ pushed: ${r.stats.inserted} new + ${r.stats.updated} updated, ${r.stats.unchanged} unchanged`));
    console.log(color("dim", `  → ${r.dbPath}`));
    return;
  }
  if (sub === "pull") {
    const r = await client.hermesPull();
    console.log(color("green", `✓ pulled: ${r.stats.inserted} new + ${r.stats.updated} updated, ${r.stats.unchanged} unchanged`));
    console.log(color("dim", `  Wings Of World memory total: ${r.totalAfter}`));
    return;
  }
  if (sub === "sync" || sub === "full") {
    const r = await client.hermesSync();
    console.log(color("bold", `✓ bidirectional sync (${r.durationMs}ms)`));
    console.log(`  push    inserted ${r.push.inserted}  updated ${r.push.updated}  unchanged ${r.push.unchanged}`);
    console.log(`  pull    inserted ${r.pull.inserted}  updated ${r.pull.updated}  unchanged ${r.pull.unchanged}`);
    console.log(color("dim", `  → ${r.dbPath}`));
    return;
  }
  console.error(color("red", `Unknown subcommand: hermes ${sub}`));
  console.error(color("dim", "Try: status | push | pull | sync"));
  process.exit(1);
}

// ── status ──────────────────────────────────────────────────────────────
export async function cmdStatus(argv) {
  const { flags } = parseFlags(argv);
  const client = new WingsClient(flags.host);
  const ok = await client.ping();
  if (!ok) {
    console.log(color("red", `× ${client.baseUrl} unreachable`));
    return;
  }
  const settings = await client.settings().catch(() => null);
  const readiness = await client.readiness().catch(() => null);
  console.log(color("green", `✓ ${client.baseUrl} reachable`));
  if (settings) {
    console.log(color("dim", `provider  ${settings.provider}`));
    console.log(color("dim", `model     ${settings.model}`));
    console.log(color("dim", `apiKey    ${settings.hasApiKey ? "configured" : color("yellow", "missing")}`));
  }
  if (readiness?.checks) {
    for (const c of readiness.checks) {
      const status = c.status === "ready" ? color("green", "ready") : c.status === "warning" ? color("yellow", "warn") : color("red", "error");
      console.log(`${status}  ${c.label} — ${c.detail}`);
    }
  }
}
