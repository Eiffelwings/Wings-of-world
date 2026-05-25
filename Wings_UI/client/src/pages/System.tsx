import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { api, type BackendGatewayStatus, type SystemExportBundle, type SystemReadiness } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHero } from "@/components/page-shell";
import { CheckCircle2, Loader2, Lock, Power, Send, ServerCog, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

export default function SystemPage() {
  const [health, setHealth] = useState<any>(null);
  const [resources, setResources] = useState<any>(null);
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendGatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportBundle, setExportBundle] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importingMode, setImportingMode] = useState<"replace" | "merge" | null>(null);
  const [startingBackend, setStartingBackend] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    setLoading(true);
    setLoadError("");
    const [healthResult, resourceResult, readinessResult, backendResult] = await Promise.allSettled([
      api.getSystemHealth(),
      api.getSystemResources(),
      api.getSystemReadiness(),
      api.getBackendStatus(),
    ]);
    const failures: string[] = [];

    if (healthResult.status === "fulfilled") setHealth(healthResult.value);
    else failures.push(`Health: ${formatLoadFailure(healthResult.reason)}`);

    if (resourceResult.status === "fulfilled") setResources(resourceResult.value);
    else failures.push(`Resources: ${formatLoadFailure(resourceResult.reason)}`);

    if (readinessResult.status === "fulfilled") setReadiness(readinessResult.value);
    else failures.push(`Readiness: ${formatLoadFailure(readinessResult.reason)}`);

    if (backendResult.status === "fulfilled") setBackendStatus(backendResult.value);
    else failures.push(`Backend: ${formatLoadFailure(backendResult.reason)}`);

    if (failures.length > 0) {
      const message = failures.join(" | ");
      setLoadError(message);
      toast.error(message);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const exportData = async () => {
    setExporting(true);
    try {
      const bundle = await api.exportSystemData();
      setExportBundle(JSON.stringify(bundle, null, 2));
      toast.success("Data bundle exported");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  };

  const importData = async (mode: "replace" | "merge") => {
    let bundle: SystemExportBundle | Record<string, unknown>;
    try {
      bundle = JSON.parse(importText || "{}");
    } catch (e: any) {
      toast.error(`Invalid JSON: ${e.message}`);
      return;
    }

    if (
      !window.confirm(
        mode === "replace"
          ? "Replace current Wings Of World data with this bundle?"
          : "Merge this bundle into current Wings Of World data?",
      )
    ) {
      return;
    }

    setImportingMode(mode);
    try {
      const result = await api.importSystemData(bundle, mode);
      toast.success(
        `Imported ${result.imported.workflows} workflow(s), ${result.imported.memory} memory item(s), and ${result.imported.chatSessions} chat session(s)`,
      );
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImportingMode(null);
    }
  };

  const startBackendGateway = async () => {
    setStartingBackend(true);
    try {
      const result = await api.startBackendGateway();
      setBackendStatus(result.status);
      toast.success(result.alreadyRunning ? "Backend gateway is already running" : "Backend gateway start requested");
    } catch (e: any) {
      toast.error(e.message);
      try {
        setBackendStatus(await api.getBackendStatus());
      } catch {
        // Keep the original error visible.
      }
    } finally {
      setStartingBackend(false);
    }
  };

  const uiReady = Boolean(health?.ok && readiness && readiness.summary.error === 0);
  const backendReady = Boolean(backendStatus?.running && backendStatus.ready);
  const backendState = backendReady ? "ready" : backendStatus?.running ? "degraded" : "offline";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHero
        eyebrow="System diagnostics"
        title="System"
        description="Local runtime health, readiness checks, resource telemetry, and data portability controls for the whole Wings Of World workspace."
        status={{
          label: loading ? "syncing" : health?.ok ? "healthy" : "checking",
          variant: loading ? "outline" : health?.ok ? "secondary" : "destructive",
        }}
        actions={(
          <>
            <Link href="/logs">
              <Button variant="secondary" className="rounded-full">Logs</Button>
            </Link>
            <Button variant="secondary" className="rounded-full" onClick={load} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Refresh checks
            </Button>
          </>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            title="Server"
            value={health?.ok ? "healthy" : "unknown"}
            detail={health?.ok ? "Runtime responding" : "No health signal"}
            tone={health?.ok ? "ready" : "warning"}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <StatCard
            title="Readiness"
            value={readiness?.overall || "-"}
            detail={`${readiness?.summary.ready || 0} ready / ${readiness?.summary.warning || 0} warning`}
            tone={readiness?.overall === "ready" ? "ready" : "warning"}
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          <StatCard
            title="App Auth"
            value={health?.appAuth?.enabled ? "enabled" : "disabled"}
            detail={health?.appAuth?.enabled ? `${health?.appAuth?.activeSessions || 0} active session(s)` : "UI still open until enabled"}
            tone={health?.appAuth?.enabled ? "ready" : "warning"}
            icon={<Lock className="h-4 w-4" />}
          />
          <StatCard
            title="Telegram"
            value={health?.telegram?.lastError ? "attention" : "ready"}
            detail={health?.telegram?.lastError || "Polling and delivery healthy"}
            tone={health?.telegram?.lastError ? "warning" : "ready"}
            icon={<Send className="h-4 w-4" />}
          />
          <StatCard
            title="Backend"
            value={backendStatus?.running ? "online" : "offline"}
            detail={backendStatus?.ready ? "Gateway ready" : backendStatus?.recommendedAction || "No gateway signal"}
            tone={backendStatus?.running && backendStatus?.ready ? "ready" : "warning"}
            icon={<ServerCog className="h-4 w-4" />}
          />
        </div>
      </PageHero>

      {loadError ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <TriangleAlert className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="space-y-1">
              <div className="font-medium">Some diagnostics failed to load</div>
              <div className="text-sm text-muted-foreground">{loadError}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Local Production Readiness</CardTitle>
          <CardDescription>
            Separates the web UI runtime from the optional backend gateway so the operator can see what is actually usable now.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <ReadinessScope
            title="Wings_UI"
            status={uiReady ? "ready" : readiness?.overall || "checking"}
            detail={
              uiReady
                ? "Local UI, API, provider route, storage, tools, and Telegram diagnostics are responding."
                : readiness?.checks.find((check) => check.status !== "ready")?.detail || "Waiting for readiness checks."
            }
            action={
              uiReady
                ? "Ready for local operation."
                : readiness?.checks.find((check) => check.status !== "ready")?.action || "Refresh checks after fixing the highlighted blocker."
            }
            tone={uiReady ? "ready" : "warning"}
          />
          <ReadinessScope
            title="Wings_Backend integration"
            status={backendState}
            detail={
              backendReady
                ? `Gateway ready at ${backendStatus?.gatewayUrl}`
                : backendStatus?.running
                  ? `Gateway is reachable at ${backendStatus?.gatewayUrl}, but readiness is not green.`
                  : `Gateway offline at ${backendStatus?.gatewayUrl || "unknown URL"}.`
            }
            action={
              backendReady
                ? "Backend bridge is ready."
                : backendStatus?.recommendedAction || "Start the backend gateway or run the displayed command manually."
            }
            tone={backendReady ? "ready" : "warning"}
          />
        </CardContent>
      </Card>

      {readiness?.summary.warning ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <TriangleAlert className="mt-0.5 h-5 w-5 text-amber-700" />
            <div className="space-y-1">
              <div className="font-medium">Operator attention recommended</div>
              <div className="text-sm text-muted-foreground">
                {readiness.checks.find((check) => check.status !== "ready")?.detail || "One or more checks still need action."}
              </div>
              <div className="text-xs text-muted-foreground">
                {readiness.checks.find((check) => check.status !== "ready")?.action || "Open Settings or the affected surface to close the remaining gap."}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Readiness Checks</CardTitle>
          <CardDescription>What is ready now, and what still needs action.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {readiness?.checks.map((check) => (
            <div key={check.id} className="rounded-2xl border p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{check.label}</div>
                <Badge variant={check.status === "ready" ? "default" : "secondary"} className="rounded-full px-3 py-1">
                  {check.status}
                </Badge>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{check.detail}</div>
              {check.action && (
                <div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">{check.action}</div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Backend Gateway</CardTitle>
              <CardDescription>
                Connect Wings_UI to Wings_Backend for multi-channel gateway and backend agent runtime.
              </CardDescription>
            </div>
            <Button
              variant={backendStatus?.running ? "secondary" : "default"}
              onClick={startBackendGateway}
              disabled={startingBackend || !backendStatus?.canStart || backendStatus?.running}
            >
              {startingBackend ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Power className="mr-2 h-4 w-4" />
              )}
              {backendStatus?.running ? "Gateway online" : "Start backend"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <BackendLine label="Gateway URL" value={backendStatus?.gatewayUrl || "-"} />
            <BackendLine
              label="Status"
              value={backendStatus?.running ? (backendStatus.ready ? "running and ready" : "running, readiness warning") : "not running"}
            />
            <BackendLine label="CLI source" value={backendStatus?.cli.source || "-"} />
            <BackendLine label="Backend root" value={backendStatus?.local.backendRoot || "-"} />
            <BackendLine label="Built dist" value={backendStatus?.local.distEntryExists ? backendStatus.local.distEntry || "yes" : "missing"} />
            <BackendLine label="Build scripts" value={backendStatus?.local.scriptsDirExists ? "present" : "missing"} />
            <BackendLine label="State dir" value={backendStatus?.stateDir || "-"} />
            <BackendLine label="Logs" value={backendStatus ? `${backendStatus.logs.stdout} | ${backendStatus.logs.stderr}` : "-"} />
          </div>
          <div className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Start command</div>
            <code className="mt-1 block break-all">{backendStatus?.cli.startCommand || "-"}</code>
          </div>
          {backendStatus?.recommendedAction ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-900">
              {backendStatus.recommendedAction}
            </div>
          ) : null}
          {backendStatus?.probes.healthz.error ? (
            <div className="text-xs text-muted-foreground">
              Last health probe: <code>{backendStatus.probes.healthz.error}</code>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resources</CardTitle>
          <CardDescription>Host, provider, memory, and protection state in one place.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>CPU Model: <code>{resources?.cpu?.model}</code></div>
          <div>CPU Cores: <code>{resources?.cpu?.cores}</code></div>
          <div>Memory: <code>{resources?.memory?.usedGb} / {resources?.memory?.totalGb} GB ({resources?.memory?.percent}%)</code></div>
          <div>Platform: <code>{health?.platform} {resources?.platform?.release} / {resources?.platform?.arch}</code></div>
          <div>Hostname: <code>{resources?.platform?.hostname}</code></div>
          <div>Data dir: <code className="break-all">{resources?.dataDir}</code></div>
          <div>Obsidian memory: <code>{resources?.obsidian?.enabled ? "enabled" : "disabled"}</code></div>
          <div>Obsidian vault: <code className="break-all">{resources?.obsidian?.vaultPath || "-"}</code></div>
          <div>Obsidian memory dir: <code className="break-all">{resources?.obsidian?.memoryDir || "-"}</code></div>
          <div>Human tasks: <code>{resources?.humanTasks?.open ?? 0} open / {resources?.humanTasks?.total ?? 0} total</code></div>
          <div>Workspace roots: <code className="break-all">{resources?.workspaceRoots?.join(" | ")}</code></div>
          <div>Provider configured: <code>{health?.providerConfigured ? "yes" : "no"}</code></div>
          <div>App auth: <code>{health?.appAuth?.enabled ? `enabled (${health?.appAuth?.activeSessions ?? 0} session)` : "disabled"}</code></div>
          <div>Primary provider: <code>{health?.provider?.primary?.provider || "-"}</code> / <code>{health?.provider?.primary?.model || "-"}</code></div>
          <div>Primary API mode: <code>{health?.provider?.primary?.apiMode || "-"}</code></div>
          <div>Fallback provider: <code>{health?.provider?.fallback?.enabled ? `${health?.provider?.fallback?.provider} / ${health?.provider?.fallback?.model}` : "disabled"}</code></div>
          <div>Active provider issue: <code className="break-all">{health?.provider?.lastIssue?.summary || "-"}</code></div>
          <div>Last provider issue seen: <code className="break-all">{health?.provider?.lastIssueHistory?.summary || "-"}</code></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Telegram Bridge</CardTitle>
          <CardDescription>
            Let Wings Of World answer messages directly in Telegram using the same chat and memory engine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>Enabled: <code>{health?.telegram?.enabled ? "yes" : "no"}</code></div>
          <div>Linked chats: <code>{health?.telegram?.linkedChats ?? 0}</code></div>
          <div>Last poll: <code>{health?.telegram?.lastPollAt || "-"}</code></div>
          <div>Error: <code className="break-all">{health?.telegram?.lastError || "-"}</code></div>
          <div>Action: <code className="break-all">{health?.telegram?.recommendedAction || "-"}</code></div>
          <div>Local poller lock: <code>{health?.telegram?.localPollerLock?.ownedByCurrentProcess ? "owned by current process" : health?.telegram?.localPollerLock ? "owned by another process" : "-"}</code></div>
          <div>Delivery audit: <code>system.telegram-delivery</code> and <code>chat.telegram-generate</code> entries appear in History/Audit.</div>
          <div className="text-muted-foreground">
            Set <code>TELEGRAM_BOT_TOKEN</code> to enable the bot. Optionally set <code>TELEGRAM_ALLOWED_CHAT_IDS</code> as a comma-separated allowlist.
          </div>
          <div className="text-muted-foreground">
            In Telegram, use <code>/start</code>, <code>/status</code>, and <code>/new</code>.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Portability</CardTitle>
          <CardDescription>
            Export or import workflows, memory, chat sessions, and audit history as JSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportData} disabled={exporting}>
              {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Export data bundle
            </Button>
            <Button
              variant="outline"
              onClick={() => setExportBundle("")}
              disabled={!exportBundle}
            >
              Clear export
            </Button>
          </div>
          <Textarea
            value={exportBundle}
            onChange={(e) => setExportBundle(e.target.value)}
            placeholder="Exported bundle appears here..."
            className="min-h-[220px] font-mono text-xs"
          />

          <div className="border-t pt-4 space-y-4">
            <div className="text-sm font-medium">Import bundle</div>
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste an exported Wings Of World bundle here..."
              className="min-h-[220px] font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => importData("merge")}
                disabled={importingMode !== null || !importText.trim()}
              >
                {importingMode === "merge" && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Merge import
              </Button>
              <Button
                variant="outline"
                onClick={() => importData("replace")}
                disabled={importingMode !== null || !importText.trim()}
              >
                {importingMode === "replace" && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Replace import
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BackendLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <code className="mt-1 block break-all text-xs">{value}</code>
    </div>
  );
}

function formatLoadFailure(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function ReadinessScope({
  title,
  status,
  detail,
  action,
  tone,
}: {
  title: string;
  status: string;
  detail: string;
  action: string;
  tone: "ready" | "warning";
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-2xl font-semibold">{status}</div>
        </div>
        <Badge variant={tone === "ready" ? "default" : "secondary"} className="rounded-full">
          {tone === "ready" ? "usable" : "action needed"}
        </Badge>
      </div>
      <div className="mt-3 text-sm text-muted-foreground">{detail}</div>
      <div className="mt-3 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">{action}</div>
    </div>
  );
}

function StatCard({
  title,
  value,
  detail,
  tone,
  icon,
}: {
  title: string;
  value: string | number;
  detail: string;
  tone: "ready" | "warning";
  icon: ReactNode;
}) {
  return (
    <Card className="rounded-[1.5rem] shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">{title}</CardTitle>
          <div className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
            tone === "ready" ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"
          }`}>
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}
