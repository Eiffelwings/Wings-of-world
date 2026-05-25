import React, { useEffect, useState, useCallback } from "react";
import {
  BarChart3,
  Brain,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  Hash,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { api, type AnalyticsResponse, type AnalyticsDailyEntry, type AnalyticsModelEntry } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHero } from "@/components/page-shell";

const PERIODS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

const CHART_HEIGHT = 160;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(day: string): string {
  try {
    const d = new Date(day + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return day;
  }
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function TokenBarChart({ daily }: { daily: AnalyticsDailyEntry[] }) {
  if (daily.length === 0) return null;
  const maxTokens = Math.max(...daily.map((d) => d.input_tokens + d.output_tokens), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Daily Token Usage</CardTitle>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-blue-400/70" />
            Input
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500/70" />
            Output
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-[2px]" style={{ height: CHART_HEIGHT }}>
          {daily.map((d) => {
            const total = d.input_tokens + d.output_tokens;
            const inputH = Math.round((d.input_tokens / maxTokens) * CHART_HEIGHT);
            const outputH = Math.round((d.output_tokens / maxTokens) * CHART_HEIGHT);
            return (
              <div
                key={d.day}
                className="group relative flex flex-1 min-w-0 flex-col justify-end"
                style={{ height: CHART_HEIGHT }}
              >
                {total > 0 && (
                  <div className="absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 pointer-events-none group-hover:block">
                    <div className="rounded-lg border bg-card px-2.5 py-1.5 text-[10px] text-foreground shadow-lg whitespace-nowrap">
                      <div className="font-medium">{formatDate(d.day)}</div>
                      <div className="text-muted-foreground">Runs: {d.sessions}</div>
                      <div className="text-blue-400">In: {formatTokens(d.input_tokens)}</div>
                      <div className="text-emerald-400">Out: {formatTokens(d.output_tokens)}</div>
                    </div>
                  </div>
                )}
                <div
                  className="w-full rounded-t-sm bg-blue-400/60"
                  style={{ height: Math.max(inputH, total > 0 ? 1 : 0) }}
                />
                <div
                  className="w-full bg-emerald-500/60"
                  style={{ height: Math.max(outputH, d.output_tokens > 0 ? 1 : 0) }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>{daily.length > 0 ? formatDate(daily[0].day) : ""}</span>
          {daily.length > 2 && (
            <span>{formatDate(daily[Math.floor(daily.length / 2)].day)}</span>
          )}
          <span>{daily.length > 1 ? formatDate(daily[daily.length - 1].day) : ""}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function DailyTable({ daily }: { daily: AnalyticsDailyEntry[] }) {
  const sorted = [...daily].reverse().filter((d) => d.sessions > 0);
  if (sorted.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Daily Breakdown</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="py-2 pr-4 text-left font-medium">Date</th>
                <th className="py-2 px-4 text-right font-medium">Runs</th>
                <th className="py-2 px-4 text-right font-medium">Input</th>
                <th className="py-2 pl-4 text-right font-medium">Output</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr
                  key={d.day}
                  className="border-b border-border/50 transition-colors hover:bg-muted/40"
                >
                  <td className="py-2 pr-4 font-medium">{formatDate(d.day)}</td>
                  <td className="py-2 px-4 text-right text-muted-foreground">{d.sessions}</td>
                  <td className="py-2 px-4 text-right">
                    <span className="text-blue-500">{formatTokens(d.input_tokens)}</span>
                  </td>
                  <td className="py-2 pl-4 text-right">
                    <span className="text-emerald-500">{formatTokens(d.output_tokens)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ModelTable({ models }: { models: AnalyticsModelEntry[] }) {
  if (models.length === 0) return null;
  const filtered = models.filter((m) => m.sessions > 0);
  if (filtered.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Per-Model Breakdown</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="py-2 pr-4 text-left font-medium">Model</th>
                <th className="py-2 px-4 text-right font-medium">Runs</th>
                <th className="py-2 pl-4 text-right font-medium">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.model}
                  className="border-b border-border/50 transition-colors hover:bg-muted/40"
                >
                  <td className="py-2 pr-4">
                    <span className="font-mono text-xs">{m.model}</span>
                  </td>
                  <td className="py-2 px-4 text-right text-muted-foreground">{m.sessions}</td>
                  <td className="py-2 pl-4 text-right">
                    <span className="text-blue-500">{formatTokens(m.input_tokens)}</span>
                    {" / "}
                    <span className="text-emerald-500">{formatTokens(m.output_tokens)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function KindBreakdown({ byKind }: { byKind: Array<{ kind: string; count: number }> }) {
  if (byKind.length === 0) return null;
  const total = byKind.reduce((sum, k) => sum + k.count, 0);
  const KIND_COLORS: Record<string, string> = {
    chat: "bg-blue-500",
    workflow: "bg-violet-500",
    tool: "bg-amber-500",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">By Type</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {byKind.map(({ kind, count }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={kind} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${KIND_COLORS[kind] ?? "bg-muted-foreground"}`} />
                  <span className="capitalize">{kind}</span>
                </div>
                <span className="text-muted-foreground">
                  {count} ({pct}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${KIND_COLORS[kind] ?? "bg-muted-foreground"} opacity-70`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getAnalytics(days)
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const isEmpty =
    data &&
    data.totals.total_api_calls === 0 &&
    data.daily.every((d) => d.sessions === 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHero
        eyebrow="Wings Of World Analytics"
        title="Analytics"
        description="Token usage, model performance, and execution trends across your Wings Of World workspace."
        actions={
          <div className="flex items-center gap-2">
            {PERIODS.map((p) => (
              <Button
                key={p.label}
                variant={days === p.days ? "default" : "outline"}
                size="sm"
                className="rounded-full text-xs"
                onClick={() => setDays(p.days)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        }
      />

      {loading && !data && (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-6">
            <p className="text-center text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {data && !isEmpty && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={Hash}
              label="Total Tokens"
              value={formatTokens(data.totals.total_input + data.totals.total_output)}
              sub={`${formatTokens(data.totals.total_input)} in / ${formatTokens(data.totals.total_output)} out`}
            />
            <MetricCard
              icon={Zap}
              label="Total Runs"
              value={String(data.totals.total_sessions)}
              sub={`~${(data.totals.total_sessions / days).toFixed(1)} per day`}
            />
            <MetricCard
              icon={DollarSign}
              label="Est. Cost"
              value={formatCost(data.totals.total_cost_usd)}
              sub={data.by_model.length > 0 ? `across ${data.by_model.length} model(s)` : "no models yet"}
            />
            <MetricCard
              icon={Clock}
              label="Avg Duration"
              value={formatDuration(data.totals.avg_duration_ms)}
              sub={
                data.totals.success_count + data.totals.error_count > 0
                  ? `${data.totals.success_count} ok - ${data.totals.error_count} err`
                  : "no runs yet"
              }
            />
          </div>

          {/* Success / error badges */}
          {(data.totals.success_count > 0 || data.totals.error_count > 0) && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1 rounded-full">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {data.totals.success_count} success
              </Badge>
              {data.totals.error_count > 0 && (
                <Badge variant="secondary" className="gap-1 rounded-full">
                  <XCircle className="h-3 w-3 text-destructive" />
                  {data.totals.error_count} error
                </Badge>
              )}
            </div>
          )}

          {/* Chart + breakdown side by side on wide screens */}
          <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
            <TokenBarChart daily={data.daily} />
            <KindBreakdown byKind={data.by_kind} />
          </div>

          {/* Tables */}
          <div className="grid gap-6 lg:grid-cols-2">
            <DailyTable daily={data.daily} />
            <ModelTable models={data.by_model} />
          </div>
        </>
      )}

      {isEmpty && (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center text-muted-foreground">
              <BarChart3 className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">No usage data for this period</p>
              <p className="mt-1 text-xs opacity-60">
                Start a chat, run a workflow, or execute a tool - analytics will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
