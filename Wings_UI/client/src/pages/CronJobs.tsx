import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api, type ScheduledTask, type ScheduledTaskDraft, type ScheduledTaskKind, type ScheduledTaskTemplate, type SchedulePreset } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHero, PageMetricCard } from "@/components/page-shell";

const KIND_LABELS: Record<ScheduledTaskKind, string> = {
  agent: "Agent",
  command: "Command",
  chat: "Chat",
  webhook: "Webhook",
  macro: "Macro",
};

const DEFAULT_DRAFT: ScheduledTaskDraft = {
  name: "Daily readiness check",
  kind: "agent",
  scheduleMode: "cron",
  cronExpression: "0 9 * * 1-5",
  timezone: "Asia/Bangkok",
  intervalMs: 15 * 60_000,
  prompt: "Run an autonomous Wings Of World readiness check, inspect blockers, and write a concise evidence summary with next actions.",
  owner: "ops",
  enabled: true,
};

function fmt(value?: string) {
  return value ? new Date(value).toLocaleString() : "-";
}

function fmtInterval(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours}h`;
  return `${hours / 24}d`;
}

function statusVariant(status?: ScheduledTask["lastStatus"]) {
  if (status === "success") return "default";
  if (status === "error") return "destructive";
  return "secondary";
}

function makeBody(draft: ScheduledTaskDraft): ScheduledTaskDraft {
  return {
    ...draft,
    name: draft.name.trim() || "Untitled schedule",
    timezone: draft.timezone?.trim() || "Asia/Bangkok",
    prompt: draft.kind === "webhook" ? undefined : draft.prompt?.trim(),
    webhookUrl: draft.kind === "webhook" ? draft.webhookUrl?.trim() : undefined,
    webhookPayload: draft.kind === "webhook" ? draft.webhookPayload : undefined,
  };
}

export default function CronJobsPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [presets, setPresets] = useState<SchedulePreset[]>([]);
  const [templates, setTemplates] = useState<ScheduledTaskTemplate[]>([]);
  const [draft, setDraft] = useState<ScheduledTaskDraft>(DEFAULT_DRAFT);
  const [nextRuns, setNextRuns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [runningId, setRunningId] = useState("");
  const [registeringId, setRegisteringId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listScheduledTasks();
      setTasks(data.tasks);
      setPresets(data.presets);
      setTemplates(data.templates || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    const enabled = tasks.filter((task) => task.enabled);
    const failing = tasks.filter((task) => task.lastStatus === "error");
    const agent = tasks.filter((task) => task.kind === "agent");
    return { enabled, failing, agent };
  }, [tasks]);

  const applyPreset = (preset: SchedulePreset) => {
    setDraft((current) => ({
      ...current,
      scheduleMode: preset.scheduleMode,
      intervalMs: preset.intervalMs ?? current.intervalMs,
      cronExpression: preset.cronExpression ?? current.cronExpression,
    }));
  };

  const applyTemplate = (template: ScheduledTaskTemplate) => {
    setDraft({
      ...DEFAULT_DRAFT,
      ...template.task,
      timezone: template.task.timezone || DEFAULT_DRAFT.timezone,
      intervalMs: template.task.intervalMs ?? DEFAULT_DRAFT.intervalMs,
    });
    setNextRuns([]);
    toast.success(`${template.label} loaded`);
  };

  const preview = async () => {
    setPreviewing(true);
    try {
      const data = await api.previewScheduledTask(makeBody(draft));
      setNextRuns(data.nextRuns);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPreviewing(false);
    }
  };

  const create = async () => {
    setSaving(true);
    try {
      await api.addScheduledTask(makeBody(draft));
      setNextRuns([]);
      await load();
      toast.success("Cron job created");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (task: ScheduledTask, enabled: boolean) => {
    try {
      await api.updateScheduledTask(task.id, { ...task, enabled });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const runNow = async (task: ScheduledTask) => {
    setRunningId(task.id);
    try {
      const data = await api.runScheduledTask(task.id);
      await load();
      toast.success(data.outcome.summary);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunningId("");
    }
  };

  const registerBackend = async (task: ScheduledTask) => {
    setRegisteringId(task.id);
    try {
      await api.registerBackendScheduledTask(task.id);
      await load();
      toast.success("Registered in Wings_Backend cron");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRegisteringId("");
    }
  };

  const remove = async (task: ScheduledTask) => {
    try {
      await api.deleteScheduledTask(task.id);
      await load();
      toast.success("Cron job deleted");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHero
        eyebrow="Automation schedule"
        title="Cron Jobs"
        description="Run commands, prompts, webhooks, and macros on a professional schedule with previewed next runs and execution history."
        status={{
          label: loading ? "syncing" : `${stats.enabled.length} active`,
          variant: stats.failing.length ? "destructive" : "secondary",
        }}
        actions={(
          <Button variant="secondary" className="rounded-full" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PageMetricCard title="Active" value={String(stats.enabled.length)} detail="Schedules currently allowed to run." icon={CalendarClock} tone={stats.enabled.length ? "ready" : "neutral"} />
          <PageMetricCard title="Agent jobs" value={String(stats.agent.length)} detail="Autonomous schedules that run Hermes or the Wings agent." icon={Zap} tone="ready" />
          <PageMetricCard title="Failures" value={String(stats.failing.length)} detail="Jobs whose last run failed." icon={ShieldAlert} tone={stats.failing.length ? "warning" : "ready"} />
          <PageMetricCard title="Total" value={String(tasks.length)} detail="All saved automation schedules." icon={Clock3} tone="neutral" />
        </div>
      </PageHero>

      <div className="grid gap-6 xl:grid-cols-[420px,1fr]">
        <Card className="rounded-[1.5rem] shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="text-xl">Create job</CardTitle>
            <CardDescription>Use agent jobs for autonomous work and command jobs when an approval trail is required.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Job name" />

            {templates.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Agent templates</div>
                <div className="flex flex-wrap gap-2">
                  {templates.map((template) => (
                    <Button key={template.id} type="button" variant="outline" className="rounded-full" onClick={() => applyTemplate(template)}>
                      {template.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm font-medium">Kind</div>
              <div className="flex flex-wrap gap-2">
                {(["agent", "command", "chat", "webhook", "macro"] as const).map((kind) => (
                  <Button key={kind} type="button" variant={draft.kind === kind ? "default" : "outline"} className="rounded-full" onClick={() => setDraft({ ...draft, kind })}>
                    {KIND_LABELS[kind]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Schedule</div>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <Button key={preset.id} type="button" variant="outline" className="rounded-full" onClick={() => applyPreset(preset)}>
                    {preset.label}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant={draft.scheduleMode === "interval" ? "default" : "outline"} className="rounded-full" onClick={() => setDraft({ ...draft, scheduleMode: "interval" })}>
                  Interval
                </Button>
                <Button type="button" variant={draft.scheduleMode === "cron" ? "default" : "outline"} className="rounded-full" onClick={() => setDraft({ ...draft, scheduleMode: "cron" })}>
                  Cron
                </Button>
              </div>
            </div>

            {draft.scheduleMode === "cron" ? (
              <div className="grid gap-3 sm:grid-cols-[1fr,150px]">
                <Input value={draft.cronExpression || ""} onChange={(e) => setDraft({ ...draft, cronExpression: e.target.value })} placeholder="0 9 * * 1-5" />
                <Input value={draft.timezone || ""} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} placeholder="Asia/Bangkok" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {[5, 15, 60, 360, 1440].map((minutes) => (
                  <Button key={minutes} type="button" variant={draft.intervalMs === minutes * 60_000 ? "default" : "outline"} className="rounded-full" onClick={() => setDraft({ ...draft, intervalMs: minutes * 60_000 })}>
                    {minutes < 60 ? `${minutes}m` : minutes === 1440 ? "1d" : `${minutes / 60}h`}
                  </Button>
                ))}
              </div>
            )}

            {draft.kind === "webhook" ? (
              <>
                <Input value={draft.webhookUrl || ""} onChange={(e) => setDraft({ ...draft, webhookUrl: e.target.value })} placeholder="https://example.com/hook" />
                <Textarea value={String(draft.webhookPayload || "")} onChange={(e) => setDraft({ ...draft, webhookPayload: e.target.value })} placeholder='{"source":"wings-of-world"}' className="min-h-[100px]" />
              </>
            ) : (
              <>
                <Textarea
                  value={draft.prompt || ""}
                  onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                  placeholder={draft.kind === "agent" ? "Autonomous agent task..." : "Command, prompt, or macro name..."}
                  className="min-h-[150px]"
                />
                {draft.kind === "agent" && (
                  <Input value={draft.model || ""} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder="Model override (optional)" />
                )}
                <Input value={draft.owner || ""} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} placeholder="Owner" />
              </>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={preview} disabled={previewing} className="rounded-full">
                {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Preview
              </Button>
              <Button onClick={create} disabled={saving} className="rounded-full">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create job
              </Button>
            </div>

            {nextRuns.length > 0 && (
              <div className="space-y-2 rounded-[1rem] border bg-muted/20 p-4">
                <div className="text-sm font-medium">Next runs</div>
                {nextRuns.map((run) => (
                  <div key={run} className="text-sm text-muted-foreground">{fmt(run)}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem] shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="text-xl">Job control</CardTitle>
            <CardDescription>Pause, run now, and inspect the last result for every automation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            {tasks.length === 0 && (
              <div className="rounded-[1.25rem] border border-dashed p-5 text-sm text-muted-foreground">
                No cron jobs yet.
              </div>
            )}
            {tasks.map((task) => (
              <JobCard
                key={task.id}
                task={task}
                running={runningId === task.id}
                registering={registeringId === task.id}
                onToggle={(enabled) => toggle(task, enabled)}
                onRun={() => runNow(task)}
                onRegisterBackend={() => registerBackend(task)}
                onDelete={() => remove(task)}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function JobCard({
  task,
  running,
  registering,
  onToggle,
  onRun,
  onRegisterBackend,
  onDelete,
}: {
  task: ScheduledTask;
  running: boolean;
  registering: boolean;
  onToggle: (enabled: boolean) => void;
  onRun: () => void;
  onRegisterBackend: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-4 rounded-[1.25rem] border bg-card/80 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={task.enabled ? "default" : "secondary"} className="rounded-full">
              {task.enabled ? "active" : "paused"}
            </Badge>
            <Badge variant="outline" className="rounded-full">{KIND_LABELS[task.kind]}</Badge>
            <Badge variant={statusVariant(task.lastStatus)} className="rounded-full">
              {task.lastStatus || "never run"}
            </Badge>
          </div>
          <div className="break-words text-lg font-medium">{task.name}</div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{task.id}</span>
            <span>{task.scheduleMode === "cron" ? `${task.cronExpression} - ${task.timezone}` : `Every ${fmtInterval(task.intervalMs)}`}</span>
            {task.owner && <span>Owner: {task.owner}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={task.enabled} onCheckedChange={onToggle} />
          {task.enabled ? <PlayCircle className="h-4 w-4 text-primary" /> : <PauseCircle className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Inline title="Next" value={fmt(task.nextRunAt)} />
        <Inline title="Last" value={fmt(task.lastRunAt)} />
        <Inline title="Runs" value={`${task.runCount || 0} / ${task.failureCount || 0} failed`} />
      </div>

      {task.prompt && (
        <div className="line-clamp-3 rounded-[1rem] border bg-muted/15 p-3 text-sm text-muted-foreground">{task.prompt}</div>
      )}
      {task.lastSummary && (
        <div className="rounded-[1rem] border bg-muted/20 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Last result
          </div>
          <div className="text-muted-foreground">{task.lastSummary}</div>
        </div>
      )}

      {task.recentRuns && task.recentRuns.length > 0 && (
        <div className="space-y-2 rounded-[1rem] border bg-muted/15 p-3">
          <div className="text-sm font-medium">Evidence trail</div>
          {task.recentRuns.slice(0, 3).map((run) => (
            <div key={`${run.at}-${run.status}`} className="grid gap-1 border-t pt-2 text-xs first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{run.status === "success" ? "Success" : "Error"}</span>
                <span className="text-muted-foreground">{fmt(run.at)}{typeof run.durationMs === "number" ? ` - ${run.durationMs}ms` : ""}</span>
              </div>
              <div className="line-clamp-2 text-muted-foreground">{run.summary}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="rounded-full" onClick={onRun} disabled={running}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
          Run now
        </Button>
        {task.kind === "agent" && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onRegisterBackend} disabled={registering}>
            {registering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
            Register backend
          </Button>
        )}
        <Button variant="outline" size="sm" className="rounded-full" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}

function Inline({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[0.875rem] border bg-background/60 p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}
