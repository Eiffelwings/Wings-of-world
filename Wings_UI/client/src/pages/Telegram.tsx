import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  Command,
  Loader2,
  MessagesSquare,
  Radar,
  Send,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

export default function TelegramPage() {
  const [health, setHealth] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [healthData, readinessData, auditData] = await Promise.all([
        api.getSystemHealth(),
        api.getSystemReadiness(),
        api.listAudit(200),
      ]);
      setHealth(healthData);
      setReadiness(readinessData);
      setAudit(auditData.entries || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const telegramCheck = readiness?.checks?.find((check: any) => check.id === "telegram");
  const telegramCommands = audit.filter(
    (entry) => entry.area === "system" && entry.action === "telegram-command",
  );
  const deliveryAudit = audit.filter(
    (entry) => entry.area === "system" && entry.action === "telegram-delivery",
  );
  const generationAudit = audit.filter(
    (entry) => entry.area === "chat" && entry.action === "telegram-generate",
  );
  const commandSummary = Object.entries(
    telegramCommands.reduce((sum: Record<string, number>, entry: any) => {
      const key = entry.summary || "unknown";
      sum[key] = (sum[key] || 0) + 1;
      return sum;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const parseLatency = (summary: string) => {
    const match = summary.match(/in (\d+)ms/);
    return match ? Number(match[1]) : null;
  };
  const deliveryLatencies = deliveryAudit
    .map((entry) => parseLatency(entry.summary))
    .filter((value): value is number => typeof value === "number");
  const generationLatencies = generationAudit
    .map((entry) => parseLatency(entry.summary))
    .filter((value): value is number => typeof value === "number");
  const avg = (values: number[]) =>
    values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  const percentile = (values: number[], pct: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1),
    );
    return sorted[index];
  };
  const latencyChartData = [
    {
      label: "delivery",
      avg: avg(deliveryLatencies),
      p50: percentile(deliveryLatencies, 50),
      p95: percentile(deliveryLatencies, 95),
      p99: percentile(deliveryLatencies, 99),
    },
    {
      label: "generate",
      avg: avg(generationLatencies),
      p50: percentile(generationLatencies, 50),
      p95: percentile(generationLatencies, 95),
      p99: percentile(generationLatencies, 99),
    },
  ];
  const bridgeReady = health?.telegram?.enabled && telegramCheck?.status === "ready";
  const topIssue =
    health?.telegram?.lastError ||
    telegramCheck?.action ||
    (!health?.telegram?.enabled ? "Telegram bridge is not enabled yet." : "");

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <section className="rounded-[2rem] border bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(2,132,199,0.09),rgba(20,184,166,0.08))] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-full border bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Telegram operations
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Telegram</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Run Wings Of World inside Telegram with the same chat, memory, history, and human-task engine as the web app. This page should tell you if the bridge is ready, what failed, and which commands matter most in practice.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={bridgeReady ? "secondary" : "destructive"} className="rounded-full px-3 py-1">
              {bridgeReady ? "bridge ready" : "needs attention"}
            </Badge>
            <Link href="/system">
              <Button variant="secondary" className="rounded-full">System</Button>
            </Link>
            <Button variant="ghost" className="rounded-full" onClick={load} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TelegramMetric
            title="Bridge"
            value={health?.telegram?.enabled ? "Enabled" : "Disabled"}
            detail={telegramCheck?.detail || "Readiness not loaded"}
            icon={Bot}
            tone={bridgeReady ? "ready" : "warning"}
          />
          <TelegramMetric
            title="Linked Chats"
            value={String(health?.telegram?.linkedChats ?? 0)}
            detail={health?.telegram?.lastPollAt ? `Last poll ${new Date(health.telegram.lastPollAt).toLocaleString()}` : "No poll recorded yet"}
            icon={MessagesSquare}
            tone={(health?.telegram?.linkedChats ?? 0) > 0 ? "ready" : "warning"}
          />
          <TelegramMetric
            title="Delivery"
            value={`${avg(deliveryLatencies)} ms`}
            detail={`${deliveryAudit.filter((entry) => entry.status === "error").length} failures`}
            icon={Send}
            tone={deliveryAudit.filter((entry) => entry.status === "error").length === 0 ? "ready" : "warning"}
          />
          <TelegramMetric
            title="Generation"
            value={`${avg(generationLatencies)} ms`}
            detail={`${generationAudit.filter((entry) => entry.status === "error").length} failures`}
            icon={Zap}
            tone={generationAudit.filter((entry) => entry.status === "error").length === 0 ? "ready" : "warning"}
          />
        </div>
      </section>

      {topIssue ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
            <div className="space-y-1">
              <div className="font-semibold">Priority issue</div>
              <div className="text-sm text-muted-foreground">{topIssue}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Enabled" value={health?.telegram?.enabled ? "yes" : "no"} />
        <StatCard title="Linked Chats" value={health?.telegram?.linkedChats ?? 0} />
        <StatCard title="Last Poll" value={health?.telegram?.lastPollAt ? "ok" : "-"} />
        <StatCard title="Status" value={telegramCheck?.status || "unknown"} />
        <StatCard title="Delivery Failures" value={deliveryAudit.filter((entry) => entry.status === "error").length} />
        <StatCard title="Avg Delivery" value={`${avg(deliveryLatencies)} ms`} />
        <StatCard title="Generate Failures" value={generationAudit.filter((entry) => entry.status === "error").length} />
        <StatCard title="Avg Generate" value={`${avg(generationLatencies)} ms`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bridge Status</CardTitle>
          <CardDescription>Current Telegram runtime state reported by Wings Of World.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <TelegramStateRow label="Enabled" value={health?.telegram?.enabled ? "yes" : "no"} />
          <TelegramStateRow label="Linked chats" value={String(health?.telegram?.linkedChats ?? 0)} />
          <TelegramStateRow label="Last poll" value={health?.telegram?.lastPollAt || "-"} breakAll />
          <TelegramStateRow label="Error" value={health?.telegram?.lastError || "-"} breakAll />
          {telegramCheck && (
            <>
              <TelegramStateRow label="Readiness" value={telegramCheck.status} />
              <div className="rounded-2xl border bg-muted/15 p-4 text-muted-foreground">
                {telegramCheck.detail}
                {telegramCheck.action ? (
                  <div className="mt-2 text-sm">{telegramCheck.action}</div>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Setup</CardTitle>
          <CardDescription>What you need to set before Telegram chat can go live.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>1. Create a Telegram bot with BotFather.</div>
          <div>2. Set <code>TELEGRAM_BOT_TOKEN</code> before starting Wings Of World.</div>
          <div>3. Optionally set <code>TELEGRAM_ALLOWED_CHAT_IDS</code> as a comma-separated allowlist.</div>
          <div>4. Restart Wings Of World.</div>
          <div>5. In Telegram, send <code>/start</code> to the bot.</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Commands</CardTitle>
          <CardDescription>Built-in commands and quick actions supported by the Telegram bridge.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <CommandGroup
            title="Session control"
            icon={Command}
            commands={[
              "/start connects the bot and pins the quick-action keyboard.",
              "/menu re-shows the Telegram keyboard for tap-first control.",
              "/help shows the full command list with examples.",
              "/status and /session expose the active session, usage, cost, and latest latency.",
              "/new or /reset resets the Telegram chat onto a fresh Wings Of World session.",
            ]}
          />
          <CommandGroup
            title="Skills and prompting"
            icon={Bot}
            commands={[
              "/skills lists available Wings Of World skills for Telegram use.",
              "/skill <id> or /skill clear sets or clears active skills for that Telegram chat.",
              "/prompts lists reusable prompt templates.",
              "/prompt <id> [topic] renders a prompt template directly in Telegram.",
              "Normal messages are routed into the same Wings Of World chat engine used by the web app.",
            ]}
          />
          <CommandGroup
            title="Memory and resources"
            icon={Radar}
            commands={[
              "/resources and /resource <uri> expose MCP-style system context snapshots.",
              "/remember <text> stores a note directly into Wings Of World memory.",
              "/find <query> searches memory from Telegram and returns the top matches.",
              "/memory exposes current memory-related state in Telegram.",
            ]}
          />
          <CommandGroup
            title="Ops and human handoff"
            icon={ShieldCheck}
            commands={[
              "/tasks, /todo <text>, and /done <taskId> manage the human-action queue from Telegram.",
              "/model and /usage expose active runtime and usage state.",
              "/health reports live system readiness from inside Telegram.",
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Command Analytics</CardTitle>
          <CardDescription>Recent Telegram command usage derived from the Wings Of World audit trail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {commandSummary.length === 0 && (
            <div className="text-muted-foreground">No Telegram commands have been recorded yet.</div>
          )}
          {commandSummary.map(([command, count]) => (
            <div key={command} className="flex items-center justify-between rounded-md border px-3 py-2">
              <code>{command}</code>
              <span className="text-muted-foreground">{count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery And Latency</CardTitle>
          <CardDescription>Telegram transport and generation timings derived from audit events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyChartData}>
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="p50" fill="#38bdf8" />
                <Bar dataKey="p95" fill="#f59e0b" />
                <Bar dataKey="p99" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>Delivery success: <code>{deliveryAudit.filter((entry) => entry.status === "success").length}</code></div>
          <div>Delivery failures: <code>{deliveryAudit.filter((entry) => entry.status === "error").length}</code></div>
          <div>Average delivery latency: <code>{avg(deliveryLatencies)} ms</code></div>
          <div>Delivery p50 / p95 / p99: <code>{percentile(deliveryLatencies, 50)} / {percentile(deliveryLatencies, 95)} / {percentile(deliveryLatencies, 99)} ms</code></div>
          <div>Generation success: <code>{generationAudit.filter((entry) => entry.status === "success").length}</code></div>
          <div>Generation failures: <code>{generationAudit.filter((entry) => entry.status === "error").length}</code></div>
          <div>Average generation latency: <code>{avg(generationLatencies)} ms</code></div>
          <div>Generation p50 / p95 / p99: <code>{percentile(generationLatencies, 50)} / {percentile(generationLatencies, 95)} / {percentile(generationLatencies, 99)} ms</code></div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-semibold">{value}</CardContent>
    </Card>
  );
}

function TelegramMetric({
  title,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "ready" | "warning";
}) {
  return (
    <div className="rounded-[1.5rem] border bg-card/85 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${
            tone === "ready" ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${
            tone === "ready" ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"
          }`}
        >
          {tone}
        </span>
      </div>
      <div className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="mt-2 text-sm leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}

function TelegramStateRow({
  label,
  value,
  breakAll = false,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-muted/15 p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`mt-2 font-mono text-sm ${breakAll ? "break-all" : ""}`}>{value}</div>
    </div>
  );
}

function CommandGroup({
  title,
  commands,
  icon: Icon,
}: {
  title: string;
  commands: string[];
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-[1.5rem] border bg-muted/15 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="font-semibold">{title}</div>
      </div>
      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
        {commands.map((command) => (
          <div key={command} className="rounded-xl border bg-background p-3 leading-6">
            {command}
          </div>
        ))}
      </div>
    </div>
  );
}
