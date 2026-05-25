import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { api, type ExecutionRecord, type ToolDefinition } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHero, PageMetricCard } from "@/components/page-shell";
import {
  AlertTriangle,
  Braces,
  FolderTree,
  History,
  Loader2,
  Play,
  RotateCcw,
  Shield,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

const TOOL_PRESETS: Record<string, string> = {
  calculator: JSON.stringify({ expression: "(144 / 12) + 7" }, null, 2),
  list_directory: JSON.stringify(
    { path: "D:\\local_ai_system" },
    null,
    2,
  ),
  read_file: JSON.stringify(
    { path: "D:\\local_ai_system\\README.md", maxBytes: 12000 },
    null,
    2,
  ),
  search_files: JSON.stringify(
    { pattern: "memory", path: "D:\\local_ai_system\\backend" },
    null,
    2,
  ),
  write_file: JSON.stringify(
    {
      path: "C:\\Path\\To\\Wings Of World\\scratch.txt",
      content: "Example output from Wings Of World Tools",
    },
    null,
    2,
  ),
  generate_image: JSON.stringify(
    {
      prompt: "A premium SaaS operations dashboard for AI workflows, crisp UI, realistic product screenshot style",
      model: "gpt-image-1",
      size: "1024x1024",
      quality: "auto",
    },
    null,
    2,
  ),
};

const RISK_STYLES: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  high: "bg-red-500/10 text-red-700 border-red-500/30",
};

export default function ToolsPage() {
  const [location] = useLocation();
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [workspaceRoots, setWorkspaceRoots] = useState<string[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>("calculator");
  const [argsText, setArgsText] = useState(TOOL_PRESETS.calculator);
  const [confirmWrite, setConfirmWrite] = useState("");
  const [running, setRunning] = useState(false);
  const [resultText, setResultText] = useState("");
  const [executionHistory, setExecutionHistory] = useState<ExecutionRecord[]>([]);
  const [replayRunId, setReplayRunId] = useState<string | null>(null);

  const refreshToolHistory = async () => {
    try {
      const data = await api.listExecutions({ kind: "tool", limit: 12 });
      setExecutionHistory(data.entries);
    } catch {
      // Non-blocking history refresh.
    }
  };

  useEffect(() => {
    api.getTools()
      .then((data) => {
        setTools(data.tools);
        setWorkspaceRoots(data.workspaceRoots);
        const params = new URLSearchParams(window.location.search);
        const replayTool = params.get("tool");
        const initialTool =
          replayTool && data.tools.some((tool) => tool.name === replayTool)
            ? replayTool
            : data.tools[0]?.name || "calculator";
        setSelectedTool(initialTool);
        setArgsText(params.get("args") || TOOL_PRESETS[initialTool] || "{}");
      })
      .catch((err: Error) => toast.error(`Load tools failed: ${err.message}`));
    refreshToolHistory();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tool = params.get("tool");
    const args = params.get("args");
    const replay = params.get("replay");
    const autorun = params.get("autorun") === "1";
    if (tool) {
      setSelectedTool(tool);
      setArgsText(args || TOOL_PRESETS[tool] || "{}");
      setReplayRunId(replay);
      if (autorun) {
        setTimeout(() => {
          runToolWithState(tool, args || TOOL_PRESETS[tool] || "{}", "");
        }, 0);
      }
    }
  }, [location]);

  const activeTool = useMemo(
    () => tools.find((tool) => tool.name === selectedTool) || null,
    [selectedTool, tools],
  );

  const runToolWithState = async (
    toolName: string,
    toolArgsText: string,
    confirmation: string,
  ) => {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolArgsText || "{}");
    } catch (err: any) {
      toast.error(`Invalid JSON arguments: ${err.message}`);
      return;
    }

    setRunning(true);
    setResultText("");
    try {
      const response = await api.executeTool(
        toolName,
        args,
        tools.find((tool) => tool.name === toolName)?.requiresConfirmation
          ? confirmation === "CONFIRM"
          : false,
      );
      setResultText(JSON.stringify(response.result, null, 2));
      await refreshToolHistory();
      toast.success(`${toolName} executed`);
    } catch (err: any) {
      setResultText(JSON.stringify({ error: err.message }, null, 2));
      await refreshToolHistory();
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  };

  const runTool = async () => {
    await runToolWithState(selectedTool, argsText, confirmWrite);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHero
        eyebrow="Tool runner"
        title="Operational Tools"
        description="Run file, search, and calculator tools inside guarded Wings Of World workspaces. The catalog stays scoped, auditable, and replayable from execution history."
        status={{
          label: activeTool ? `${activeTool.riskLevel} risk` : "catalog",
          variant: activeTool?.riskLevel === "high" ? "destructive" : "secondary",
        }}
        actions={(
          <Button
            variant="secondary"
            className="rounded-full"
            onClick={() => {
              setArgsText(TOOL_PRESETS[selectedTool] || "{}");
              setConfirmWrite("");
              setResultText("");
            }}
          >
            Reset workspace
          </Button>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PageMetricCard
            title="Catalog size"
            value={String(tools.length)}
            detail="Imported operational tools available to this install."
            icon={Wrench}
          />
          <PageMetricCard
            title="Guarded roots"
            value={String(workspaceRoots.length)}
            detail="Filesystem roots allowed for safe tool access."
            icon={FolderTree}
          />
          <PageMetricCard
            title="Confirmation tools"
            value={String(tools.filter((tool) => tool.requiresConfirmation).length)}
            detail="Tools that require explicit operator confirmation before execution."
            icon={Shield}
            tone="warning"
          />
          <PageMetricCard
            title="Recent runs"
            value={String(executionHistory.length)}
            detail="Tool executions currently surfaced in local history."
            icon={History}
            tone={executionHistory.length ? "ready" : "neutral"}
          />
        </div>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-[340px,1fr]">
        <Card className="rounded-[1.75rem] shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="text-xl">Catalog</CardTitle>
            <CardDescription>Available tools imported into Wings Of World.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              Choose the smallest tool that solves the job. Lower-risk tools are faster to validate and easier to replay safely.
            </div>
            {tools.map((tool) => (
              <button
                key={tool.name}
                type="button"
                onClick={() => {
                  setSelectedTool(tool.name);
                  setArgsText(TOOL_PRESETS[tool.name] || "{}");
                  setResultText("");
                  setConfirmWrite("");
                }}
                className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
                  selectedTool === tool.name
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "bg-card/80 hover:border-primary/40 hover:shadow-sm"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{tool.name}</span>
                  <Badge className={`ml-auto border ${RISK_STYLES[tool.riskLevel]}`}>
                    {tool.riskLevel}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{tool.description}</p>
                {tool.requiresConfirmation && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-amber-700">
                    <Shield className="h-3 w-3" />
                    Confirmation required
                  </div>
                )}
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-[1.75rem] shadow-sm">
            <CardHeader className="border-b">
              <CardTitle className="text-xl">{activeTool?.name || "Tool runner"}</CardTitle>
              <CardDescription>Allowed roots: {workspaceRoots.join(" | ")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {replayRunId && (
                <div className="rounded-2xl border bg-sky-50/70 p-3 text-xs text-sky-950">
                  Loaded from History run <code>{replayRunId}</code>. Review arguments and rerun if needed.
                </div>
              )}

              {activeTool ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <InlineMetric
                    title="Risk"
                    value={activeTool.riskLevel}
                    detail="Declared safety profile of the active tool."
                  />
                  <InlineMetric
                    title="Confirmation"
                    value={activeTool.requiresConfirmation ? "Required" : "Not required"}
                    detail="Write-capable tools require manual confirmation."
                  />
                  <InlineMetric
                    title="Replay state"
                    value={replayRunId ? "Loaded" : "Fresh"}
                    detail={replayRunId ? "Arguments restored from history" : "Using current editor state"}
                  />
                </div>
              ) : null}

              {activeTool?.requiresConfirmation ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-950">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Guarded execution
                  </div>
                  <div className="mt-2 text-xs leading-5">
                    This tool can change files. Wings Of World will only run it after you type <code>CONFIRM</code>.
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label>Arguments (JSON)</Label>
                <Textarea
                  value={argsText}
                  onChange={(e) => setArgsText(e.target.value)}
                  className="min-h-[220px] font-mono text-xs"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => setArgsText(TOOL_PRESETS[selectedTool] || "{}")}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Load preset
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      try {
                        setArgsText(JSON.stringify(JSON.parse(argsText || "{}"), null, 2));
                        toast.success("Arguments formatted");
                      } catch (err: any) {
                        toast.error(`Invalid JSON arguments: ${err.message}`);
                      }
                    }}
                  >
                    <Braces className="mr-2 h-4 w-4" />
                    Format JSON
                  </Button>
                </div>
              </div>

              {activeTool?.requiresConfirmation && (
                <div className="grid gap-2">
                  <Label>Type `CONFIRM` to allow write access</Label>
                  <Input
                    value={confirmWrite}
                    onChange={(e) => setConfirmWrite(e.target.value)}
                    placeholder="CONFIRM"
                  />
                </div>
              )}

              <Button onClick={runTool} disabled={running} className="min-w-32 rounded-full">
                {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Run Tool
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] shadow-sm">
            <CardHeader className="border-b">
              <CardTitle className="text-xl">Result</CardTitle>
              <CardDescription>Structured output from the selected tool.</CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <pre className="min-h-[240px] overflow-auto rounded-[1.5rem] bg-muted p-4 text-xs whitespace-pre-wrap">
                {resultText || "No result yet."}
              </pre>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] shadow-sm">
            <CardHeader className="border-b">
              <CardTitle className="text-xl">Recent Tool Runs</CardTitle>
              <CardDescription>First-class tool execution history inside Wings Of World.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {executionHistory.length === 0 && (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                  No tool runs yet.
                </div>
              )}
              {executionHistory.map((entry) => (
                <div key={entry.id} className="space-y-2 rounded-[1.5rem] border bg-card/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{entry.title}</div>
                    <Badge variant="secondary" className="rounded-full">{entry.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <InlineMetric
                      title="Cost"
                      value={`$${Number(entry.costEstimateUsd || 0).toFixed(6)}`}
                      detail="Estimated tool run cost"
                    />
                    <InlineMetric
                      title="Latency"
                      value={entry.durationMs ? `${entry.durationMs} ms` : "-"}
                      detail="Recorded execution time"
                    />
                    <InlineMetric
                      title="Status"
                      value={entry.status}
                      detail={entry.toolName || "Tool execution"}
                    />
                  </div>
                  <div className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {entry.inputPreview}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
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
    <div className="rounded-2xl border bg-muted/15 p-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="mt-1 text-sm font-semibold capitalize">{value}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}
