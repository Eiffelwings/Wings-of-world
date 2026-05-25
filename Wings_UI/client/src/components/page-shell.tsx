import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  status,
  gradientClassName,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  status?: {
    label: string;
    variant?: "default" | "secondary" | "destructive" | "outline";
  };
  gradientClassName?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[2rem] border p-6 shadow-sm",
        "bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(29,78,216,0.08),rgba(8,145,178,0.08))]",
        gradientClassName,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center rounded-full border bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status ? (
            <Badge variant={status.variant || "secondary"} className="rounded-full px-3 py-1">
              {status.label}
            </Badge>
          ) : null}
          {actions}
        </div>
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

export function PageMetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "ready",
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "ready" | "warning" | "neutral";
}) {
  const toneClasses =
    tone === "ready"
      ? "bg-green-500/10 text-green-700"
      : tone === "warning"
        ? "bg-amber-500/10 text-amber-700"
        : "bg-primary/10 text-primary";

  return (
    <div className="rounded-[1.5rem] border bg-card/85 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className={cn("inline-flex h-10 w-10 items-center justify-center rounded-full", toneClasses)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]", toneClasses)}>
          {tone}
        </span>
      </div>
      <div className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="mt-2 text-sm leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}
