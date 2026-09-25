import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { formatUah } from "@/lib/screed-calc";
import { availableQty, isBelowMin } from "@/lib/warehouse-calc";
import { whInput } from "./ui";

export function StockTable({ items, isLoading }: { items: any[]; isLoading: boolean }) {
  const [q, setQ] = useState("");
  const rows = items.filter(
    (i) => !q || `${i.name} ${i.sku ?? ""} ${i.category ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Пошук по номенклатурі…"
        className={`${whInput} max-w-md`}
      />
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Позиція</th>
                <th className="text-left px-3 py-2">Категорія</th>
                <th className="text-right px-3 py-2">Залишок</th>
                <th className="text-right px-3 py-2">Резерв</th>
                <th className="text-right px-3 py-2">Вільно</th>
                <th className="text-right px-3 py-2">Сер. собівартість</th>
                <th className="text-right px-3 py-2">Вартість</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Завантаження…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    Номенклатура порожня — додайте позиції у розділі «Склади».
                  </td>
                </tr>
              )}
              {rows.map((i) => {
                const low = isBelowMin(Number(i.qty) || 0, Number(i.min_qty) || 0);
                return (
                  <tr key={i.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-3 py-2">
                      <div className="font-semibold flex items-center gap-2">
                        {low && <AlertTriangle className="w-3.5 h-3.5 text-warning" />}
                        {i.name}
                      </div>
                      {i.sku && <div className="text-[11px] text-muted-foreground font-mono">{i.sku}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{i.category ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {Number(i.qty).toFixed(2)} {i.unit}
                    </td>
                    <td className="px-3 py-2 text-right text-warning">{Number(i.reserved_qty).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{availableQty(i).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">
                      {i.avg_cost == null ? (
                        <span className="text-xs text-muted-foreground">немає даних</span>
                      ) : (
                        formatUah(Number(i.avg_cost))
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {i.avg_cost == null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        formatUah((Number(i.qty) || 0) * Number(i.avg_cost))
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
