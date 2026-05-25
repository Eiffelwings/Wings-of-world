import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { api, type PublicSettings, type SystemReadiness } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";
import {
  AlertCircle,
  Bot,
  Brain,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Lock,
  LayoutDashboard,
  MessageSquare,
  MonitorCog,
  ShieldCheck,
  Settings as SettingsIcon,
  Send,
  WandSparkles,
  Workflow,
} from "lucide-react";

export default function Home() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getSystemReadiness()])
      .then(([settingsData, readinessData]) => {
        setSettings(settingsData);
        setReadiness(readinessData);
      })
      .catch(() => {});
  }, []);

  const configured = settings ? (!settings.apiKeyRequired || settings.hasApiKey) : false;
  const readyCount = readiness?.summary.ready || 0;
  const warningCount = readiness?.summary.warning || 0;
  const authCheck = readiness?.checks.find((check) => check.id === "app-auth");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="rounded-[2rem] border bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(29,78,216,0.08),rgba(8,145,178,0.08))] p-8 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <BrandLogo size="lg" showSubtitle />
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-balance">Visual AI command center for Wings Of World</h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                Visual AI workflows with a practical tool, memory, Telegram, and operations layer. The system is strongest when provider access, app auth, and workflow baselines are all locked in.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/console">
                <Button className="rounded-full">
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Open Console
                </Button>
              </Link>
              <Link href="/settings">
                <Button variant="outline" className="rounded-full">
                  <SettingsIcon className="mr-2 h-4 w-4" />
                  Review Security
                </Button>
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <HeroMetric
              title="Readiness"
              value={readiness?.overall || "-"}
              detail={`${readyCount} ready / ${warningCount} warning`}
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone={warningCount > 0 ? "warning" : "ready"}
            />
            <HeroMetric
              title="Provider"
              value={configured ? settings?.model || "-" : "Needs setup"}
              detail={configured ? settings?.provider || "-" : "Configure endpoint and credentials"}
              icon={<WandSparkles className="h-4 w-4" />}
              tone={configured ? "ready" : "warning"}
            />
            <HeroMetric
              title="App Auth"
              value={settings?.authEnabled ? "Enabled" : "Open"}
              detail={settings?.authEnabled ? "UI and sensitive API locked" : "Enable local password"}
              icon={settings?.authEnabled ? <ShieldCheck className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              tone={settings?.authEnabled ? "ready" : "warning"}
            />
            <HeroMetric
              title="Telegram"
              value={readiness?.checks.find((check) => check.id === "telegram")?.status || "-"}
              detail={readiness?.checks.find((check) => check.id === "telegram")?.detail || "Bridge not checked yet"}
              icon={<Send className="h-4 w-4" />}
              tone={readiness?.checks.find((check) => check.id === "telegram")?.status === "ready" ? "ready" : "warning"}
            />
          </div>
        </div>
      </header>

      <Card className={configured ? "border-green-500/40" : "border-amber-500/40"}>
        <CardContent className="flex items-start gap-3 pt-6">
          {configured ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
          )}
          <div className="flex-1">
            <div className="font-semibold">
              {configured ? "API configured" : "API not configured"}
            </div>
            <div className="text-sm text-muted-foreground">
              {configured
                ? `Provider: ${settings?.provider} | Model: ${settings?.model} | Key: ${settings?.apiKeyMasked}`
                : "Add an OpenAI-compatible API key in Settings to enable chat and LLM workflow nodes."}
            </div>
          </div>
          <Link href="/settings">
            <Button variant={configured ? "secondary" : "default"} className="rounded-full">
              {configured ? "Change" : "Configure"}
            </Button>
          </Link>
        </CardContent>
      </Card>

      {!settings?.authEnabled ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center">
            <div className="flex flex-1 items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <div className="font-semibold">App password is still disabled</div>
                <div className="text-sm text-muted-foreground">
                  Tools, exports, settings changes, and session data are now ready to be protected. Turn on local app authentication before treating this as a fully secured operator console.
                </div>
              </div>
            </div>
            <Link href="/settings">
              <Button className="rounded-full">Enable app password</Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {readiness && (
        <Card>
          <CardHeader>
            <CardTitle>Setup Checklist</CardTitle>
            <CardDescription>
              Overall status: <span className="font-medium">{readiness.overall}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {readiness.checks.map((check) => (
              <div key={check.id} className="rounded-2xl border p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-medium">
                  {check.status === "ready" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle
                      className={`h-4 w-4 ${check.status === "error" ? "text-red-600" : "text-amber-600"}`}
                    />
                  )}
                  <span>{check.label}</span>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${
                    check.status === "ready"
                      ? "bg-green-500/10 text-green-700"
                      : check.status === "error"
                        ? "bg-red-500/10 text-red-700"
                        : "bg-amber-500/10 text-amber-700"
                  }`}>
                    {check.status}
                  </span>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{check.detail}</div>
                {check.action && (
                  <div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">{check.action}</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/console">
          <Card className="h-full cursor-pointer rounded-[1.5rem] hover:border-primary hover:shadow-md">
            <CardHeader>
              <LayoutDashboard className="mb-2 h-8 w-8" />
              <CardTitle>Console</CardTitle>
              <CardDescription>Operational dashboard for runtime, memory, tools, and agents.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/workflow">
          <Card className="h-full cursor-pointer rounded-[1.5rem] hover:border-primary hover:shadow-md">
            <CardHeader>
              <Workflow className="mb-2 h-8 w-8" />
              <CardTitle>Workflow Library</CardTitle>
              <CardDescription>Browse, manage, duplicate, and reopen saved workflow snapshots.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/workflow-builder">
          <Card className="h-full cursor-pointer rounded-[1.5rem] hover:border-primary hover:shadow-md">
            <CardHeader>
              <Brain className="mb-2 h-8 w-8" />
              <CardTitle>Workflow Builder</CardTitle>
              <CardDescription>Design and execute the active graph in the dedicated builder workspace.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/tools">
          <Card className="h-full cursor-pointer rounded-[1.5rem] hover:border-primary hover:shadow-md">
            <CardHeader>
              <WandSparkles className="mb-2 h-8 w-8" />
              <CardTitle>Tools</CardTitle>
              <CardDescription>Run imported calculator, file, search, and write tools safely.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/chat">
          <Card className="h-full cursor-pointer rounded-[1.5rem] hover:border-primary hover:shadow-md">
            <CardHeader>
              <MessageSquare className="mb-2 h-8 w-8" />
              <CardTitle>Chat Playground</CardTitle>
              <CardDescription>Persistent sessions with memory-aware replies and audit logging.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/telegram">
          <Card className="h-full cursor-pointer rounded-[1.5rem] hover:border-primary hover:shadow-md">
            <CardHeader>
              <Send className="mb-2 h-8 w-8" />
              <CardTitle>Telegram</CardTitle>
              <CardDescription>Bridge Wings Of World into Telegram chats with shared memory and session tracking.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/memory">
          <Card className="h-full cursor-pointer rounded-[1.5rem] hover:border-primary hover:shadow-md">
            <CardHeader>
              <Brain className="mb-2 h-8 w-8" />
              <CardTitle>Memory</CardTitle>
              <CardDescription>Create, edit, search, and delete durable operational memory.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/cron">
          <Card className="h-full cursor-pointer rounded-[1.5rem] hover:border-primary hover:shadow-md">
            <CardHeader>
              <CalendarClock className="mb-2 h-8 w-8" />
              <CardTitle>Cron Jobs</CardTitle>
              <CardDescription>Schedule commands, prompts, webhooks, and macros with previewed next runs.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/human-actions">
          <Card className="h-full cursor-pointer rounded-[1.5rem] hover:border-primary hover:shadow-md">
            <CardHeader>
              <ClipboardList className="mb-2 h-8 w-8" />
              <CardTitle>Command Center</CardTitle>
              <CardDescription>Dispatch work orders with route, risk, checklist, and acceptance criteria.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/agents">
          <Card className="h-full cursor-pointer rounded-[1.5rem] hover:border-primary hover:shadow-md">
            <CardHeader>
              <Bot className="mb-2 h-8 w-8" />
              <CardTitle>Agents</CardTitle>
              <CardDescription>See the imported agent roles and their operational responsibilities.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/system">
          <Card className="h-full cursor-pointer rounded-[1.5rem] hover:border-primary hover:shadow-md">
            <CardHeader>
              <MonitorCog className="mb-2 h-8 w-8" />
              <CardTitle>System</CardTitle>
              <CardDescription>Inspect local runtime health, readiness, resources, and storage paths.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <div className="flex gap-2">
        <Link href="/settings">
          <Button variant="outline" className="rounded-full">
            <SettingsIcon className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </Link>
      </div>
    </div>
  );
}

function HeroMetric({
  title,
  value,
  detail,
  icon,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: "ready" | "warning";
}) {
  return (
    <div className="rounded-[1.5rem] border bg-card/85 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${
          tone === "ready" ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"
        }`}>
          {icon}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] ${
          tone === "ready" ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"
        }`}>
          {tone}
        </span>
      </div>
      <div className="mt-4 text-sm text-muted-foreground">{title}</div>
      <div className="mt-1 text-xl font-semibold text-balance">{value}</div>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</div>
    </div>
  );
}
