import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  api,
  type AuditEntry,
  type HumanTask,
  type MemoryEntry,
  type PublicSettings,
  type SystemReadiness,
  type ToolDefinition,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHero, PageMetricCard } from "@/components/page-shell";
import { Input } from "@/components/ui/input";
import { Activity, Bot, Brain, Loader2, Send, ShieldCheck, Wrench } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

export default function ConsolePage() {
  const [, setLocation] = useLocation();
  const consoleStorageKey = "wings.console.prefs.v1";
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [resources, setResources] = useState<any>(null);
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [memoryStats, setMemoryStats] = useState<any>(null);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [humanTasks, setHumanTasks] = useState<HumanTask[]>([]);
  const [memoryProbe, setMemoryProbe] = useState("system");
  const [memoryMatches, setMemoryMatches] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(consoleStorageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (typeof parsed.memoryProbe === "string") {
        setMemoryProbe(parsed.memoryProbe);
      }
    } catch {}
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      consoleStorageKey,
      JSON.stringify({ memoryProbe }),
    );
  }, [memoryProbe]);

  const load = async () => {
    setLoading(true);
    try {
      const [
        settingsData,
        healthData,
        resourceData,
        readinessData,
        agentData,
        memoryStatData,
        memoryData,
        toolData,
        contextData,
        auditData,
        executionData,
        humanTaskData,
      ] = await Promise.all([
        api.getSettings(),
        api.getSystemHealth(),
        api.getSystemResources(),
        api.getSystemReadiness(),
        api.getAgents(),
        api.getMemoryStats(),
        api.listMemories(),
        api.getTools(),
        api.getMemoryContext(memoryProbe),
        api.listAudit(20),
        api.listExecutions({ limit: 60 }),
        api.listHumanTasks(),
      ]);

      setSettings(settingsData);
      setHealth(healthData);
      setResources(resourceData);
      setReadiness(readinessData);
      setAgents(agentData.agents);
      setMemoryStats(memoryStatData);
      setMemories(memoryData.memories.slice(0, 5));
      setTools(toolData.tools);
      setMemoryMatches(contextData.memories);
      setAudit(auditData.entries);
      setExecutions(executionData.entries);
      setHumanTasks(humanTaskData.tasks);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const refreshMemoryProbe = async () => {
    try {
      const data = await api.getMemoryContext(memoryProbe);
      setMemoryMatches(data.memories);
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const costTrendData = useMemo(() => {
    const buckets = new Map<string, { label: string; cost: number }>();
    executions.forEach((entry) => {
      const label = entry.createdAt.slice(5, 10);
      const current = buckets.get(label) || { label, cost: 0 };
      current.cost += entry.costEstimateUsd || 0;
      buckets.set(label, current);
    });
    return Array.from(buckets.values()).slice(-7);
  }, [executions]);
  const sourceCostData = useMemo(() => {
    const totals = {
      chat: 0,
      workflow: 0,
      tool: 0,
    };
    executions.forEach((entry) => {
      if (entry.kind === "chat") totals.chat += entry.costEstimateUsd || 0;
      if (entry.kind === "workflow") totals.workflow += entry.costEstimateUsd || 0;
      if (entry.kind === "tool") totals.tool += entry.costEstimateUsd || 0;
    });
    return [
      { label: "chat", cost: totals.chat },
      { label: "workflow", cost: totals.workflow },
      { label: "tool", cost: totals.tool },
    ];
  }, [executions]);
  const modelCostData = useMemo(() => {
    const buckets = new Map<string, { label: string; cost: number }>();
    executions.forEach((entry) => {
      const key = entry.model || "unknown";
      const current = buckets.get(key) || { label: key, cost: 0 };
      current.cost += entry.costEstimateUsd || 0;
      buckets.set(key, current);
    });
    return Array.from(buckets.values())
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 6);
  }, [executions]);
  const percentile = (values: number[], pct: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
    return sorted[index];
  };
  const executionLatencyData = useMemo(() => {
    const byKind: Record<string, number[]> = { chat: [], workflow: [], tool: [] };
    executions.forEach((entry) => {
      if (typeof entry.durationMs === "number" && byKind[entry.kind]) {
        byKind[entry.kind].push(entry.durationMs);
      }
    });
    return (["chat", "workflow", "tool"] as const).map((kind) => ({
      label: kind,
      p50: percentile(byKind[kind], 50),
      p95: percentile(byKind[kind], 95),
      p99: percentile(byKind[kind], 99),
    }));
  }, [executions]);

  const openHistory = (params: Record<string, string>) => {
    const search = new URLSearchParams(params);
    setLocation(`/history?${search.toString()}`);
  };
  const warningChecks = readiness?.checks.filter((check) => check.status !== "ready") || [];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <PageHero
        eyebrow="Operations cockpit"
        title="Operations Console"
        description="Central runtime view for readiness, memory, tools, agents, audit, and execution economics. This is the fastest place to tell whether Wings Of World is healthy and where the next operator action should go."
        status={{
          label: readiness?.overall || "loading",
          variant: readiness?.overall === "ready" ? "secondary" : "destructive",
        }}
        actions={
          <>
          <Link href="/history">
            <Button variant="secondary" className="rounded-full">History</Button>
          </Link>
          <Link href="/workflow">
            <Button variant="secondary" className="rounded-full">Workflow Library</Button>
          </Link>
          <Link href="/workflow-builder">
            <Button variant="secondary" className="rounded-full">Workflow Builder</Button>
          </Link>
          <Link href="/chat">
            <Button variant="secondary" className="rounded-full">Chat</Button>
          </Link>
          <Link href="/telegram">
            <Button variant="secondary" className="rounded-full">Telegram</Button>
          </Link>
          <Link href="/memory">
            <Button variant="secondary" className="rounded-full">Memory</Button>
          </Link>
          <Button variant="ghost" className="rounded-full" onClick={load} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Refresh
          </Button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PageMetricCard
            title="Server"
            value={health?.ok ? "healthy" : "offline"}
            detail={health?.node || "Node runtime not loaded"}
            icon={Activity}
            tone={health?.ok ? "ready" : "warning"}
          />
          <PageMetricCard
            title="Readiness"
            value={readiness?.overall || "-"}
            detail={`${readiness?.summary.ready || 0} ready - ${readiness?.summary.warning || 0} warning - ${readiness?.summary.error || 0} error`}
            icon={ShieldCheck}
            tone={readiness?.overall === "ready" ? "ready" : "warning"}
          />
          <PageMetricCard
            title="Memory"
            value={String(memoryStats?.totalMemories ?? 0)}
            detail={`${memoryStats?.workflowSnapshots ?? 0} workflow snapshots`}
            icon={Brain}
            tone="neutral"
          />
          <PageMetricCard
            title="Telegram"
            value={health?.telegram?.enabled ? `${health?.telegram?.linkedChats ?? 0} chats` : "disabled"}
            detail={health?.telegram?.lastError || "Bridge healthy"}
            icon={Send}
            tone={health?.telegram?.lastError ? "warning" : "ready"}
          />
        </div>
      </PageHero>

      {warningChecks.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="font-semibold">Priority issues</div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {warningChecks.slice(0, 4).map((check) => (
                <div key={check.id} className="rounded-2xl border bg-background/80 p-3 text-sm">
                  <div className="font-medium">{check.label}</div>
                  <div className="mt-1 text-muted-foreground">{check.detail}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Server" value={health?.ok ? "healthy" : "offline"} />
        <StatCard title="Readiness" value={readiness?.overall || "-"} />
        <StatCard title="Memories" value={memoryStats?.totalMemories ?? 0} />
        <StatCard title="Tools" value={tools.length} />
        <StatCard title="Telegram" value={health?.telegram?.enabled ? `${health?.telegram?.linkedChats ?? 0} chats` : "disabled"} />
        <StatCard title="Human Tasks" value={humanTasks.filter((task) => task.status !== "done").length} />
        <StatCard
          title="Execution Cost"
          value={`$${audit
            .reduce((sum, entry) => {
              const match = entry.summary.match(/\$([0-9]+\.[0-9]+)/);
              return sum + (match ? Number(match[1]) : 0);
            }, 0)
            .toFixed(4)}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Readiness</CardTitle>
            <CardDescription>Current blockers and next actions before full use.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {readiness?.checks.map((check) => (
              <div key={check.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{check.label}</div>
                  <Badge variant="secondary">{check.status}</Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{check.detail}</div>
                {check.action && (
                  <div className="mt-1 text-xs text-muted-foreground">{check.action}</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Runtime</CardTitle>
            <CardDescription>Core health, CPU, memory, and data path.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div>Node: <code>{health?.node || "-"}</code></div>
            <div>Platform: <code>{health?.platform} {resources?.platform?.release}</code></div>
            <div>CPU: <code>{resources?.cpu?.cores} cores</code></div>
            <div>RAM: <code>{resources?.memory?.usedGb} / {resources?.memory?.totalGb} GB</code></div>
            <div>Data dir: <code className="break-all">{resources?.dataDir || settings?.dataDir}</code></div>
            <div>API configured: <code>{health?.providerConfigured ? "yes" : "no"}</code></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agents</CardTitle>
            <CardDescription>Operational roles imported into Wings Of World.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {agents.map((agent) => (
              <div key={agent.role} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <div className="font-medium">{agent.title}</div>
                  <div className="text-muted-foreground">{agent.summary}</div>
                </div>
                <Badge variant="secondary">{agent.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Memory</CardTitle>
            <CardDescription>Latest durable context available to chat and workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {memories.length === 0 && (
              <div className="text-sm text-muted-foreground">No memory entries yet.</div>
            )}
            {memories.map((entry) => (
              <div key={entry.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{entry.memoryType} / {entry.source}</span>
                  <span>{new Date(entry.updatedAt).toLocaleString()}</span>
                </div>
                <div className="mt-2 text-sm">{entry.content}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr,1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Tool Surface</CardTitle>
            <CardDescription>Available operational tools in Wings Of World.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {tools.map((tool) => (
              <div key={tool.name} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div>
                  <div className="font-medium text-sm">{tool.name}</div>
                  <div className="text-sm text-muted-foreground">{tool.description}</div>
                </div>
                <Badge variant="secondary">{tool.riskLevel}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Memory Probe</CardTitle>
            <CardDescription>Preview which memory items Wings Of World will attach for a query.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={memoryProbe}
                onChange={(e) => setMemoryProbe(e.target.value)}
                placeholder="Search terms..."
              />
              <Button variant="secondary" onClick={refreshMemoryProbe}>
                Probe
              </Button>
            </div>
            <div className="space-y-2">
              {memoryMatches.length === 0 && (
                <div className="text-sm text-muted-foreground">No matching memory context.</div>
              )}
              {memoryMatches.map((entry) => (
                <div key={entry.id} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    {entry.memoryType} - {entry.source}
                  </div>
                  <div className="mt-1 text-sm">{entry.content}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>Recent chat, tool, workflow, memory, and settings activity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {audit.length === 0 && (
            <div className="text-sm text-muted-foreground">No audit entries yet.</div>
          )}
          {audit.map((entry) => (
            <div key={entry.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{entry.area} / {entry.action}</span>
                <Badge variant="secondary">{entry.status}</Badge>
              </div>
              <div className="mt-2 text-sm">{entry.summary}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {new Date(entry.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost Trend</CardTitle>
            <CardDescription>Recent estimated execution cost derived from audit and execution summaries.</CardDescription>
          </CardHeader>
        <CardContent className="space-y-2">
          <div className="rounded-2xl border bg-muted/15 p-3 text-xs text-muted-foreground">
            Click the chart to jump into History with a narrower execution window.
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={costTrendData}>
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary) / 0.2)"
                  onClick={() => openHistory({ time: "7d" })}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {audit
            .filter((entry) => entry.area === "chat" || entry.area === "workflow")
            .slice(0, 8)
            .map((entry) => {
              const match = entry.summary.match(/\$([0-9]+\.[0-9]+)/);
              return (
                <div key={`${entry.id}-cost`} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{entry.area} / {entry.action}</span>
                    <span>{match ? `$${match[1]}` : "$0.000000"}</span>
                  </div>
                  <div className="mt-2 text-sm">{entry.summary}</div>
                </div>
              );
            })}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cost By Source</CardTitle>
            <CardDescription>Estimated execution cost split across chat, workflow, and tool surfaces.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 rounded-2xl border bg-muted/15 p-3 text-xs text-muted-foreground">
              Chat, workflow, and tool costs are clickable drill-down lanes.
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceCostData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Bar
                    dataKey="cost"
                    fill="hsl(var(--primary))"
                    radius={[6, 6, 0, 0]}
                    onClick={(state: any) => openHistory({ source: state?.label || "all", time: "all" })}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost By Model</CardTitle>
            <CardDescription>Top recent models by estimated cost.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 rounded-2xl border bg-muted/15 p-3 text-xs text-muted-foreground">
              Click a model bar to pre-fill the History search filter.
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelCostData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="label" width={110} />
                  <Tooltip />
                  <Bar
                    dataKey="cost"
                    fill="#38bdf8"
                    radius={[0, 6, 6, 0]}
                    onClick={(state: any) => openHistory({ search: state?.label || "", time: "all" })}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Execution Latency</CardTitle>
          <CardDescription>Percentile latency across recent chat, workflow, and tool runs.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 rounded-2xl border bg-muted/15 p-3 text-xs text-muted-foreground">
            Bars represent p50, p95, and p99 latency. Click a source to open the matching history slice.
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={executionLatencyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="p50" fill="#38bdf8" onClick={(state: any) => openHistory({ source: state?.label || "all" })} />
                <Bar dataKey="p95" fill="#f59e0b" onClick={(state: any) => openHistory({ source: state?.label || "all" })} />
                <Bar dataKey="p99" fill="#ef4444" onClick={(state: any) => openHistory({ source: state?.label || "all" })} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
