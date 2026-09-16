/**
 * Спільні примітиви центру звітів: період, KPI-підсумок, підсумкова таблиця.
 * Без власних бізнес-формул — усі значення приходять з канонічних серверних функцій.
 */
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { EmptyState } from "@/components/dashboard/control-center";
import { Button } from "@/components/ui/button";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const nf = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
export const money = (v: number | null | undefined) => (v == null ? "—" : `${nf.format(Math.round(v))} ₴`);
export const num = (v: number | null | undefined) => (v == null ? "—" : nf.format(v));

export const REPORT_PRESETS = [
  { key: "d7", label: "7 днів", days: 6 },
  { key: "d30", label: "30 днів", days: 29 },
  { key: "d90", label: "90 днів", days: 89 },
] as const;

export function useReportPeriod() {
  const search = useSearch({ strict: false }) as { from?: string; to?: string };
  const navigate = useNavigate();
  const now = new Date();
  const fallback = { from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29))), to: iso(now) };
  const period = useMemo(() => ({ from: search.from ?? fallback.from, to: search.to ?? fallback.to }), [search.from, search.to, fallback.from, fallback.to]);
  const setPeriod = (p: { from: string; to: string }) => navigate({ to: ".", search: p as never, replace: true });
  return { period, setPeriod };
}

export function PeriodBar() {
  const { period, setPeriod } = useReportPeriod();
  const apply = (days: number) => {
    const now = new Date();
    setPeriod({ from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days))), to: iso(now) });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {REPORT_PRESETS.map((p) => (
        <Button key={p.key} size="sm" variant="outline" onClick={() => apply(p.days)}>{p.label}</Button>
      ))}
      <input type="date" aria-label="Від" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} className="h-9 rounded-lg border border-border bg-card px-2 text-xs" />
      <input type="date" aria-label="До" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} className="h-9 rounded-lg border border-border bg-card px-2 text-xs" />
    </div>
  );
}

export function KpiRow({ items }: { items: Array<{ label: string; value: string; note?: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="crm-panel p-3">
          <small className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{i.label}</small>
          <b className="mt-1 block font-display text-xl">{i.value}</b>
          {i.note ? <small className="mt-1 block text-[10px] text-muted-foreground">{i.note}</small> : null}
        </div>
      ))}
    </div>
  );
}

export function SummaryTable({ columns, rows, empty = "Немає даних за період" }: {
  columns: Array<{ key: string; label: string; align?: "left" | "right" }>;
  rows: Array<Record<string, ReactNode>>;
  empty?: string;
}) {
  if (!rows.length) return <EmptyState text={empty} />;
  return (
    <div className="crm-panel overflow-x-auto">
      <table className="w-full min-w-[520px] text-xs">
        <thead className="border-b border-border text-[10px] uppercase text-muted-foreground">
          <tr>{columns.map((c) => <th key={c.key} className={c.align === "right" ? "px-3 py-2 text-right" : "px-3 py-2 text-left"}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r.__key ?? i)} className="border-b border-border/50">
              {columns.map((c) => <td key={c.key} className={c.align === "right" ? "px-3 py-2 text-right" : "px-3 py-2"}>{r[c.key] ?? "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-black">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </header>
      <PeriodBar />
      {children}
    </section>
  );
}
