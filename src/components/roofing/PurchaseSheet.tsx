import type { RoofLine } from "@/lib/roofing-calc";
import { formatUah, formatNum } from "@/lib/screed-calc";
import { ShoppingCart } from "lucide-react";

/**
 * Закупочна відомість (для закупника).
 * Розрахункова витрата і рекомендована закупівля — завжди окремі колонки.
 */
export function PurchaseSheet({
  lines,
  isInternal,
  estimateNumber,
}: {
  lines: RoofLine[];
  isInternal: boolean;
  estimateNumber?: string;
}) {
  const materials = lines.filter((l) => l.block === "materials");
  const buyTotal = materials.reduce((s, l) => s + l.cost, 0);

  return (
    <section className="panel p-4 md:p-5 space-y-4">
      <header className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-primary/10 text-primary grid place-items-center">
          <ShoppingCart className="w-4 h-4" />
        </div>
        <div>
          <h2 className="font-bold text-sm uppercase tracking-wider text-primary">
            Закупочна відомість
          </h2>
          <p className="text-xs text-muted-foreground">
            {estimateNumber ? `${estimateNumber} · ` : ""}Розрахункова витрата і рекомендована
            закупівля по фасовці
          </p>
        </div>
      </header>

      {materials.length === 0 ? (
        <p className="text-sm text-muted-foreground">Немає матеріалів у розрахунку.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-2 pr-2">Позиція</th>
                <th className="py-2 px-2 text-right">Розрахунок</th>
                <th className="py-2 px-2 text-right">Рекоменд. закупівля</th>
                {isInternal && <th className="py-2 px-2 text-right">Ціна закупки</th>}
                {isInternal && <th className="py-2 pl-2 text-right">Сума закупки</th>}
              </tr>
            </thead>
            <tbody>
              {materials.map((l) => (
                <tr key={l.key} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-2">
                    <div className="font-medium">{l.name}</div>
                    {l.note && <div className="text-[11px] text-muted-foreground mt-0.5">{l.note}</div>}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                    {formatNum(l.qty, 2)} {l.unit}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                    {l.purchaseQty != null
                      ? `${formatNum(l.purchaseQty, 2)} ${l.purchaseUnit ?? l.unit}`
                      : "—"}
                  </td>
                  {isInternal && (
                    <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                      {formatUah(l.costPerUnit)}
                    </td>
                  )}
                  {isInternal && (
                    <td className="py-2 pl-2 text-right tabular-nums whitespace-nowrap font-semibold">
                      {formatUah(l.cost)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {isInternal && (
              <tfoot>
                <tr className="font-bold">
                  <td className="py-2 pr-2" colSpan={4}>
                    Разом закупівля матеріалів
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums text-primary">
                    {formatUah(buyTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Рекомендована закупівля округлена вгору до заводської фасовки (рулони, відра, балони,
        2-метрові елементи) і не впливає на суму кошторису.
      </p>
    </section>
  );
}
