import type { ComponentType, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type DashboardTone = "primary" | "gold" | "success" | "danger" | "warning";

export function MetricCard({ icon: Icon, label, value, note, delta, target, tone = "primary", onClick }: {
  icon: ComponentType<{ className?: string }>; label: string; value: string; note?: string; delta?: number | null;
  target?: string | null; tone?: DashboardTone; onClick?: () => void;
}) {
  const positive = delta != null && delta >= 0;
  return (
    <Button variant="outline" onClick={onClick} disabled={!onClick}
      className={cn("crm-kpi h-auto w-full items-stretch justify-start whitespace-normal text-left hover:bg-card", `crm-kpi--${tone === "warning" ? "gold" : tone}`)}>
      <span className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <span className="crm-kpi__icon"><Icon className="h-5 w-5" /></span>
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-semibold text-muted-foreground md:text-xs">{label}</span>
          <span className={cn("mt-1 block font-display text-xl font-black leading-none md:text-2xl", value === "Немає даних" && "text-sm text-muted-foreground")}>{value}</span>
          <span className="mt-2 flex min-h-4 items-center gap-1 text-[10px] md:text-[11px]">
            {delta != null ? <span className={cn("inline-flex items-center font-extrabold", positive ? "text-success" : "text-destructive")}>{positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{positive ? "+" : ""}{Math.abs(delta).toFixed(0)}%</span> : null}
            <span className="truncate text-muted-foreground">{target ?? note ?? (delta == null ? "Без порівняння" : "")}</span>
          </span>
        </span>
        <span className="crm-kpi__trend" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      </span>
    </Button>
  );
}

export function SectionShell({ title, eyebrow, action, children, className }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn("space-y-3", className)}><header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3"><div className="min-w-0">{eyebrow ? <p className="crm-eyebrow">{eyebrow}</p> : null}<h2 className="mt-0.5 truncate text-lg font-black md:text-xl">{title}</h2></div>{action}</header>{children}</section>;
}

export function FunnelCard({ stages, onOpen }: { stages: Array<{ key: string; label: string; count: number; conversion: number | null; overall: number | null }>; onOpen: (metric: string, title: string) => void }) {
  const max = stages[0]?.count || 1;
  return <div className="crm-panel overflow-hidden p-3 md:p-4"><div className="space-y-1">{stages.map((s, index) => <Button key={s.key} variant="ghost" onClick={() => onOpen(s.key, s.label)} className="grid h-auto w-full grid-cols-[86px_40px_minmax(70px,1fr)_42px] items-center gap-2 whitespace-normal rounded-sm px-1 py-1.5 text-left md:grid-cols-[150px_56px_minmax(120px,1fr)_54px]">
    <span className="truncate text-[10px] font-bold md:text-xs">{s.label}</span><b className="text-right text-[11px] md:text-xs">{s.count}</b><span className="relative h-5 overflow-hidden rounded-sm bg-muted"><span className={cn("absolute inset-y-0 left-0 min-w-2 rounded-sm bg-primary", index > 1 && "bg-success", index === stages.length - 1 && "bg-gold")} style={{ width: `${Math.max(6, s.count / max * 100)}%` }} /></span><span className="text-right text-[10px] text-muted-foreground">{index ? `${s.conversion?.toFixed(0) ?? "—"}%` : "100%"}</span>
  </Button>)}</div></div>;
}

export function ManagementInsight({ severity, title, detail, onClick }: { severity: string; title: string; detail: string; onClick?: () => void }) {
  return <Button variant="ghost" onClick={onClick} className="h-auto w-full justify-start gap-3 whitespace-normal rounded-md border-b border-border p-2 text-left hover:bg-accent"><span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md", severity === "warning" ? "bg-warning/15 text-warning" : severity === "critical" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}><Sparkles className="h-4 w-4" /></span><span className="min-w-0 flex-1"><b className="block text-xs">{title}</b><span className="mt-0.5 block text-[10px] text-muted-foreground md:text-[11px]">{detail}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></Button>;
}

export function ActionDrawer({ open, onOpenChange, title, description, loading, rows }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; loading: boolean; rows: Array<{ id: string; title: string; subtitle: string | null; date: string | null; amount: number | null; href: string | null }> }) {
  const fmt = (v: string | null) => v ? new Date(v).toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" }) : "—";
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="inset-x-0 bottom-0 top-auto h-[88dvh] w-full max-w-none overflow-hidden rounded-t-lg p-0 sm:inset-y-0 sm:left-auto sm:h-full sm:w-[520px] sm:max-w-[520px] sm:rounded-none">
    <SheetHeader className="border-b border-border p-4 text-left"><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
    <div className="h-[calc(100%-82px)] overflow-y-auto p-3">{loading ? <EmptyState text="Завантаження…" /> : !rows.length ? <EmptyState text="Записів за цим зрізом немає" /> : <div className="space-y-2">{rows.map((r) => <div key={r.id} className="rounded-md border border-border bg-card p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><b className="block truncate text-xs">{r.title}</b><span className="mt-1 block text-[11px] text-muted-foreground">{[r.subtitle, fmt(r.date)].filter(Boolean).join(" · ")}</span></div>{r.amount != null ? <b className="shrink-0 text-xs">{Math.round(r.amount).toLocaleString("uk-UA")} ₴</b> : null}</div>{r.href ? <Button asChild variant="link" size="sm" className="mt-1 h-7 px-0 text-xs"><Link to={r.href}>Відкрити запис <ChevronRight /></Link></Button> : null}</div>)}</div>}</div>
  </SheetContent></Sheet>;
}

export function EmptyState({ text }: { text: string }) { return <div className="rounded-md border border-dashed border-border py-8 text-center text-xs text-muted-foreground">{text}</div>; }