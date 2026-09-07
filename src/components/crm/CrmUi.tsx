import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function CrmPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("crm-workspace min-h-full p-4 md:p-6", className)}>{children}</div>;
}

export function CrmEyebrow({ children }: { children: ReactNode }) {
  return <div className="crm-eyebrow">{children}</div>;
}

export function CrmKpi({ icon: Icon, label, value, hint, tone = "primary" }: {
  icon?: LucideIcon; label: string; value: string; hint?: string; tone?: "primary" | "gold" | "success" | "danger";
}) {
  return (
    <div className={cn("crm-kpi", `crm-kpi--${tone}`)}>
      <div className="flex items-center justify-between gap-3">
        <span className="crm-eyebrow">{label}</span>
        {Icon ? <Icon className="h-4 w-4 opacity-70" /> : null}
      </div>
      <div className="mt-3 font-display text-2xl font-bold tabular-nums md:text-3xl">{value}</div>
      {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function CrmPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("crm-panel", className)}>{children}</section>;
}

/** Технічний чип у будівельному стилі: площа, напрям робіт, тип об'єкта. */
export function CrmSpec({ label, value, tone = "muted" }: { label?: string; value: ReactNode; tone?: "muted" | "primary" | "gold" }) {
  const tones = {
    muted: "border-border bg-secondary/60 text-muted-foreground",
    primary: "border-primary/30 bg-primary/10 text-primary",
    gold: "border-warning/40 bg-warning/10 text-warning",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", tones[tone])}>
      {label ? <span className="opacity-70">{label}</span> : null}
      <span className="tabular-nums normal-case">{value}</span>
    </span>
  );
}

/** Статус оплати за фактом: сплачено / частково / без оплат. */
export function PayStatus({ total, paid }: { total?: number | null; paid?: number | null }) {
  const t = Number(total) || 0;
  const p = Number(paid) || 0;
  const pct = t > 0 ? Math.min(100, Math.round((p / t) * 100)) : 0;
  const state = t <= 0 ? "none" : p <= 0 ? "unpaid" : p + 0.5 >= t ? "paid" : "partial";
  const label = { none: "Сума не визначена", unpaid: "Без оплат", partial: `Оплачено ${pct}%`, paid: "Оплачено повністю" }[state];
  const cls = {
    none: "border-border bg-muted text-muted-foreground",
    unpaid: "border-destructive/40 bg-destructive/10 text-destructive",
    partial: "border-warning/40 bg-warning/10 text-warning",
    paid: "border-success/40 bg-success/10 text-success",
  }[state];
  return (
    <div className="space-y-1">
      <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", cls)}>{label}</span>
      {t > 0 ? (
        <div className="h-1 w-full overflow-hidden rounded-sm bg-muted">
          <div className={cn("h-full", state === "paid" ? "bg-success" : state === "partial" ? "bg-warning" : "bg-destructive/50")} style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
      ) : null}
    </div>
  );
}


export const crmInput = "h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15";
export const crmButton = "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
export const crmButtonOutline = "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";