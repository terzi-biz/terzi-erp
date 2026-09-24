/**
 * Реєстр контрагентів: доходи і витрати Finmap за період,
 * привʼязка до клієнтів і кількість обʼєктів.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { listCounterpartyLedger } from "@/lib/finance/counterparty.functions";
import { useReportPeriod, PeriodBar, KpiRow, money } from "@/components/reports/report-shell";

export const Route = createFileRoute("/reports/counterparties")({
  component: CounterpartiesReport,
  head: () => ({
    meta: [
      { title: "Контрагенти · Звіти TERZI" },
      { name: "description", content: "Доходи і витрати TERZI у розрізі контрагентів за період." },
      { property: "og:title", content: "Контрагенти · Звіти TERZI" },
      { property: "og:description", content: "Доходи і витрати TERZI у розрізі контрагентів за період." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CounterpartiesReport() {
  const { period } = useReportPeriod();
  const [search, setSearch] = useState("");
  const fn = useServerFn(listCounterpartyLedger);
  const { data, isLoading } = useQuery({
    queryKey: ["counterparty-ledger", period.from, period.to, search],
    queryFn: () => fn({ data: { from: period.from, to: period.to, search: search || undefined } }),
  });

  return (
    <div className="space-y-4">
      <PeriodBar />

      {isLoading ? (
        <div className="panel p-6 text-sm text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Рахуємо контрагентів…
        </div>
      ) : !data?.access ? (
        <div className="panel p-6 text-sm text-muted-foreground">Немає доступу до фінансових даних.</div>
      ) : (
        <>
          <KpiRow
            items={[
              { label: "Надходження", value: money(data.totals.income) },
              { label: "Витрати", value: money(data.totals.expense) },
              { label: "Сальдо", value: money(data.totals.net) },
              { label: "Операцій", value: String(data.totals.count) },
            ]}
          />

          <div className="panel p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-black">Контрагенти</h2>
              <label className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Пошук за назвою або клієнтом"
                  className="w-56 bg-transparent text-xs outline-none"
                />
              </label>
            </div>

            {data.rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">За період операцій із контрагентами немає.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-1.5 text-left">Контрагент</th>
                      <th className="py-1.5 text-left">Клієнт</th>
                      <th className="py-1.5 text-right">Надходження</th>
                      <th className="py-1.5 text-right">Витрати</th>
                      <th className="py-1.5 text-right">Сальдо</th>
                      <th className="py-1.5 text-right">Обʼєктів</th>
                      <th className="py-1.5 text-right">Операцій</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((c) => (
                      <tr key={c.counterparty_id} className="border-b border-border/50">
                        <td className="py-1.5 pr-2 font-semibold">{c.name}</td>
                        <td className="py-1.5 pr-2">
                          {c.client_id ? (
                            <Link to="/clients/$id" params={{ id: c.client_id }} className="text-primary hover:underline">
                              {c.client_name ?? "Клієнт"}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">немає звʼязку</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right text-success">{c.income ? money(c.income) : "—"}</td>
                        <td className="py-1.5 text-right text-destructive">{c.expense ? money(c.expense) : "—"}</td>
                        <td className={`py-1.5 text-right font-bold ${c.net >= 0 ? "text-success" : "text-destructive"}`}>{money(c.net)}</td>
                        <td className="py-1.5 text-right tabular-nums">{c.orders || "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.unlinked.count ? (
              <p className="text-[11px] text-muted-foreground">
                Без контрагента: {data.unlinked.count} оп. · надходження {money(data.unlinked.income)} · витрати {money(data.unlinked.expense)}.
                {" "}Привʼязати можна у <Link to="/reports/finmap" className="text-primary hover:underline">звірці Finmap</Link>.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
