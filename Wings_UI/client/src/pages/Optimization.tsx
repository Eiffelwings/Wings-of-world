import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Cpu,
  Database,
  DollarSign,
  Gauge,
  Layers,
  Network,
  RefreshCw,
  Sparkles,
  TrendingDown,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHero } from "@/components/page-shell";
import { api, type OptimizationSummary } from "@/lib/api";

const PERIODS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

function fmtUsd(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function fmtUsdSavings(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d}d ${h}h`;
}

interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warn";
}

function MetricCard({ icon: Icon, label, value, hint, tone = "default" }: MetricCardProps) {
  const toneClasses = {
    default: "border-border",
    success: "border-green-500/40 bg-green-500/5",
    warn: "border-yellow-500/40 bg-yellow-500/5",
  }[tone];
  return (
    <Card className={toneClasses}>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-md border bg-background p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate text-2xl font-semibold leading-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

interface TierBarProps {
  label: string;
  share: number;
  calls: number;
  spend: number;
  color: string;
}

function TierBar({ label, share, calls, spend, color }: TierBarProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          {calls} call(s) · {fmtUsd(spend)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.max(2, share)}%`, transition: "width 200ms" }}
        />
      </div>
      <div className="text-right text-xs text-muted-foreground">{share.toFixed(1)}%</div>
    </div>
  );
}

export default function Optimization() {
  const [summary, setSummary] = useState<OptimizationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(7);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async (window: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getOptimizationSummary(window);
      setSummary(data);
      setRefreshedAt(new Date());
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
      <PageHero
        eyebrow="Optimization"
        title="Optimization"
        description="Token-saving features at a glance — cascade routing, prompt compression, tool-result cache, and memory consolidation."
      />

      {/* Window selector + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.days}
              variant={days === p.days ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {refreshedAt && <span>Updated {refreshedAt.toLocaleTimeString()}</span>}
          <Button variant="ghost" size="sm" onClick={() => load(days)} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="p-4 text-sm text-red-600">
            Failed to load: {error}
          </CardContent>
        </Card>
      )}

      {summary && (
        <>
          {/* Hero — total estimated savings */}
          <Card className="border-green-500/40 bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingDown className="h-4 w-4" />
                  <span>Estimated savings · last {summary.windowDays} day(s)</span>
                </div>
                <div className="mt-1 text-4xl font-semibold tracking-tight text-green-700 dark:text-green-400">
                  {fmtUsdSavings(summary.totals.estimatedSavingsUsd)}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{summary.totals.headlineLabel}</div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-right text-sm">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Spend</div>
                  <div className="text-lg font-medium">{fmtUsd(summary.spend.totalUsd)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Tokens</div>
                  <div className="text-lg font-medium">{fmtNumber(summary.spend.totalTokens)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Calls</div>
                  <div className="text-lg font-medium">{summary.spend.totalCalls}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Forecast / mo</div>
                  <div className="text-lg font-medium">{fmtUsd(summary.forecast.projectedMonthlyUsd)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feature mode cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={Network}
              label="Smart cascade"
              value={summary.cascade.mode}
              hint={
                summary.cascade.mode === "off"
                  ? "Enable in Settings to start saving"
                  : `${summary.cascade.callsByTier.small + summary.cascade.callsByTier.medium + summary.cascade.callsByTier.large} routed call(s)`
              }
              tone={summary.cascade.mode === "off" ? "warn" : "success"}
            />
            <MetricCard
              icon={Layers}
              label="Prompt compression"
              value={summary.compression.level}
              hint={`Min ${summary.compression.minChars} chars`}
              tone={summary.compression.level === "off" ? "warn" : "success"}
            />
            <MetricCard
              icon={Database}
              label="Tool cache hits"
              value={`${(summary.toolCache.hitRate * 100).toFixed(1)}%`}
              hint={`${summary.toolCache.totalEntries} entries · ${fmtBytes(summary.toolCache.totalBytesSaved)} saved`}
              tone={summary.toolCache.hitRate >= 0.3 ? "success" : "default"}
            />
            <MetricCard
              icon={Sparkles}
              label="Memory consolidated"
              value={String(summary.consolidation.cumulativeMemoriesReduced)}
              hint={`${summary.consolidation.runs.length} run(s) on file`}
            />
          </div>

          {/* Cascade tier breakdown */}
          {summary.cascade.mode !== "off" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Network className="h-4 w-4" />
                  Cascade routing
                  <Badge variant="outline" className="ml-2 text-xs">{summary.cascade.mode}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <TierBar
                  label={summary.cascade.tiers.small ? `Small · ${summary.cascade.tiers.small.model}` : "Small (not configured)"}
                  share={summary.cascade.sharePct.small}
                  calls={summary.cascade.callsByTier.small}
                  spend={summary.cascade.spendByTier.small}
                  color="bg-emerald-500"
                />
                <TierBar
                  label={summary.cascade.tiers.medium ? `Medium · ${summary.cascade.tiers.medium.model}` : "Medium (not configured)"}
                  share={summary.cascade.sharePct.medium}
                  calls={summary.cascade.callsByTier.medium}
                  spend={summary.cascade.spendByTier.medium}
                  color="bg-blue-500"
                />
                <TierBar
                  label={summary.cascade.tiers.large ? `Large · ${summary.cascade.tiers.large.model}` : "Large (not configured)"}
                  share={summary.cascade.sharePct.large}
                  calls={summary.cascade.callsByTier.large}
                  spend={summary.cascade.spendByTier.large}
                  color="bg-purple-500"
                />
              </CardContent>
            </Card>
          )}

          {/* Spend by model (top 5) + tool cache top tools */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DollarSign className="h-4 w-4" />
                  Spend by model
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary.spend.byModel.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No spend recorded yet in this window.</p>
                ) : (
                  <div className="space-y-2">
                    {summary.spend.byModel.slice(0, 8).map((row) => {
                      const max = Math.max(...summary.spend.byModel.map((r) => r.totalUsd));
                      const pct = max > 0 ? (row.totalUsd / max) * 100 : 0;
                      return (
                        <div key={row.bucket} className="space-y-1">
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="truncate font-mono">{row.bucket}</span>
                            <span className="text-muted-foreground">{fmtUsd(row.totalUsd)} · {row.calls}×</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4" />
                  Tool cache hot tools
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary.toolCache.byTool.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No cached tools yet — run tools through the agentic loop to populate.</p>
                ) : (
                  <div className="space-y-2">
                    {summary.toolCache.byTool.slice(0, 8).map((row) => (
                      <div key={row.tool} className="flex items-baseline justify-between text-sm">
                        <span className="font-mono">{row.tool}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.hits} hit(s) / {row.entries} entry · {fmtBytes(row.bytesSaved)} saved
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent consolidations */}
          {summary.consolidation.runs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4" />
                  Recent memory consolidations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {summary.consolidation.runs.map((run) => (
                    <div key={run.id} className="flex items-baseline justify-between border-b pb-2 last:border-0">
                      <div>
                        <div className="font-mono text-xs text-muted-foreground">{run.id}</div>
                        <div>
                          {run.totalBefore} → {run.totalAfter}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {run.clustersMerged} merged · {run.entriesDropped} dropped
                          </span>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <Badge variant={run.dryRun ? "outline" : "default"} className="text-xs">
                          {run.dryRun ? "dry-run" : "executed"}
                        </Badge>
                        <div>{new Date(run.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Health */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" />
                Server health
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">Uptime</div>
                <div className="font-medium">{fmtUptime(summary.health.uptimeSeconds)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">RSS</div>
                <div className="font-medium">{summary.health.rssMb} MB</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Heap</div>
                <div className="font-medium">{summary.health.heapUsedMb} MB</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Node</div>
                <div className="font-mono text-sm">{summary.health.nodeVersion}</div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!summary && !error && loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Cpu className="h-4 w-4 animate-pulse" />
          Loading optimization data…
        </div>
      )}
    </div>
  );
}
