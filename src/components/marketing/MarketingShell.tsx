import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { MARKETING_NAV } from "./nav";

export { MARKETING_NAV };

export function MarketingShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const loc = useLocation();
  return (
    <AppShell>
      <div className="p-3 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Маркетинг</div>
            <h1 className="text-xl md:text-3xl font-black tracking-tight">{title}</h1>
            {subtitle ? <p className="text-xs md:text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex gap-2 flex-wrap">{actions}</div> : null}
        </div>

        <nav className="-mx-3 px-3 md:mx-0 md:px-0 overflow-x-auto">
          <div className="flex gap-1.5 w-max">
            {MARKETING_NAV.map((n) => {
              const active = loc.pathname === n.to;
              return (
                <Link key={n.to} to={n.to}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold border ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {children}
      </div>
    </AppShell>
  );
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 md:p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">{text}</div>;
}

export function KpiCard({ label, value, hint, delta, status = "good" }: { label: string; value: string; hint?: string; delta?: number; status?: "good" | "warn" | "bad" }) {
  const tone = status === "bad" ? "text-destructive" : status === "warn" ? "text-warning" : "text-success";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
      <div className="mt-1 text-lg md:text-xl font-black tracking-tight tabular-nums">{value}</div>
      <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
        {typeof delta === "number" && isFinite(delta) && delta !== 0 ? (
          <span className={tone}>{delta > 0 ? "+" : ""}{delta.toFixed(0)}%</span>
        ) : null}
        {hint ? <span className="text-muted-foreground truncate">{hint}</span> : null}
      </div>
    </div>
  );
}

export const fmtMoney = (n: number) => `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(n || 0))} ₴`;
export const fmtNum = (n: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
export const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;
