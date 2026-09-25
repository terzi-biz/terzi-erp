import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Package } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WAREHOUSE_NAV } from "./nav";

export { WAREHOUSE_NAV };

export function WarehouseShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const loc = useLocation();
  const path = loc.pathname.replace(/\/$/, "") || "/";
  return (
    <AppShell>
      <div className="p-3 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="hatch-accent h-1 w-16 mb-2 rounded" />
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" /> Склад
            </div>
            <h1 className="text-xl md:text-3xl font-black tracking-tight">{title}</h1>
            {subtitle ? <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex gap-2 flex-wrap">{actions}</div> : null}
        </div>

        <nav className="-mx-3 px-3 md:mx-0 md:px-0 overflow-x-auto">
          <div className="flex gap-1.5 w-max border-b border-border pb-px">
            {WAREHOUSE_NAV.map((n) => {
              const target = n.to.replace(/\/$/, "") || "/warehouse";
              const active = path === target;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`whitespace-nowrap rounded-t-md px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
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

export function WarehouseKpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "good";
}) {
  const valueCls =
    tone === "warn" ? "text-warning" : tone === "good" ? "text-success" : "text-primary";
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl md:text-2xl font-black mt-1 tabular-nums break-words ${valueCls}`}>{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}
