import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlanVsFact } from "@/lib/plan-fact.functions";
import { kyivToday } from "@/lib/kyiv-time";
import { Card } from "./primitives";
import { moneyShort, num, pct } from "./format";

type Row = { key: string; name: string; fact: number; deals: number; plan: number | null; planDeals: number | null; pct: number | null; forecast: number | null };

function Bar({ p }: { p: number | null }) {
  const color = p == null ? "var(--color-muted-foreground)" : p >= 100 ? "var(--color-success)" : p >= 70 ? "var(--color-warning)" : "var(--color-destructive)";
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, p ?? 0))}%`, background: color }} />
    </div>
  );
}

function Rows({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">{empty}</div>;
  return (
    <ul className="space-y-3">
      {rows.slice(0, 8).map((r) => (
        <li key={r.key}>
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span className="truncate font-semibold">{r.name}</span>
            <span className="shrink-0 tabular-nums text-xs font-bold">{r.pct == null ? "ціль не задана" : pct(r.pct, 0)}</span>
          </div>
          <div className="text-[11.5px] tabular-nums text-muted-foreground">
            {moneyShort(r.fact)}{r.plan ? ` / ${moneyShort(r.plan)}` : ""} · {num(r.deals)}{r.planDeals ? `/${num(r.planDeals)}` : ""} угод
            {r.forecast != null && r.plan ? ` · прогноз ${moneyShort(r.forecast)}` : ""}
          </div>
          <Bar p={r.pct} />
        </li>
      ))}
    </ul>
  );
}

export function PlanVsFactPanel() {
  const today = kyivToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [tab, setTab] = useState<"managers" | "foremen">("managers");
  const fn = useServerFn(getPlanVsFact);
  const q = useQuery({ queryKey: ["plan-vs-fact", month], queryFn: () => fn({ data: { month, today } }), staleTime: 60_000, retry: false });
  const d = q.data;
  return (
    <Card className="flex flex-col p-4 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="tz-h text-[17px]">Планування vs факт</h2>
          <p className="text-[12px] text-muted-foreground">{d?.factLabel ?? "Договори за місяць"}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="min-h-9 rounded-md border border-border bg-background px-2 text-xs" />
          <Link to="/settings/sales-plan" className="text-[12.5px] font-semibold text-primary hover:underline">Цілі →</Link>
        </div>
      </header>
      {q.isLoading ? <div className="py-8 text-center text-xs text-muted-foreground">Завантаження…</div>
        : q.isError ? <div className="py-8 text-center text-xs text-destructive">{(q.error as Error).message}</div>
        : d && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["План компанії", d.company.plan ? moneyShort(d.company.plan) : "не задано"],
              ["Факт", moneyShort(d.company.fact)],
              ["Виконання", d.company.pct == null ? "—" : pct(d.company.pct, 0)],
              ["Прогноз на кінець", d.company.forecast == null ? "—" : moneyShort(d.company.forecast)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg border border-border bg-background p-2.5">
                <div className="text-[11px] text-muted-foreground">{l}</div>
                <div className="text-[15px] font-black tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <Bar p={d.company.pct} />
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
            {(["managers", "foremen"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`min-h-9 rounded-md text-xs font-bold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/60"}`}>
                {t === "managers" ? "Менеджери" : "Прораби"}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <Rows rows={tab === "managers" ? d.managers : d.foremen} empty="Немає планів і договорів за місяць" />
          </div>
        </>
      )}
    </Card>
  );
}
