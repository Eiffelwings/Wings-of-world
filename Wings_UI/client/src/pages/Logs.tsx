import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { api, type AuditEntry, type ExecutionRecord, type SystemReadiness } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHero } from "@/components/page-shell";
import { Activity, AlertCircle, Loader2, Server, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

function StatCard({
  title,
  value,
  detail,
  tone,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  tone: "ready" | "warning" | "neutral";
  icon: ReactNode;
}) {
  const styles =
    tone === "ready"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/5 text-amber-700"
        : "border-border bg-card text-foreground";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${styles}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{title}</div>
        <div className="rounded-full border bg-background/70 p-2">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function LogRow({
  title,
  subtitle,
  meta,
  status,
  detail,
}: {
  title: string;
  subtitle: string;
  meta: string[];
  status: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="font-medium">{title}</div>
          <div className="text-sm text-muted-foreground">{subtitle}</div>
        </div>
        <Badge variant={status === "error" ? "destructive" : "secondary"} className="rounded-full px-3 py-1">
          {status}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {meta.map((item) => (
          <span key={item} className="rounded-full border bg-muted/40 px-2.5 py-1">
            {item}
          </span>
        ))}
      </div>
      {detail ? (
        <div className="mt-3 rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap text-muted-foreground">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export default function LogsPage() {
  const [health, setHealth] = useState<any>(null);
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [healthData, readinessData, auditData, executionData] = await Promise.all([
        api.getSystemHealth(),
        api.getSystemReadiness(),
        api.listAudit(100),
        api.listExecutions({ limit: 100 }),
      ]);
      setHealth(healthData);
      setReadiness(readinessData);
      setAudit(auditData.entries);
      setExecutions(executionData.entries);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const systemAudit = useMemo(
    () => audit.filter((entry) => entry.area === "system" || entry.area === "tool"),
    [audit],
  );

  const summary = useMemo(() => {
    const errors = systemAudit.filter((entry) => entry.status === "error").length;
    const executionErrors = executions.filter((entry) => entry.status === "error").length;
    return {
      systemAudit: systemAudit.length,
      executions: executions.length,
      errors: errors + executionErrors,
      readiness: readiness?.overall || "unknown",
    };
  }, [executions, readiness?.overall, systemAudit]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHero
        eyebrow="System activity"
        title="Logs"
        description="Recent system activity, audit events, and execution history in one place."
        status={{
          label: loading ? "syncing" : summary.errors > 0 ? "attention" : "live",
          variant: loading ? "outline" : summary.errors > 0 ? "destructive" : "secondary",
        }}
        actions={(
          <>
            <Link href="/system">
              <Button variant="secondary" className="rounded-full">
                System
              </Button>
            </Link>
            <Link href="/history">
              <Button variant="secondary" className="rounded-full">
                History
              </Button>
            </Link>
            <Button variant="ghost" className="rounded-full" onClick={load} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Refresh
            </Button>
          </>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="System"
            value={health?.ok ? "healthy" : "unknown"}
            detail={health?.timestamp ? `Checked ${new Date(health.timestamp).toLocaleString()}` : "No health snapshot"}
            tone={health?.ok ? "ready" : "warning"}
            icon={<Server className="h-4 w-4" />}
          />
          <StatCard
            title="Readiness"
            value={summary.readiness}
            detail={`${readiness?.summary.ready || 0} ready / ${readiness?.summary.warning || 0} warning / ${readiness?.summary.error || 0} error`}
            tone={summary.readiness === "ready" ? "ready" : "warning"}
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          <StatCard
            title="Audit entries"
            value={String(summary.systemAudit)}
            detail="System and tool events from the local audit trail"
            tone="neutral"
            icon={<Activity className="h-4 w-4" />}
          />
          <StatCard
            title="Errors"
            value={String(summary.errors)}
            detail="Audit and execution failures in the latest sample"
            tone={summary.errors > 0 ? "warning" : "ready"}
            icon={<AlertCircle className="h-4 w-4" />}
          />
        </div>
      </PageHero>

      <Card>
        <CardHeader>
          <CardTitle>Live snapshot</CardTitle>
          <CardDescription>Current runtime, provider, and Telegram state.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
          <div>Uptime: <code>{typeof health?.uptimeSeconds === "number" ? `${health.uptimeSeconds}s` : "-"}</code></div>
          <div>Node: <code>{health?.node || "-"}</code></div>
          <div>Platform: <code>{health?.platform || "-"}</code></div>
          <div>Provider: <code>{health?.provider?.primary?.provider || "-"}</code> / <code>{health?.provider?.primary?.model || "-"}</code></div>
          <div>Fallback: <code>{health?.provider?.fallback?.enabled ? `${health.provider.fallback.provider} / ${health.provider.fallback.model}` : "disabled"}</code></div>
          <div>Telegram: <code>{health?.telegram?.lastError || "healthy"}</code></div>
          <div>Linked chats: <code>{health?.telegram?.linkedChats ?? 0}</code></div>
          <div>Readiness: <code>{readiness?.overall || "-"}</code></div>
          <div>Last audit refresh: <code>{health?.timestamp ? new Date(health.timestamp).toLocaleString() : "-"}</code></div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>System audit</CardTitle>
            <CardDescription>Events written by the local runtime as it changes state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {systemAudit.length === 0 ? (
              <div className="text-sm text-muted-foreground">No system audit entries yet.</div>
            ) : (
              systemAudit.slice(0, 25).map((entry) => (
                <LogRow
                  key={entry.id}
                  title={`${entry.area} / ${entry.action}`}
                  subtitle={entry.summary}
                  status={entry.status}
                  meta={[
                    new Date(entry.timestamp).toLocaleString(),
                    entry.targetId ? `target ${entry.targetId}` : "no target",
                  ]}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent executions</CardTitle>
            <CardDescription>Most recent chat, workflow, and tool runs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {executions.length === 0 ? (
              <div className="text-sm text-muted-foreground">No execution records yet.</div>
            ) : (
              executions.slice(0, 25).map((entry) => (
                <LogRow
                  key={entry.id}
                  title={entry.title}
                  subtitle={entry.summary}
                  status={entry.status}
                  meta={[
                    new Date(entry.createdAt).toLocaleString(),
                    entry.kind,
                    entry.model ? `model ${entry.model}` : "model unknown",
                  ]}
                  detail={entry.outputPreview || entry.inputPreview}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What this page covers</CardTitle>
          <CardDescription>Use this when you want activity, not configuration.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="font-medium">Audit trail</div>
            <div className="mt-1 text-muted-foreground">Who changed what, and whether it succeeded.</div>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="font-medium">Execution trail</div>
            <div className="mt-1 text-muted-foreground">Recent chat, workflow, and tool runs with outputs.</div>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="font-medium">Health snapshot</div>
            <div className="mt-1 text-muted-foreground">Runtime, provider, readiness, and Telegram state.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
