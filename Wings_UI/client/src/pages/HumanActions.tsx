import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { api, type CommandPlan, type HumanTask } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { PageHero, PageMetricCard } from "@/components/page-shell";
import {
  Bot,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  GitBranch,
  Loader2,
  PlayCircle,
  Route,
  ShieldAlert,
  TimerReset,
  Trash2,
  UserRoundCog,
  WandSparkles,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

type StatusFilter = "open" | "all" | HumanTask["status"];

const routeMeta: Record<CommandPlan["route"], { label: string; icon: typeof Route }> = {
  chat: { label: "Chat", icon: Bot },
  workflow: { label: "Workflow", icon: GitBranch },
  tool: { label: "Tool", icon: Wrench },
  human: { label: "Human", icon: UserRoundCog },
};

const statusLabels: Record<HumanTask["status"], string> = {
  pending: "Pending",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

const priorityVariant: Record<HumanTask["priority"], "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};

const riskVariant: Record<CommandPlan["riskLevel"], "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function taskProgress(task: HumanTask, completedSteps: Record<string, Record<number, boolean>>) {
  const count = task.command?.checklist.length || 0;
  if (!count) return 0;
  const done = Object.values(completedSteps[task.id] || {}).filter(Boolean).length;
  return Math.round((done / count) * 100);
}

export default function HumanActionsPage() {
  const [tasks, setTasks] = useState<HumanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState<HumanTask["priority"]>("high");
  const [commandText, setCommandText] = useState("");
  const [owner, setOwner] = useState("");
  const [planned, setPlanned] = useState<CommandPlan | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<string, Record<number, boolean>>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listHumanTasks();
      setTasks(data.tasks);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleTasks = useMemo(() => {
    if (statusFilter === "all") return tasks;
    if (statusFilter === "open") {
      return tasks.filter((task) => task.status !== "done");
    }
    return tasks.filter((task) => task.status === statusFilter);
  }, [tasks, statusFilter]);

  const createTask = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.addHumanTask({
        title: title.trim(),
        details: details.trim() || undefined,
        priority,
        source: "app:manual-command",
      });
      setTitle("");
      setDetails("");
      setPriority("high");
      await load();
      toast.success("Manual task created");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const planCommand = async () => {
    if (!commandText.trim()) return;
    setPlanning(true);
    try {
      const data = await api.planCommand({
        command: commandText.trim(),
        owner: owner.trim() || undefined,
        source: "command-center",
      });
      setPlanned(data.plan);
      toast.success("Command plan ready");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPlanning(false);
    }
  };

  const dispatchCommand = async () => {
    if (!commandText.trim()) return;
    setDispatching(true);
    try {
      await api.dispatchCommand({
        command: commandText.trim(),
        owner: owner.trim() || undefined,
        source: "command-center",
      });
      setCommandText("");
      setOwner("");
      setPlanned(null);
      await load();
      toast.success("Command dispatched");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDispatching(false);
    }
  };

  const updateStatus = async (task: HumanTask, status: HumanTask["status"]) => {
    try {
      await api.updateHumanTask(task.id, { status });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const removeTask = async (task: HumanTask) => {
    try {
      await api.deleteHumanTask(task.id);
      await load();
      toast.success("Task deleted");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleStep = (taskId: string, index: number, checked: boolean) => {
    setCompletedSteps((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] || {}),
        [index]: checked,
      },
    }));
  };

  const openTasks = tasks.filter((task) => task.status !== "done");
  const commandTasks = tasks.filter((task) => task.command);
  const criticalTasks = tasks.filter((task) => task.priority === "critical" && task.status !== "done");
  const blockedTasks = tasks.filter((task) => task.status === "blocked");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHero
        eyebrow="Operations command queue"
        title="Command Center"
        description="Turn plain requests into routed work orders with risk level, checklist, acceptance criteria, and clear execution path."
        status={{
          label: loading ? "syncing" : `${openTasks.length} open`,
          variant: criticalTasks.length > 0 ? "destructive" : "secondary",
        }}
        actions={(
          <Button variant="secondary" className="rounded-full" onClick={load} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Refresh queue
          </Button>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PageMetricCard
            title="Open"
            value={String(openTasks.length)}
            detail="Command and manual tasks still waiting on execution."
            icon={UserRoundCog}
            tone={openTasks.length ? "warning" : "ready"}
          />
          <PageMetricCard
            title="Commanded"
            value={String(commandTasks.length)}
            detail="Tasks created through the command planner."
            icon={Route}
            tone={commandTasks.length ? "ready" : "neutral"}
          />
          <PageMetricCard
            title="Critical"
            value={String(criticalTasks.length)}
            detail="High urgency work that should be handled first."
            icon={ShieldAlert}
            tone={criticalTasks.length ? "warning" : "ready"}
          />
          <PageMetricCard
            title="Blocked"
            value={String(blockedTasks.length)}
            detail="Waiting on access, approval, evidence, or outside conditions."
            icon={TimerReset}
            tone={blockedTasks.length ? "warning" : "neutral"}
          />
        </div>
      </PageHero>

      <div className="grid gap-6 xl:grid-cols-[420px,1fr]">
        <div className="space-y-6">
          <Card className="rounded-[1.5rem] shadow-sm">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-xl">
                <WandSparkles className="h-5 w-5 text-primary" />
                Command intake
              </CardTitle>
              <CardDescription>
                Write the outcome you want. Wings Of World will classify the work before it enters the queue.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <Textarea
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                placeholder="Restart the production Telegram bridge, verify health, and record the result."
                className="min-h-[150px]"
              />
              <Input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Owner or team"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={planCommand}
                  disabled={planning || !commandText.trim()}
                  className="rounded-full"
                >
                  {planning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />}
                  Plan
                </Button>
                <Button
                  onClick={dispatchCommand}
                  disabled={dispatching || !commandText.trim()}
                  className="rounded-full"
                >
                  {dispatching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                  Dispatch
                </Button>
              </div>
            </CardContent>
          </Card>

          {planned && <CommandPreview plan={planned} />}

          <Card className="rounded-[1.5rem] shadow-sm">
            <CardHeader className="border-b">
              <CardTitle className="text-xl">Manual fallback</CardTitle>
              <CardDescription>
                Use this when the work is already understood and only needs tracking.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Confirm server backup finished"
              />
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Completion signal, context, or acceptance criteria..."
                className="min-h-[110px]"
              />
              <div className="space-y-2">
                <div className="text-sm font-medium">Priority</div>
                <div className="flex flex-wrap gap-2">
                  {(["medium", "high", "critical"] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={priority === value ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => setPriority(value)}
                    >
                      {value}
                    </Button>
                  ))}
                </div>
              </div>
              <Button onClick={createTask} disabled={saving || !title.trim()} className="rounded-full">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add manual task
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[1.5rem] shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="text-xl">Execution queue</CardTitle>
            <CardDescription>
              Track live command work from intake through verification and closure.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              {(["open", "all", "pending", "in_progress", "blocked", "done"] as const).map((value) => (
                <Button
                  key={value}
                  variant={statusFilter === value ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setStatusFilter(value)}
                >
                  {value}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <InlineMetric
                title="Visible"
                value={String(visibleTasks.length)}
                detail="Tasks shown in this queue view."
              />
              <InlineMetric
                title="Automatable"
                value={String(visibleTasks.filter((task) => task.command?.automation).length)}
                detail="Tasks with a direct app route."
              />
              <InlineMetric
                title="Done"
                value={String(tasks.filter((task) => task.status === "done").length)}
                detail="Closed work orders."
              />
            </div>

            {visibleTasks.length === 0 && (
              <div className="rounded-[1.25rem] border border-dashed p-5 text-sm text-muted-foreground">
                No tasks in this filter.
              </div>
            )}

            {visibleTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                progress={taskProgress(task, completedSteps)}
                completedSteps={completedSteps[task.id] || {}}
                onToggleStep={(index, checked) => toggleStep(task.id, index, checked)}
                onStatus={(status) => updateStatus(task, status)}
                onDelete={() => removeTask(task)}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CommandPreview({ plan }: { plan: CommandPlan }) {
  const RouteIcon = routeMeta[plan.route].icon;
  return (
    <Card className="rounded-[1.5rem] shadow-sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-xl">
          <RouteIcon className="h-5 w-5 text-primary" />
          Planned route
        </CardTitle>
        <CardDescription>{plan.title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full">
            {routeMeta[plan.route].label}
          </Badge>
          <Badge variant={riskVariant[plan.riskLevel]} className="rounded-full">
            {plan.riskLevel} risk
          </Badge>
          <Badge variant={priorityVariant[plan.priority]} className="rounded-full">
            {plan.priority}
          </Badge>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{plan.objective}</p>
        <Checklist title="Checklist" items={plan.checklist} />
        <Checklist title="Acceptance" items={plan.acceptanceCriteria} />
        <div className="rounded-[1rem] border bg-muted/20 p-4 text-sm">
          <div className="font-medium">Next step</div>
          <div className="mt-1 text-muted-foreground">{plan.suggestedNextStep}</div>
        </div>
        {plan.automation?.href && (
          <Link href={plan.automation.href}>
            <Button variant="outline" className="rounded-full">
              <ExternalLink className="mr-2 h-4 w-4" />
              {plan.automation.label}
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function TaskCard({
  task,
  progress,
  completedSteps,
  onToggleStep,
  onStatus,
  onDelete,
}: {
  task: HumanTask;
  progress: number;
  completedSteps: Record<number, boolean>;
  onToggleStep: (index: number, checked: boolean) => void;
  onStatus: (status: HumanTask["status"]) => void;
  onDelete: () => void;
}) {
  const plan = task.command;
  const RouteIcon = plan ? routeMeta[plan.route].icon : UserRoundCog;

  return (
    <div className="space-y-4 rounded-[1.25rem] border bg-card/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={priorityVariant[task.priority]} className="rounded-full">
              {task.priority}
            </Badge>
            <Badge variant="outline" className="rounded-full">
              {statusLabels[task.status]}
            </Badge>
            {plan && (
              <Badge variant={riskVariant[plan.riskLevel]} className="rounded-full">
                {plan.riskLevel} risk
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 font-medium">
            <RouteIcon className="h-4 w-4 shrink-0 text-primary" />
            <span className="break-words">{task.title}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{task.id}</span>
            <span>Source: {task.source}</span>
            {task.owner && <span>Owner: {task.owner}</span>}
          </div>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={onDelete} aria-label="Delete task">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {plan ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">{plan.objective}</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Execution progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
          <div className="space-y-2">
            {plan.checklist.map((item, index) => (
              <label key={`${task.id}-step-${index}`} className="flex gap-3 rounded-[0.875rem] border bg-background/60 p-3 text-sm">
                <Checkbox
                  checked={completedSteps[index] === true}
                  onCheckedChange={(checked) => onToggleStep(index, checked === true)}
                  className="mt-0.5"
                />
                <span className="leading-5 text-muted-foreground">{item}</span>
              </label>
            ))}
          </div>
          <Checklist title="Acceptance" items={plan.acceptanceCriteria} />
          <div className="rounded-[1rem] border bg-muted/20 p-4 text-sm">
            <div className="font-medium">Next step</div>
            <div className="mt-1 text-muted-foreground">{plan.suggestedNextStep}</div>
          </div>
          {plan.automation?.href && (
            <Link href={plan.automation.href}>
              <Button variant="outline" size="sm" className="rounded-full">
                <ExternalLink className="mr-2 h-4 w-4" />
                {plan.automation.label}
              </Button>
            </Link>
          )}
        </div>
      ) : (
        task.details && (
          <div className="whitespace-pre-wrap rounded-[1rem] border bg-muted/15 p-4 text-sm text-muted-foreground">
            {task.details}
          </div>
        )
      )}

      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>Created: {formatDate(task.createdAt)}</div>
        <div>Updated: {formatDate(task.updatedAt)}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["pending", "in_progress", "blocked", "done"] as const).map((nextStatus) => (
          <Button
            key={nextStatus}
            variant={task.status === nextStatus ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => onStatus(nextStatus)}
            disabled={task.status === "done" && nextStatus !== "done"}
          >
            {statusLabels[nextStatus]}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="leading-5">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InlineMetric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1rem] border bg-muted/20 p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}
