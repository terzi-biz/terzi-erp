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

export const crmInput = "h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15";
export const crmButton = "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
export const crmButtonOutline = "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";