/**
 * «Звірка з Finmap»: помісячне порівняння фактичних операцій ERP із живими даними Finmap
 * (Europe/Kyiv, тільки затверджені, без видалених у Finmap) + запуск перевірки видалених.
 */
import { Fragment, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getFinmapMonthlyReconciliation, runFinmapReconcileNow } from "@/lib/finance/finmap.functions";
import { kyivToday } from "@/lib/kyiv-time";

const nf = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const KINDS = [["income", "Доходи"], ["expense", "Витрати"], ["transfer", "Перекази"]] as const;

function defaultFrom() {
  const t = kyivToday();
  const d = new Date(`${t.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().slice(0, 10);
}

export function FinmapMonthlyReconcile() {
  const [range, setRange] = useState({ from: defaultFrom(), to: kyivToday() });
  const [open, setOpen] = useState<string | null>(null);
  const load = useServerFn(getFinmapMonthlyReconciliation);
  const run = useServerFn(runFinmapReconcileNow);
  const q = useQuery({
    queryKey: ["finmap-monthly-reconcile", range.from, range.to],
    queryFn: () => load({ data: range }),
    enabled: false,
    retry: false,
  });
  const rec = useMutation({
    mutationFn: () => run({ data: range }),
    onSuccess: (r) => {
      toast[r.status === "ok" ? "success" : "error"](
        r.status === "ok" ? `Позначено видаленими: ${r.deleted.length}, відновлено: ${r.restored.length}` : (r.message ?? "Помилка"),
      );
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  return (
    <div className="crm-panel p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-black">Звірка з Finmap</h3>
          <p className="text-[11px] text-muted-foreground">Фактичні операції за київським часом. Finmap — живий запит.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="h-8 rounded-md border border-border bg-background px-2" />
          <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="h-8 rounded-md border border-border bg-background px-2" />
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Звіряю…" : "Звірити"}</Button>
          <Button size="sm" onClick={() => rec.mutate()} disabled={rec.isPending}>{rec.isPending ? "Перевіряю…" : "Перевірити видалені"}</Button>
        </div>
      </div>

      {q.isError && <p className="mt-3 text-xs text-destructive">{(q.error as any)?.message ?? "Немає доступу"}</p>}
      {!q.data && !q.isFetching && !q.isError && <p className="mt-3 text-xs text-muted-foreground">Натисніть «Звірити».</p>}
      {q.data && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] text-muted-foreground">
              <tr>
                <th className="p-1.5 text-left">Місяць</th>
                {KINDS.map(([k, l]) => <th key={k} className="p-1.5 text-right">{l}: ERP / Finmap</th>)}
                <th className="p-1.5 text-right">Статус</th>
              </tr>
            </thead>
            <tbody>
              {q.data.months.map((m) => (
                <Fragment key={m.month}>
                  <tr className="border-t border-border">
                    <td className="p-1.5 font-semibold">{m.month.slice(5)}.{m.month.slice(0, 4)}</td>
                    {KINDS.map(([k]) => {
                      const same = m.erp[k].count === m.finmap[k].count && Math.abs(m.erp[k].sum - m.finmap[k].sum) < 1;
                      return (
                        <td key={k} className={`p-1.5 text-right ${same ? "" : "text-destructive"}`}>
                          {m.erp[k].count} / {m.finmap[k].count}
                          <div className="text-[10px] text-muted-foreground">{nf.format(m.erp[k].sum)} / {nf.format(m.finmap[k].sum)} ₴</div>
                        </td>
                      );
                    })}
                    <td className="p-1.5 text-right">
                      {m.ok ? <span className="font-semibold text-success">OK</span> : (
                        <button className="font-semibold text-destructive underline" onClick={() => setOpen(open === m.month ? null : m.month)}>
                          Розбіжність ({m.diffIds.length})
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === m.month && (
                    <tr>
                      <td colSpan={5} className="p-1.5">
                        <ul className="max-h-48 overflow-auto rounded-md border border-border p-2 font-mono text-[10px]">
                          {m.diffIds.map((d) => <li key={d.finmap_id}>{d.finmap_id} — {d.issue}</li>)}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
