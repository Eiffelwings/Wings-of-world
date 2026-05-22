import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHero, PageMetricCard } from "@/components/page-shell";
import { Bot, Brain, CheckCircle2, Code2, Database, GitBranch, Search, Shield } from "lucide-react";

const ICONS: Record<string, typeof Bot> = {
  orchestrator: GitBranch,
  planner: Brain,
  researcher: Search,
  implementer: Code2,
  reviewer: Bot,
  memory_manager: Database,
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<
    Array<{ role: string; title: string; status: string; summary: string }>
  >([]);

  useEffect(() => {
    api.getAgents().then((data) => setAgents(data.agents)).catch(() => {});
  }, []);

  const onlineAgents = agents.filter((agent) => agent.status === "online").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHero
        eyebrow="Agent catalog"
        title="Operational Agents"
        description="Imported roles from local_ai_system, adapted into Wings Of World as a clear operator-facing catalog instead of a hidden implementation detail."
        status={{
          label: agents.length ? `${onlineAgents}/${agents.length} online` : "catalog",
          variant: onlineAgents === agents.length && agents.length > 0 ? "secondary" : "outline",
        }}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PageMetricCard
            title="Total agents"
            value={String(agents.length)}
            detail="Roles currently surfaced inside Wings Of World."
            icon={Bot}
          />
          <PageMetricCard
            title="Online"
            value={String(onlineAgents)}
            detail="Roles reporting a healthy or ready state."
            icon={CheckCircle2}
            tone={onlineAgents === agents.length && agents.length > 0 ? "ready" : "warning"}
          />
          <PageMetricCard
            title="Coverage"
            value={String(new Set(agents.map((agent) => agent.role)).size)}
            detail="Distinct capability lanes represented in the catalog."
            icon={Shield}
          />
          <PageMetricCard
            title="Offline"
            value={String(agents.filter((agent) => agent.status !== "online").length)}
            detail="Roles that need inspection before depending on them heavily."
            icon={Brain}
            tone={agents.some((agent) => agent.status !== "online") ? "warning" : "ready"}
          />
        </div>
      </PageHero>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => {
          const Icon = ICONS[agent.role] || Bot;
          const isOnline = agent.status === "online";
          return (
            <Card key={agent.role} className="rounded-[1.75rem] shadow-sm">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <Badge variant={isOnline ? "secondary" : "outline"} className="rounded-full px-3 py-1">
                    {agent.status}
                  </Badge>
                </div>
                <CardTitle className="text-xl">{agent.title}</CardTitle>
                <CardDescription>{agent.role}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
                <div className="rounded-2xl border bg-muted/15 p-4 leading-6">
                  {agent.summary}
                </div>
                <div className="rounded-2xl border bg-muted/10 p-4 text-xs leading-5">
                  {isOnline
                    ? "This role is ready to be routed into live operator workflows."
                    : "Treat this role as degraded until the backing runtime or configuration is restored."}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
