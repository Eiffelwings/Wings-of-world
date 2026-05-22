import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { api, type AuditEntry, type ExecutionArtifact, type ExecutionRecord } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHero, PageMetricCard } from "@/components/page-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Clock3, DollarSign, Loader2, RefreshCcw, TimerReset, Wrench, Workflow } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

type HistoryKind = "chat" | "workflow" | "system" | "tool";
type HistoryStatus = "success" | "error";
type HistorySourceFilter = "all" | HistoryKind;
type HistoryTimeFilter = "all" | "24h" | "7d" | "30d";

interface HistoryItem {
  id: string;
  source: HistoryKind;
  type: "execution" | "audit";
  status: HistoryStatus;
  title: string;
  summary: string;
  detail?: string;
  createdAt: string;
  targetHref?: string;
  targetLabel?: string;
  memoryCount?: number;
  model?: string;
  execution?: ExecutionRecord;
}

function toExecutionItem(entry: ExecutionRecord): HistoryItem {
  const params = new URLSearchParams();
  if (entry.kind === "chat") {
    if (entry.sessionId) params.set("sessionId", entry.sessionId);
    if (entry.inputPreview) params.set("prompt", entry.inputPreview);
    params.set("replay", entry.id);
  } else if (entry.kind === "workflow") {
    if (entry.workflowId) params.set("workflowId", entry.workflowId);
    if (entry.inputPreview) params.set("input", entry.inputPreview);
    params.set("replay", entry.id);
  } else {
    if (entry.toolName) params.set("tool", entry.toolName);
    if (entry.inputPreview) params.set("args", entry.inputPreview);
    params.set("replay", entry.id);
    if (entry.toolName !== "write_file") {
      params.set("autorun", "1");
    }
  }

  return {
    id: entry.id,
    source: entry.kind,
    type: "execution",
    status: entry.status,
    title: entry.title,
    summary: entry.summary,
    detail: entry.outputPreview || entry.inputPreview,
    createdAt: entry.createdAt,
    targetHref:
      entry.kind === "chat"
        ? `/chat?${params.toString()}`
        : entry.kind === "workflow"
          ? `/workflow-builder?${params.toString()}`
          : `/tools?${params.toString()}`,
    targetLabel:
      entry.kind === "chat"
        ? "Replay in Chat"
        : entry.kind === "workflow"
          ? "Replay in Workflow"
          : entry.toolName === "write_file"
            ? "Open in Tools"
            : "Replay in Tools",
    memoryCount: entry.memoryCount,
    model: entry.model,
    execution: entry,
  };
}

function toAuditItem(entry: AuditEntry): HistoryItem {
  return {
    id: entry.id,
    source: entry.area === "tool" ? "tool" : "system",
    type: "audit",
    status: entry.status,
    title: `${entry.area} / ${entry.action}`,
    summary: entry.summary,
    detail: entry.targetId,
    createdAt: entry.timestamp,
  };
}

function withinWindow(createdAt: string, windowKey: HistoryTimeFilter) {
  if (windowKey === "all") return true;
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  const diff = now - created;
  const hour = 60 * 60 * 1000;
  if (windowKey === "24h") return diff <= 24 * hour;
  if (windowKey === "7d") return diff <= 7 * 24 * hour;
  return diff <= 30 * 24 * hour;
}

function renderArtifactBlock(value: unknown) {
  if (value === undefined) {
    return "Not captured for this run.";
  }
  return JSON.stringify(value, null, 2);
}

function Section({
  title,
  description,
  items,
  replayingId,
  inspectingId,
  onReplayNow,
  onInspect,
}: {
  title: string;
  description: string;
  items: HistoryItem[];
  replayingId: string | null;
  inspectingId: string | null;
  onReplayNow: (item: HistoryItem) => Promise<void>;
  onInspect: (item: HistoryItem) => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground">No items in this section.</div>
        )}
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="font-medium">{item.title}</div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                  {item.model && <span>model {item.model}</span>}
                  {typeof item.execution?.costEstimateUsd === "number" && (
                    <span>cost ${item.execution.costEstimateUsd.toFixed(6)}</span>
                  )}
                  {typeof item.memoryCount === "number" && <span>memory {item.memoryCount}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">{item.source}</Badge>
                <Badge variant="secondary">{item.status}</Badge>
              </div>
            </div>

            <div className="text-sm">{item.summary}</div>

            {item.detail && (
              <div className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap text-muted-foreground">
                {item.detail}
              </div>
            )}

            {item.targetHref && item.targetLabel && (
              <div className="flex flex-wrap gap-2">
                <Link href={item.targetHref}>
                  <Button variant="outline" size="sm">{item.targetLabel}</Button>
                </Link>
                {item.execution && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void onReplayNow(item)}
                    disabled={replayingId === item.id}
                  >
                    {replayingId === item.id && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Replay Now
                  </Button>
                )}
                {item.execution && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void onInspect(item)}
                    disabled={inspectingId === item.id}
                  >
                    {inspectingId === item.id && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Inspect
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function HistoryPage() {
  const [, setLocation] = useLocation();
  const historyStorageKey = "wings.history.filters.v1";
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<ExecutionArtifact | null>(null);
  const [sourceFilter, setSourceFilter] = useState<HistorySourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | HistoryStatus>("all");
  const [timeFilter, setTimeFilter] = useState<HistoryTimeFilter>("7d");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stored = window.localStorage.getItem(historyStorageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.sourceFilter) setSourceFilter(parsed.sourceFilter);
        if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
        if (parsed.timeFilter) setTimeFilter(parsed.timeFilter);
        if (typeof parsed.search === "string") setSearch(parsed.search);
      } catch {}
    }
    const source = params.get("source");
    const status = params.get("status");
    const time = params.get("time");
    const nextSearch = params.get("search");
    if (source === "chat" || source === "workflow" || source === "system" || source === "tool" || source === "all") {
      setSourceFilter(source);
    }
    if (status === "success" || status === "error" || status === "all") {
      setStatusFilter(status);
    }
    if (time === "24h" || time === "7d" || time === "30d" || time === "all") {
      setTimeFilter(time);
    }
    if (typeof nextSearch === "string" && nextSearch.trim()) {
      setSearch(nextSearch);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      historyStorageKey,
      JSON.stringify({ sourceFilter, statusFilter, timeFilter, search }),
    );
  }, [search, sourceFilter, statusFilter, timeFilter]);

  const load = async () => {
    setLoading(true);
    try {
      const [executionData, auditData] = await Promise.all([
        api.listExecutions({ limit: 80 }),
        api.listAudit(80),
      ]);
      setExecutions(executionData.entries);
      setAudit(auditData.entries);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const items = useMemo(() => {
    const merged: HistoryItem[] = [
      ...executions.map(toExecutionItem),
      ...audit
        .filter((entry) => entry.area === "system")
        .map(toAuditItem),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return merged.filter((item) => {
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!withinWindow(item.createdAt, timeFilter)) return false;
      if (!search.trim()) return true;
      const haystack = `${item.title} ${item.summary} ${item.detail || ""} ${item.model || ""}`.toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });
  }, [audit, executions, search, sourceFilter, statusFilter, timeFilter]);

  const summary = useMemo(() => {
    const totalCost = items.reduce(
      (sum, item) => sum + (item.execution?.costEstimateUsd || 0),
      0,
    );
    return {
      total: items.length,
      failures: items.filter((item) => item.status === "error").length,
      chat: items.filter((item) => item.source === "chat").length,
      workflow: items.filter((item) => item.source === "workflow").length,
      tool: items.filter((item) => item.source === "tool").length,
      system: items.filter((item) => item.source === "system").length,
      totalCost,
    };
  }, [items]);

  const failedItems = items.filter((item) => item.status === "error").slice(0, 8);
  const chatItems = items.filter((item) => item.source === "chat");
  const workflowItems = items.filter((item) => item.source === "workflow");
  const toolItems = items.filter((item) => item.source === "tool");
  const systemItems = items.filter((item) => item.source === "system");
  const costChartData = useMemo(() => {
    const buckets = new Map<
      string,
      { label: string; cost: number; runs: number; chat: number; workflow: number; tool: number }
    >();
    executions.forEach((entry) => {
      const day = entry.createdAt.slice(5, 10);
      const current = buckets.get(day) || {
        label: day,
        cost: 0,
        runs: 0,
        chat: 0,
        workflow: 0,
        tool: 0,
      };
      current.cost += entry.costEstimateUsd || 0;
      current.runs += 1;
      if (entry.kind === "chat") current.chat += entry.costEstimateUsd || 0;
      if (entry.kind === "workflow") current.workflow += entry.costEstimateUsd || 0;
      if (entry.kind === "tool") current.tool += entry.costEstimateUsd || 0;
      buckets.set(day, current);
    });
    return Array.from(buckets.values()).slice(-7);
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
      .slice(0, 8);
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

  const applyHistoryFilters = (next: {
    source?: HistorySourceFilter;
    status?: "all" | HistoryStatus;
    time?: HistoryTimeFilter;
    search?: string;
  }) => {
    if (next.source) setSourceFilter(next.source);
    if (next.status) setStatusFilter(next.status);
    if (next.time) setTimeFilter(next.time);
    if (typeof next.search === "string") setSearch(next.search);
  };

  const inspectRun = async (item: HistoryItem) => {
    if (!item.execution) return;
    setInspectingId(item.id);
    try {
      const data = await api.getExecutionArtifact(item.execution.id);
      setSelectedItem(item);
      setSelectedArtifact(data.artifact);
      setArtifactOpen(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInspectingId(null);
    }
  };

  const replayNow = async (item: HistoryItem) => {
    if (!item.execution) return;
    const entry = item.execution;
    setReplayingId(item.id);

    try {
      if (entry.kind === "tool") {
        if (!entry.toolName) {
          throw new Error("Tool replay is missing the tool name.");
        }
        if (entry.toolName === "write_file") {
          setLocation(item.targetHref || "/tools");
          toast.message("Write tool reopened in Tools for manual confirmation.");
          return;
        }
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = entry.inputPreview ? JSON.parse(entry.inputPreview) : {};
        } catch {
          setLocation(item.targetHref || "/tools");
          toast.message("Tool arguments were truncated in history. Reopened in Tools for review.");
          return;
        }
        await api.executeTool(entry.toolName, parsedArgs, false);
        await load();
        toast.success(`Replayed tool ${entry.toolName}`);
        return;
      }

      if (entry.kind === "chat") {
        const prompt = entry.inputPreview?.trim();
        if (!prompt) {
          throw new Error("Chat replay is missing the original prompt.");
        }
        const session =
          entry.sessionId ? await api.getChatSession(entry.sessionId).catch(() => null) : null;
        const baseMessages = session?.session.messages || [
          { role: "system" as const, content: "You are a helpful assistant." },
        ];
        const response = await api.chatWithSession(
          [...baseMessages, { role: "user" as const, content: prompt }],
          entry.sessionId,
          entry.model,
        );
        await load();
        setLocation(`/chat?sessionId=${encodeURIComponent(response.sessionId)}&replay=${encodeURIComponent(entry.id)}`);
        toast.success("Chat replay executed");
        return;
      }

      const workflowId = entry.workflowId?.trim();
      if (!workflowId) {
        throw new Error("Workflow replay is missing the workflow id.");
      }
      const workflowLibrary = await api.listWorkflows();
      const record = workflowLibrary.find((candidate: any) => candidate?.id === workflowId);
      if (!record) {
        setLocation(item.targetHref || "/workflow-builder");
        throw new Error("Workflow record was not found in the current library.");
      }
      await api.executeWorkflow(
        {
          nodes: Array.isArray(record.nodes)
            ? record.nodes.map((node: any) => ({
                id: node.id,
                type: node.type,
                data: node.data,
              }))
            : [],
          edges: Array.isArray(record.edges)
            ? record.edges.map((edge: any) => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
              }))
            : [],
        },
        entry.inputPreview || "",
        {
          workflowId,
          workflowName:
            typeof record?.name === "string" && record.name.trim()
              ? record.name
              : entry.title,
        },
      );
      await load();
      setLocation(`/workflow-builder?workflowId=${encodeURIComponent(workflowId)}&input=${encodeURIComponent(entry.inputPreview || "")}&replay=${encodeURIComponent(entry.id)}`);
      toast.success("Workflow replay executed");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReplayingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <PageHero
        eyebrow="Operational timeline"
        title="History"
        description="Replayable timeline for executions, failures, cost, and artifacts across Wings Of World. Use this page to move from detection to replay without guessing where a run came from."
        status={{
          label: summary.failures > 0 ? `${summary.failures} failures` : "stable",
          variant: summary.failures > 0 ? "destructive" : "secondary",
        }}
        actions={
          <>
          <Link href="/chat">
            <Button variant="secondary" className="rounded-full">Chat</Button>
          </Link>
          <Link href="/workflow-builder">
            <Button variant="secondary" className="rounded-full">Workflow</Button>
          </Link>
          <Button variant="ghost" className="rounded-full" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PageMetricCard
            title="Visible items"
            value={String(summary.total)}
            detail={`${sourceFilter} - ${statusFilter} - ${timeFilter}`}
            icon={TimerReset}
            tone="neutral"
          />
          <PageMetricCard
            title="Failures"
            value={String(summary.failures)}
            detail={summary.failures > 0 ? "Most urgent runs are surfaced below" : "No failed items in the current filter"}
            icon={AlertCircle}
            tone={summary.failures > 0 ? "warning" : "ready"}
          />
          <PageMetricCard
            title="Workflow runs"
            value={String(summary.workflow)}
            detail={`${summary.chat} chat - ${summary.tool} tool`}
            icon={Workflow}
            tone="neutral"
          />
          <PageMetricCard
            title="Estimated cost"
            value={`$${summary.totalCost.toFixed(4)}`}
            detail="Across visible execution records"
            icon={DollarSign}
            tone="neutral"
          />
        </div>
      </PageHero>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Visible Items" value={summary.total} />
        <StatCard title="Failures" value={summary.failures} accent={summary.failures > 0 ? "text-red-600" : undefined} />
        <StatCard title="Chat Runs" value={summary.chat} />
        <StatCard title="Workflow Runs" value={summary.workflow} />
        <StatCard title="Tool Runs" value={summary.tool} />
        <StatCard title="System Events" value={summary.system} />
        <StatCard title="Est. Cost" value={`$${summary.totalCost.toFixed(4)}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter Bar</CardTitle>
          <CardDescription>Focus the timeline by source, status, window, or text search.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 xl:grid-cols-[1.4fr,220px,220px,220px]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles, summaries, previews, models..."
          />
          <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as HistorySourceFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="chat">Chat</SelectItem>
              <SelectItem value="workflow">Workflow</SelectItem>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="tool">Tool</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | HistoryStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Select value={timeFilter} onValueChange={(value) => setTimeFilter(value as HistoryTimeFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7d</SelectItem>
              <SelectItem value="30d">Last 30d</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cost Trend</CardTitle>
          <CardDescription>Recent daily estimated cost across replayable execution records.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 rounded-2xl border bg-muted/15 p-3 text-xs text-muted-foreground">
            Click a stacked bar to narrow the source filter. Use this first when cost spikes appear.
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="chat" stackId="cost" fill="#38bdf8" radius={[6, 6, 0, 0]} onClick={() => applyHistoryFilters({ source: "chat" })} />
                <Bar dataKey="workflow" stackId="cost" fill="#f59e0b" onClick={() => applyHistoryFilters({ source: "workflow" })} />
                <Bar dataKey="tool" stackId="cost" fill="#10b981" onClick={() => applyHistoryFilters({ source: "tool" })} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cost By Model</CardTitle>
          <CardDescription>Top models by estimated cost in the current filtered history window.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 rounded-2xl border bg-muted/15 p-3 text-xs text-muted-foreground">
            Click a model to prefill the search box and isolate the related runs.
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelCostData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="label" width={110} />
                <Tooltip />
                <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} onClick={(state: any) => applyHistoryFilters({ search: state?.label || "" })} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Execution Latency</CardTitle>
          <CardDescription>Percentile latency across chat, workflow, and tool execution records.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 rounded-2xl border bg-muted/15 p-3 text-xs text-muted-foreground">
            Bars represent p50, p95, and p99. Click a source lane to focus the rest of the page on that execution type.
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={executionLatencyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="p50" fill="#38bdf8" onClick={(state: any) => applyHistoryFilters({ source: state?.label || "all" })} />
                <Bar dataKey="p95" fill="#f59e0b" onClick={(state: any) => applyHistoryFilters({ source: state?.label || "all" })} />
                <Bar dataKey="p99" fill="#ef4444" onClick={(state: any) => applyHistoryFilters({ source: state?.label || "all" })} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {failedItems.length > 0 && (
        <Card className="border-red-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Failure Queue
            </CardTitle>
            <CardDescription>Most recent failed operations that likely need attention first.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {failedItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{item.title}</div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{item.source}</Badge>
                    <Badge variant="secondary">{item.status}</Badge>
                  </div>
                </div>
                <div className="text-sm">{item.summary}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Clock3 className="h-3 w-3" />
                  {new Date(item.createdAt).toLocaleString()}
                </div>
                {item.execution?.kind === "tool" ? (
                  <div className="rounded-xl border bg-background/80 p-2 text-xs text-muted-foreground">
                    Safe tool runs can be replayed directly. `write_file` is reopened for manual confirmation instead of auto-running.
                  </div>
                ) : null}
                {item.targetHref && item.targetLabel && (
                  <div className="flex flex-wrap gap-2">
                    <Link href={item.targetHref}>
                      <Button variant="outline" size="sm">{item.targetLabel}</Button>
                    </Link>
                    {item.execution && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void replayNow(item)}
                        disabled={replayingId === item.id}
                      >
                        {replayingId === item.id && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Replay Now
                      </Button>
                    )}
                    {item.execution && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void inspectRun(item)}
                        disabled={inspectingId === item.id}
                      >
                        {inspectingId === item.id && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Inspect
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Section
          title="Chat Timeline"
          description="Replay prompts, inspect reply previews, and recover from failed chat runs."
          items={chatItems}
          replayingId={replayingId}
          inspectingId={inspectingId}
          onReplayNow={replayNow}
          onInspect={inspectRun}
        />
        <Section
          title="Workflow Timeline"
          description="Review workflow run outcomes and launch the canvas with the previous input."
          items={workflowItems}
          replayingId={replayingId}
          inspectingId={inspectingId}
          onReplayNow={replayNow}
          onInspect={inspectRun}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section
          title="Tool Timeline"
          description="Inspect tool runs as first-class executions and replay safe tools directly."
          items={toolItems}
          replayingId={replayingId}
          inspectingId={inspectingId}
          onReplayNow={replayNow}
          onInspect={inspectRun}
        />
        <Section
          title="System Events"
          description="Operational events pulled from audit for imports, exports, and infrastructure changes."
          items={systemItems}
          replayingId={replayingId}
          inspectingId={inspectingId}
          onReplayNow={replayNow}
          onInspect={inspectRun}
        />
      </div>

      <Dialog open={artifactOpen} onOpenChange={setArtifactOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selectedItem?.title || "Execution Artifact"}</DialogTitle>
            <DialogDescription>
              Forensic view of the captured execution payload, result, trace, and metadata.
            </DialogDescription>
          </DialogHeader>

          {!selectedArtifact ? (
            <div className="text-sm text-muted-foreground">No artifact loaded.</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Run Envelope</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{selectedArtifact.kind}</Badge>
                    <Badge variant="secondary">{selectedArtifact.status}</Badge>
                  </div>
                  <div className="text-muted-foreground">
                    Captured {new Date(selectedArtifact.createdAt).toLocaleString()}
                  </div>
                  <pre className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap overflow-auto max-h-56">
                    {renderArtifactBlock(selectedArtifact.metadata)}
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Memory Context</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap overflow-auto max-h-56">
                    {renderArtifactBlock(selectedArtifact.memoryContext)}
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Input</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap overflow-auto max-h-72">
                    {renderArtifactBlock(selectedArtifact.input)}
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Output</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap overflow-auto max-h-72">
                    {renderArtifactBlock(selectedArtifact.output)}
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Trace</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap overflow-auto max-h-72">
                    {renderArtifactBlock(selectedArtifact.trace)}
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Snapshots</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="mb-2 text-xs font-medium text-muted-foreground">Session Snapshot</div>
                    <pre className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap overflow-auto max-h-40">
                      {renderArtifactBlock(selectedArtifact.sessionSnapshot)}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-medium text-muted-foreground">Workflow Snapshot</div>
                    <pre className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap overflow-auto max-h-40">
                      {renderArtifactBlock(selectedArtifact.workflowSnapshot)}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-medium text-muted-foreground">Tool Args</div>
                    <pre className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap overflow-auto max-h-40">
                      {renderArtifactBlock(selectedArtifact.toolArgs)}
                    </pre>
                  </div>
                  {selectedArtifact.error && (
                    <div>
                      <div className="mb-2 text-xs font-medium text-muted-foreground">Error</div>
                      <pre className="rounded-lg bg-red-500/5 p-3 text-xs whitespace-pre-wrap overflow-auto max-h-40 text-red-700">
                        {selectedArtifact.error}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className={`text-2xl font-semibold ${accent || ""}`}>{value}</CardContent>
    </Card>
  );
}
