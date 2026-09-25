import { useMemo } from "react";
import { formatUah } from "@/lib/screed-calc";
import { aggregateMonthlyStock } from "@/lib/warehouse-calc";
import { WarehouseKpi } from "./WarehouseShell";

const MONTH_UA = [
  "січень", "лютий", "березень", "квітень", "травень", "червень",
  "липень", "серпень", "вересень", "жовтень", "листопад", "грудень",
];

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  return `${MONTH_UA[idx] ?? m} ${y}`;
}

export function MonthlyReportPanel({ docs }: { docs: any[] }) {
  const rows = useMemo(() => aggregateMonthlyStock(docs), [docs]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          inValue: a.inValue + r.inValue,
          outValue: a.outValue + r.outValue,
        }),
        { inValue: 0, outValue: 0 },
      ),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <WarehouseKpi label="Прихід (сума)" value={formatUah(totals.inValue)} />
        <WarehouseKpi label="Видача (сума)" value={formatUah(totals.outValue)} />
        <WarehouseKpi
          label="Сальдо вартості"
          value={formatUah(totals.inValue - totals.outValue)}
          tone={totals.inValue - totals.outValue < 0 ? "warn" : "good"}
        />
        <WarehouseKpi label="Місяців у звіті" value={String(rows.length)} />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Місяць</th>
                <th className="text-right px-3 py-2">Прихід, к-сть</th>
                <th className="text-right px-3 py-2">Прихід, ₴</th>
                <th className="text-right px-3 py-2">Видача, к-сть</th>
                <th className="text-right px-3 py-2">Видача, ₴</th>
                <th className="text-right px-3 py-2">Сальдо, к-сть</th>
                <th className="text-right px-3 py-2">Сальдо, ₴</th>
                <th className="text-right px-3 py-2">Док. ±</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    Немає проведених документів приходу/видачі для звіту.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.month} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-3 py-2 font-semibold capitalize">{monthLabel(r.month)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.inQty.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUah(r.inValue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.outQty.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUah(r.outValue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {r.netQty.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">
                    {formatUah(r.netValue)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                    {r.docsIn}/{r.docsOut}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
