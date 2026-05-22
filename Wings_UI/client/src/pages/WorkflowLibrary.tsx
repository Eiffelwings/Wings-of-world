import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHero, PageMetricCard } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { GitBranchPlus, Layers3, Loader2, PencilLine, Search, Sparkles, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";

type NodeKind = "trigger" | "llm" | "code" | "tool" | "telegram" | "condition" | "loop" | "output";

type PersistedWorkflow = {
  id: string;
  name: string;
  nodes: Array<{
    id: string;
    type: NodeKind;
    data: {
      label: string;
      kind: NodeKind;
      prompt?: string;
      model?: string;
        provider?: "primary" | "fallback";
        input?: string;
        code?: string;
        toolName?: string;
        toolArgs?: string;
        chatId?: string;
        condition?: string;
        itemsExpr?: string;
        bodyCode?: string;
        maxIterations?: number;
      };
    position?: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    branch?: "true" | "false";
  }>;
  updatedAt: string;
};

function summarizeWorkflowRecord(record: PersistedWorkflow) {
  const llmNodes = record.nodes.filter((node) => node.data.kind === "llm").length;
  const toolNodes = record.nodes.filter((node) => node.data.kind === "tool").length;
  const controlNodes = record.nodes.filter((node) => node.data.kind === "condition" || node.data.kind === "loop").length;
  const outputs = record.nodes.filter((node) => node.data.kind === "output").length;
  return {
    nodeCount: record.nodes.length,
    edgeCount: record.edges.length,
    llmNodes,
    toolNodes,
    controlNodes,
    outputs,
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not saved yet";
  return new Date(value).toLocaleString();
}

export default function WorkflowLibraryPage() {
  const [workflows, setWorkflows] = useState<PersistedWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listWorkflows();
      setWorkflows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleWorkflows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workflows;
    return workflows.filter((item) => {
      const summary = summarizeWorkflowRecord(item);
      return (
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        `${summary.nodeCount}`.includes(q) ||
        `${summary.llmNodes}`.includes(q)
      );
    });
  }, [workflows, search]);

  const duplicateWorkflow = async (record: PersistedWorkflow) => {
    setBusyId(record.id);
    try {
      const clone: PersistedWorkflow = {
        ...record,
        id: Math.random().toString(36).slice(2, 10),
        name: `${record.name} copy`,
        updatedAt: new Date().toISOString(),
        nodes: record.nodes.map((node) => ({
          ...node,
          data: { ...node.data },
          position: node.position ? { ...node.position } : undefined,
        })),
        edges: record.edges.map((edge) => ({ ...edge })),
      };
      await api.saveWorkflows([clone, ...workflows]);
      await load();
      toast.success("Workflow duplicated");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const deleteWorkflow = async (record: PersistedWorkflow) => {
    if (!window.confirm(`Delete workflow "${record.name}"?`)) {
      return;
    }
    setBusyId(record.id);
    try {
      await api.saveWorkflows(workflows.filter((item) => item.id !== record.id));
      await load();
      toast.success("Workflow deleted");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const totalNodes = workflows.reduce((sum, item) => sum + item.nodes.length, 0);
  const totalLlmNodes = workflows.reduce(
    (sum, item) => sum + item.nodes.filter((node) => node.data.kind === "llm").length,
    0,
  );
  const totalControlNodes = workflows.reduce(
    (sum, item) => sum + item.nodes.filter((node) => node.data.kind === "condition" || node.data.kind === "loop").length,
    0,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHero
        eyebrow="Workflow library"
        title="Workflow Library"
        description="Browse stable workflow snapshots, inspect their shape, and open the builder only when you want to edit or execute one."
        status={{
          label: loading ? "syncing" : `${workflows.length} saved`,
          variant: loading ? "outline" : "secondary",
        }}
        actions={(
          <>
            <Link href="/workflow-builder">
              <Button className="rounded-full">Open Builder</Button>
            </Link>
            <Button variant="secondary" className="rounded-full" onClick={() => void load()} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Refresh
            </Button>
          </>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PageMetricCard
            title="Saved workflows"
            value={String(workflows.length)}
            detail="Stable snapshots stored in the persistent workflow library."
            icon={Layers3}
          />
          <PageMetricCard
            title="Visible now"
            value={String(visibleWorkflows.length)}
            detail={search.trim() ? "Matching the current library search" : "Shown in the current library view"}
            icon={Search}
            tone={search.trim() ? "warning" : "neutral"}
          />
          <PageMetricCard
            title="Total nodes"
            value={String(totalNodes)}
            detail={`${totalLlmNodes} LLM nodes and ${totalControlNodes} control nodes across all saved workflows`}
            icon={Workflow}
          />
          <PageMetricCard
            title="Builder flow"
            value="Separated"
            detail="Editing and execution now live in the dedicated Workflow Builder route."
            icon={PencilLine}
            tone="ready"
          />
        </div>
      </PageHero>

      <Card className="rounded-[1.75rem] shadow-sm">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-xl">Saved Workflows</CardTitle>
              <CardDescription>Choose a workflow to inspect, duplicate, delete, or open in the dedicated builder.</CardDescription>
            </div>
            <div className="w-full max-w-sm">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, id, or shape..."
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          {workflows.length === 0 && (
            <div className="rounded-[1.5rem] border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
              No saved workflows yet. Open the builder, create a graph, and save it to promote it into the library.
            </div>
          )}

          {workflows.length > 0 && visibleWorkflows.length === 0 && (
            <div className="rounded-[1.5rem] border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
              No saved workflows matched this search.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleWorkflows.map((workflow) => {
              const summary = summarizeWorkflowRecord(workflow);
              return (
                <Card key={workflow.id} className="rounded-[1.5rem] shadow-sm">
                  <CardHeader className="border-b">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-lg">{workflow.name}</CardTitle>
                        <CardDescription>{formatDateTime(workflow.updatedAt)}</CardDescription>
                      </div>
                      <Badge variant="secondary" className="rounded-full px-3 py-1">
                        saved
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 p-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InlineMetric title="Nodes" value={String(summary.nodeCount)} detail={`${summary.edgeCount} edges`} />
                      <InlineMetric title="Logic" value={String(summary.controlNodes)} detail={`${summary.toolNodes} tools | ${summary.outputs} outputs`} />
                    </div>
                    <div className="rounded-2xl border bg-muted/15 p-4 text-xs leading-6 text-muted-foreground">
                      <div>ID: <code>{workflow.id}</code></div>
                      <div className="mt-1">Open this workflow in the builder when you want to edit, inspect nodes, or execute it.</div>
                    </div>
                    <div className="grid gap-2">
                      <Link href={`/workflow-builder?workflowId=${encodeURIComponent(workflow.id)}`}>
                        <Button className="w-full rounded-full">
                          <PencilLine className="mr-2 h-4 w-4" />
                          Open In Builder
                        </Button>
                      </Link>
                      <Button
                        variant="secondary"
                        className="w-full rounded-full"
                        onClick={() => void duplicateWorkflow(workflow)}
                        disabled={busyId === workflow.id}
                      >
                        {busyId === workflow.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <GitBranchPlus className="mr-2 h-4 w-4" />
                        )}
                        Duplicate
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full rounded-full"
                        onClick={() => void deleteWorkflow(workflow)}
                        disabled={busyId === workflow.id}
                      >
                        {busyId === workflow.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InlineMetric({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border bg-muted/15 p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}
