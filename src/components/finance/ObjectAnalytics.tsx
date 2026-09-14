/**
 * Аналітика по об'єктах: доходи, витрати, прибуток, план/факт
 * і розподіл за проєктами Finmap, статтями, напрямками та замовленнями.
 *
 * Усі числа — серверні детерміновані агрегати (Finmap факт + канонічний кошторис).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { formatUah } from "@/lib/screed-calc";
import { getObjectAnalytics } from "@/lib/finance/order-finance.functions";
import { Metric, type Period } from "./sections";
import { moduleLabel } from "@/lib/modules";

const card = "rounded-2xl border border-border bg-card shadow-sm";
const thead = "bg-secondary/60 text-[11px] uppercase tracking-wider text-muted-foreground";
const note = "rounded-2xl border border-dashed border-border p-3 text-xs text-muted-foreground";
const btn = "rounded-xl px-3 py-1.5 text-xs font-semibold";

const money = (v: number) => formatUah(v);
const delta = (v: number) => (v >= 0 ? `+${formatUah(v)}` : formatUah(v));
const tone = (v: number) => (v >= 0 ? "text-emerald-600" : "text-destructive");

type Dim = "project" | "category" | "service";
const DIMS: { key: Dim; label: string }[] = [
  { key: "project", label: "За проєктами" },
  { key: "category", label: "За статтями" },
  { key: "service", label: "За напрямками" },
];

export function ObjectAnalyticsSection({ period }: { period: Period }) {
  const fn = useServerFn(getObjectAnalytics);
  const [whole, setWhole] = useState(true);
  const [dim, setDim] = useState<Dim>("project");

  const { data, isLoading, error } = useQuery({
    queryKey: ["object-analytics", period.from, period.to, whole],
    queryFn: () => fn({ data: { from: period.from, to: period.to, whole_period: whole } }),
  });

  if (error) return <div className="rounded-2xl border border-destructive/40 p-4 text-sm text-destructive">{(error as Error).message}</div>;
  if (isLoading || !data) return <div className={note}>Рахуємо аналітику по об'єктах…</div>;

  const t = data.totals;
  const dimRows =
    dim === "project" ? data.byProject : dim === "category" ? data.byCategory : data.byService;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setWhole((v) => !v)}
          className={`${btn} border border-border ${whole ? "bg-primary text-primary-foreground" : "bg-card"}`}>
          {whole ? "За весь час" : `Період ${period.from} – ${period.to}`}
        </button>
        <span className="text-xs text-muted-foreground">
          Факт — за управлінським періодом операції, план — з канонічного кошторису замовлення.
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Metric title="Дохід (факт)" value={money(t.factRevenue)} tone="good" hint={`План ${money(t.planRevenue)}`} />
        <Metric title="Витрати (факт)" value={money(t.factCost)} tone="bad" hint={`План ${money(t.planCost)}`} />
        <Metric title="Прибуток (факт)" value={money(t.factProfit)} tone={t.factProfit >= 0 ? "good" : "bad"}
          hint={`План ${money(t.planProfit)}`} />
        <Metric title="Відхилення прибутку" value={delta(t.factProfit - t.planProfit)} tone="warn" />
        <Metric title="Об'єктів з рухом грошей" value={String(t.objects)} />
      </div>

      {(data.unallocated.income > 0 || data.unallocated.expense > 0) && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-3 text-xs">
          Не привʼязано до об'єктів: дохід {money(data.unallocated.income)}, витрати {money(data.unallocated.expense)}.
          Це може бути адміністрація, податки чи маркетинг — потребує перевірки, а не автоматичної привʼязки.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {DIMS.map((d) => (
          <button key={d.key} type="button" onClick={() => setDim(d.key)}
            className={`${btn} border border-border ${dim === d.key ? "bg-primary text-primary-foreground" : "bg-card"}`}>
            {d.label}
          </button>
        ))}
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className={thead}>
            <tr>
              <th className="px-3 py-2 text-left">{dim === "project" ? "Проєкт" : dim === "category" ? "Стаття" : "Напрямок"}</th>
              <th className="px-3 py-2 text-right">Дохід</th>
              <th className="px-3 py-2 text-right">Витрати</th>
              <th className="px-3 py-2 text-right">Прибуток</th>
              <th className="px-3 py-2 text-right">Операцій</th>
            </tr>
          </thead>
          <tbody>
            {!dimRows.length && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">Даних за цим розрізом немає.</td></tr>
            )}
            {dimRows.map((r: any) => (
              <tr key={r.key} className="border-t border-border/70">
                <td className="px-3 py-2 font-semibold">
                  {dim === "service" ? moduleLabel(r.label) || r.label : r.label}
                  {dim === "category" && r.cost_class && (
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">{r.cost_class}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.income)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(r.expense)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${tone(r.profit)}`}>{money(r.profit)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.ops}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[900px] text-sm">
          <thead className={thead}>
            <tr>
              <th className="px-3 py-2 text-left">Об'єкт</th>
              <th className="px-3 py-2 text-right">План виручки</th>
              <th className="px-3 py-2 text-right">Факт виручки</th>
              <th className="px-3 py-2 text-right">План витрат</th>
              <th className="px-3 py-2 text-right">Факт витрат</th>
              <th className="px-3 py-2 text-right">Прибуток план</th>
              <th className="px-3 py-2 text-right">Прибуток факт</th>
              <th className="px-3 py-2 text-right">Відхилення</th>
              <th className="px-3 py-2 text-right">Маржа факт</th>
            </tr>
          </thead>
          <tbody>
            {!data.orders.length && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-muted-foreground">Операцій по об'єктах ще немає.</td></tr>
            )}
            {data.orders.map((o: any) => (
              <tr key={o.order_id} className="border-t border-border/70 hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link to="/orders/$id" params={{ id: o.order_id }} search={{ tab: "finance" } as any}
                    className="font-semibold text-primary hover:underline">
                    {o.number ?? o.name ?? "Без номера"}
                  </Link>
                  <div className="text-[11px] text-muted-foreground">{o.client ?? o.address ?? "—"}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{o.planRevenue ? money(o.planRevenue) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(o.factRevenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{o.planCost ? money(o.planCost) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(o.factCost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{o.planRevenue ? money(o.planProfit) : "—"}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${tone(o.factProfit)}`}>{money(o.factProfit)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${tone(o.profitVariance)}`}>
                  {o.planRevenue ? delta(o.profitVariance) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{o.marginFact == null ? "—" : `${o.marginFact.toFixed(1)} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
