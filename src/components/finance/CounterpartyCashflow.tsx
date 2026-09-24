/**
 * Спільний блок «Доходи і витрати по контрагентах».
 * Один компонент для заявок, лідів, клієнтів, замірів, замовлень і контрагентів —
 * дані приходять з канонічної серверної функції, без власних формул.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Banknote, ArrowDownRight, ArrowUpRight, Loader2, Users } from "lucide-react";
import { getCounterpartyCashflow, type CashflowScope } from "@/lib/finance/counterparty.functions";

const nf = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const money = (v: number) => `${nf.format(Math.round(v))} ₴`;
const fmtDate = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("uk-UA");
};

export function CounterpartyCashflow({
  scope, id, title = "Гроші по контрагентах", compact = false,
}: { scope: CashflowScope; id: string; title?: string; compact?: boolean }) {
  const fn = useServerFn(getCounterpartyCashflow);
  const { data, isLoading, error } = useQuery({
    queryKey: ["counterparty-cashflow", scope, id],
    queryFn: () => fn({ data: { scope, id } }),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="panel p-4 text-xs text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Завантаження фінансів…
      </div>
    );
  }
  if (error) return <div className="panel p-4 text-xs text-destructive">Не вдалося завантажити фінанси</div>;
  if (!data) return null;
  if (!data.access) {
    return <div className="panel p-4 text-xs text-muted-foreground">Немає доступу до фінансових даних</div>;
  }

  const rows = data.counterparties;
  const noLink = !data.resolved.order_id && !data.resolved.client_id && !data.resolved.counterparty_id;

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black inline-flex items-center gap-2">
          <Banknote className="w-4 h-4 text-primary" /> {title}
        </h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Finmap · факт</span>
      </div>

      {noLink ? (
        <p className="text-xs text-muted-foreground">
          {data.note ?? "Немає звʼязку із замовленням або клієнтом"} — немає даних для показу.
        </p>
      ) : rows.length === 0 && data.totals.count === 0 ? (
        <p className="text-xs text-muted-foreground">Операцій не знайдено.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Надходження" value={money(data.totals.income)} tone="text-success" Icon={ArrowDownRight} />
            <Stat label="Витрати" value={money(data.totals.expense)} tone="text-destructive" Icon={ArrowUpRight} />
            <Stat label="Сальдо" value={money(data.totals.net)} tone={data.totals.net >= 0 ? "text-success" : "text-destructive"} Icon={Users} />
          </div>

          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1.5 text-left">Контрагент</th>
                    <th className="py-1.5 text-right">Надходження</th>
                    <th className="py-1.5 text-right">Витрати</th>
                    <th className="py-1.5 text-right">Операцій</th>
                    <th className="py-1.5 text-right">Остання</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, compact ? 5 : 30).map((c) => (
                    <tr key={c.counterparty_id} className="border-b border-border/50">
                      <td className="py-1.5 pr-2">
                        <span className="font-semibold">{c.name}</span>
                        {c.client_id ? (
                          <Link to="/clients/$id" params={{ id: c.client_id }} className="ml-2 text-primary hover:underline">клієнт</Link>
                        ) : null}
                      </td>
                      <td className="py-1.5 text-right text-success">{c.income ? money(c.income) : "—"}</td>
                      <td className="py-1.5 text-right text-destructive">{c.expense ? money(c.expense) : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{c.count}</td>
                      <td className="py-1.5 text-right text-muted-foreground">{fmtDate(c.last_op)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {data.withoutCounterparty.count ? (
            <p className="text-[11px] text-muted-foreground">
              Без контрагента: {data.withoutCounterparty.count} оп. · надходження {money(data.withoutCounterparty.income)} · витрати {money(data.withoutCounterparty.expense)}.
              {" "}Привʼязати можна в{" "}
              <Link to="/reports/finmap" className="text-primary hover:underline">звірці Finmap</Link>.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone, Icon }: { label: string; value: string; tone: string; Icon: any }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`mt-0.5 text-sm font-black ${tone}`}>{value}</div>
    </div>
  );
}
