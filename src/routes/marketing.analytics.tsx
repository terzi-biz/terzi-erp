import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell, Panel, EmptyState, fmtMoney, fmtNum, fmtPct } from "@/components/marketing/MarketingShell";
import { getMarketingEconomics } from "@/lib/marketing/economics.functions";
import { TIMING_LABELS, type TimingMode } from "@/lib/marketing/economics";

export const Route = createFileRoute("/marketing/analytics")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [
    { title: "Аналітика — Маркетинг TERZI" },
    { name: "description", content: "Наскрізна аналітика TERZI: витрати, CPL, CAC, виручка, валовий прибуток і дві бази ROMI за каналами й кампаніями." },
    { property: "og:title", content: "Аналітика — Маркетинг TERZI" },
    { property: "og:description", content: "Шлях від каналу до валового прибутку: когортний і касовий режими." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: AnalyticsPage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** «Немає даних» — не нуль і не прогноз. */
const dash = (v: number | null, fmt: (n: number) => string) => (v === null ? "—" : fmt(v));

function AnalyticsPage() {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(now));
  const [dim, setDim] = useState<"channel" | "campaign">("channel");
  const [timing, setTiming] = useState<TimingMode>("cohort");

  const econFn = useServerFn(getMarketingEconomics);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["mkt", "economics", from, to, dim, timing],
    queryFn: () => econFn({ data: { from, to, dim, timing } }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? null;
  const internal = data?.internal ?? false;

  const romiClass = (v: number | null) => (v === null ? "" : v < 0 ? "text-destructive" : "text-success");

  return (
    <MarketingShell
      title="Аналітика"
      subtitle="Канал → заявка → замір → договір → гроші → валовий прибуток → окупність"
    >
      <div className="dashboard-toolbar toolbar-scroll p-2 flex-wrap gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        <select value={dim} onChange={(e) => setDim(e.target.value as "channel" | "campaign")} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
          <option value="channel">За каналами</option>
          <option value="campaign">За кампаніями</option>
        </select>
        <select value={timing} onChange={(e) => setTiming(e.target.value as TimingMode)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
          <option value="cohort">{TIMING_LABELS.cohort}</option>
          <option value="cash">{TIMING_LABELS.cash}</option>
        </select>
      </div>

      <p className="text-[11px] text-muted-foreground px-1">
        {timing === "cohort"
          ? "Когорта: беруться заявки цього періоду разом з усіма їхніми грошима, навіть якщо оплата пройшла пізніше."
          : "Каса: беруться фактичні надходження й витрати цього періоду, розкручені назад до каналу заявки."}
        {!internal ? " Собівартість і валовий прибуток доступні лише з фінансовим доступом." : ""}
      </p>

      <Panel title={`Ефективність — ${TIMING_LABELS[timing]}`}>
        {isLoading ? <EmptyState text="Завантаження…" /> : isError ? <EmptyState text="Немає доступу до даних аналітики" /> : rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left py-1">{dim === "channel" ? "Канал" : "Кампанія"}</th>
                  <th className="text-right">Витрати</th>
                  <th className="text-right">Заявки</th>
                  <th className="text-right">Цільові</th>
                  <th className="text-right">Заміри</th>
                  <th className="text-right">Договори</th>
                  <th className="text-right">CPL</th>
                  <th className="text-right">CPQL</th>
                  <th className="text-right">CAC</th>
                  <th className="text-right">Виручка</th>
                  {internal ? <th className="text-right">Собівартість</th> : null}
                  {internal ? <th className="text-right">Валовий прибуток</th> : null}
                  {internal ? <th className="text-right">GP маржа</th> : null}
                  <th className="text-right">ROMI (виручка)</th>
                  {internal ? <th className="text-right">ROMI (GP)</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-border/60">
                    <td className="py-1.5">{r.label}</td>
                    <td className="text-right tabular-nums">{fmtMoney(r.spend)}</td>
                    <td className="text-right tabular-nums">{fmtNum(r.leads)}</td>
                    <td className="text-right tabular-nums">{fmtNum(r.qualified)}</td>
                    <td className="text-right tabular-nums">{fmtNum(r.measurements)}</td>
                    <td className="text-right tabular-nums">{fmtNum(r.contracts)}</td>
                    <td className="text-right tabular-nums">{dash(r.cpl, fmtMoney)}</td>
                    <td className="text-right tabular-nums">{dash(r.cpql, fmtMoney)}</td>
                    <td className="text-right tabular-nums">{dash(r.cac, fmtMoney)}</td>
                    <td className="text-right tabular-nums">{dash(r.revenueFact, fmtMoney)}</td>
                    {internal ? <td className="text-right tabular-nums">{r.revenueFact === null ? "—" : fmtMoney(r.directCost)}</td> : null}
                    {internal ? <td className="text-right tabular-nums">{dash(r.grossProfit, fmtMoney)}</td> : null}
                    {internal ? <td className="text-right tabular-nums">{dash(r.grossMargin, fmtPct)}</td> : null}
                    <td className={`text-right tabular-nums ${romiClass(r.romiRevenue)}`}>{dash(r.romiRevenue, fmtPct)}</td>
                    {internal ? <td className={`text-right tabular-nums ${romiClass(r.romiGross)}`}>{dash(r.romiGross, fmtPct)}</td> : null}
                  </tr>
                ))}
                {total ? (
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-1.5">Разом</td>
                    <td className="text-right tabular-nums">{fmtMoney(total.spend)}</td>
                    <td className="text-right tabular-nums">{fmtNum(total.leads)}</td>
                    <td className="text-right tabular-nums">{fmtNum(total.qualified)}</td>
                    <td className="text-right tabular-nums">{fmtNum(total.measurements)}</td>
                    <td className="text-right tabular-nums">{fmtNum(total.contracts)}</td>
                    <td className="text-right tabular-nums">{dash(total.cpl, fmtMoney)}</td>
                    <td className="text-right tabular-nums">{dash(total.cpql, fmtMoney)}</td>
                    <td className="text-right tabular-nums">{dash(total.cac, fmtMoney)}</td>
                    <td className="text-right tabular-nums">{dash(total.revenueFact, fmtMoney)}</td>
                    {internal ? <td className="text-right tabular-nums">{total.revenueFact === null ? "—" : fmtMoney(total.directCost)}</td> : null}
                    {internal ? <td className="text-right tabular-nums">{dash(total.grossProfit, fmtMoney)}</td> : null}
                    {internal ? <td className="text-right tabular-nums">{dash(total.grossMargin, fmtPct)}</td> : null}
                    <td className={`text-right tabular-nums ${romiClass(total.romiRevenue)}`}>{dash(total.romiRevenue, fmtPct)}</td>
                    {internal ? <td className={`text-right tabular-nums ${romiClass(total.romiGross)}`}>{dash(total.romiGross, fmtPct)}</td> : null}
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text="Немає даних за період" />}
      </Panel>

      {data ? (
        <p className="text-[10px] text-muted-foreground px-1">
          Заявок без атрибуції: {fmtNum(data.unattributedLeads)}. Замовлень у вибірці: {fmtNum(data.ordersInPeriod)}.
          Виручка й собівартість — лише підтверджені рухи Finmap по замовленнях; без оплат показується «—».
        </p>
      ) : null}
    </MarketingShell>
  );
}
