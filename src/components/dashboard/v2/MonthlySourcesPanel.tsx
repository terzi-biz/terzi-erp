import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMonthlySummary } from "@/lib/dashboard-monthly.functions";
import { kyivToday } from "@/lib/kyiv-time";
import { MONTHS_NOM } from "./format";

const money = (v: number | null | undefined) => v == null ? "немає даних" : `${Math.round(v).toLocaleString("uk-UA")} ₴`;
const mLabel = (k: string) => `${MONTHS_NOM[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

export function MonthlySourcesPanel() {
  const fn = useServerFn(getMonthlySummary);
  const [month, setMonth] = useState(kyivToday().slice(0, 7));
  const { data, isLoading, isError } = useQuery({ queryKey: ["dash", "monthly", month], queryFn: () => fn({ data: { month, months: 6 } }) });

  const f = data?.funnel;
  const steps = f ? [
    { l: "Ліди", v: f.leads, t: String(f.leads) },
    { l: "Заміри", v: f.measurements, t: String(f.measurements) },
    { l: "Замовлення (договір/продано)", v: f.orders, t: String(f.orders) },
  ] : [];
  const top = steps[0]?.v || 1;

  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold">Підсумки місяця: прибуток, EBITDA, ROMI за джерелами</h2>
          <p className="text-xs text-muted-foreground">Замовлення — за датою замовлення; гроші — фактичні операції Finmap (без переказів між рахунками).</p>
        </div>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
      </div>

      {isLoading ? <div className="text-sm text-muted-foreground">Завантаження…</div> : null}
      {isError ? <div className="text-sm text-destructive">Не вдалося завантажити підсумки</div> : null}

      {data ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Воронка · {mLabel(month)}</div>
            {steps.map((s, i) => (
              <div key={s.l} className="mx-auto rounded-md bg-primary px-3 py-2 text-center text-primary-foreground"
                style={{ width: `${Math.max(40, (s.v / top) * 100)}%`, opacity: 1 - i * 0.15 }}>
                <div className="text-lg font-bold tabular-nums">{s.t}</div>
                <div className="text-[11px]">{s.l}{i > 0 && steps[i - 1].v ? ` · ${Math.round((s.v / steps[i - 1].v) * 100)}%` : ""}</div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-1 text-center text-xs">
              <div className="rounded-md border border-border p-2"><div className="text-muted-foreground">Сума замовлень</div><b className="tabular-nums">{money(f!.value)}</b></div>
              <div className="rounded-md border border-border p-2"><div className="text-muted-foreground">Оплачено по них</div><b className="tabular-nums">{money(f!.paid)}</b></div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr><th className="py-1 text-left">Джерело</th><th className="text-right">Ліди</th><th className="text-right">Заміри</th><th className="text-right">Замовл.</th><th className="text-right">Сума</th><th className="text-right">Витрати</th><th className="text-right">ROMI</th></tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.sources.map((s) => (
                  <tr key={s.source}>
                    <td className="py-1.5 font-medium">{s.source}</td>
                    <td className="text-right tabular-nums">{s.leads}</td>
                    <td className="text-right tabular-nums">{s.measurements}</td>
                    <td className="text-right tabular-nums font-semibold">{s.orders}</td>
                    <td className="text-right tabular-nums">{s.value ? money(s.value) : "—"}</td>
                    <td className="text-right tabular-nums">{data.finance ? (s.spend == null ? "—" : money(s.spend)) : "🔒"}</td>
                    <td className={`text-right tabular-nums font-semibold ${s.romi == null ? "" : s.romi >= 250 ? "text-success" : s.romi >= 0 ? "text-warning" : "text-destructive"}`}>{s.romi == null ? "—" : `${s.romi}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-muted-foreground">ROMI = (сума замовлень джерела − витрати Finmap на рекламу джерела) / витрати × 100%.</p>
          </div>
        </div>
      ) : null}

      {data ? (
        <div className="overflow-x-auto">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">По місяцях</div>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="py-1 text-left">Місяць</th><th className="text-right">Замовл.</th><th className="text-right">Сума</th><th className="text-right">Надходження</th><th className="text-right">Витрати</th><th className="text-right">Прибуток (кеш)</th><th className="text-right">EBITDA</th><th className="text-right">Реклама</th></tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data.months.map((r) => (
                <tr key={r.month} className={r.month === month ? "bg-secondary/50" : ""}>
                  <td className="py-1.5">{mLabel(r.month)}</td>
                  <td className="text-right tabular-nums">{r.orders}</td>
                  <td className="text-right tabular-nums">{money(r.ordersValue)}</td>
                  <td className="text-right tabular-nums">{data.finance ? money(r.income) : "🔒"}</td>
                  <td className="text-right tabular-nums">{data.finance ? money(r.expense) : "🔒"}</td>
                  <td className={`text-right tabular-nums font-semibold ${(r.cashProfit ?? 0) < 0 ? "text-destructive" : ""}`}>{data.finance ? money(r.cashProfit) : "🔒"}</td>
                  <td className={`text-right tabular-nums font-semibold ${(r.ebitda ?? 0) < 0 ? "text-destructive" : ""}`}>{data.finance ? money(r.ebitda) : "🔒"}</td>
                  <td className="text-right tabular-nums">{data.finance ? money(r.marketing) : "🔒"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-muted-foreground">Прибуток (кеш) = надходження − витрати Finmap. EBITDA = те саме без податків, відсотків/кредитів, амортизації й дивідендів.</p>
        </div>
      ) : null}
    </section>
  );
}
